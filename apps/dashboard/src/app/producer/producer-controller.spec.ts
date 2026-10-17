import { MarketUpdate, MAX_BATCH, TRADE_UPDATE_I32_FIELD_COUNT } from '@findev/producer';
import { ProducerSettings } from '../settings/producer-settings';
import { createAccumulators } from './metrics';
import { ProducerController, scheduleInterval } from './producer-controller';
import { Engine } from './producer-engine';
import {
  ProducerCommand,
  ProducerEvent,
  SNAPSHOT_FIELD,
  SnapshotEvent,
  StartCommand,
} from './producer-events';
import { encodeUpdates } from './testing/encode-updates';

// Every generated update is this trade on the first instrument, so volume is easy to predict.
const TRADE: MarketUpdate = {
  instrumentIndex: 0,
  priceCents: 10000,
  tradeQty: 5,
  bidCents: 9999,
  askCents: 10000,
  bidQty: 200,
  askQty: 100,
};

/** Records its calls and returns batches of TRADE, reusing one buffer like the real engine. */
class FakeEngine implements Engine {
  readonly inits: { instrumentCount: number; seed: number }[] = [];
  readonly batchSizes: number[] = [];
  failure: Error | null = null;
  readonly #buffer = new Int32Array(MAX_BATCH * TRADE_UPDATE_I32_FIELD_COUNT);

  init(instrumentCount: number, seed: number): void {
    this.inits.push({ instrumentCount, seed });
  }

  simulateTradeBatch(batchSize: number): Int32Array {
    if (this.failure) {
      throw this.failure;
    }
    this.batchSizes.push(batchSize);
    const batch = encodeUpdates(Array.from({ length: batchSize }, () => TRADE));
    this.#buffer.set(batch);
    return this.#buffer.subarray(0, batch.length);
  }
}

describe('ProducerController', () => {
  const SETTINGS: ProducerSettings = {
    instrumentCount: 2,
    updatesPerBatch: 3,
    batchIntervalMs: 500,
  };
  const INTERVAL_MS = SETTINGS.batchIntervalMs;
  const SEED = 42;
  const NEW_SEED = 7;
  const RUN_ID = 1;
  const NEW_RUN_ID = 2;
  const BATCH_COUNT = 3;
  const MANY_INTERVALS = 10;
  const LOAD_ERROR = 'Could not fetch producer Wasm from producer.wasm: HTTP 404 Not Found';
  const GENERATE_ERROR = 'producer.wasm aborted: assertion failed';

  const start = (runId = RUN_ID, seed = SEED): StartCommand => ({
    type: 'start',
    runId,
    settings: SETTINGS,
    seed,
  });
  const pause = (runId = RUN_ID): ProducerCommand => ({ type: 'pause', runId });
  const resume = (runId = RUN_ID): ProducerCommand => ({ type: 'resume', runId });
  // Volume of the first instrument after `batches` batches of TRADE.
  const volumeAfter = (batches: number) => batches * SETTINGS.updatesPerBatch * TRADE.tradeQty;

  let engine: FakeEngine;
  let posted: { event: ProducerEvent; transfer: Transferable[] }[];

  beforeEach(() => {
    vi.useFakeTimers();
    engine = new FakeEngine();
    posted = [];
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const createController = (loading: Promise<Engine> = Promise.resolve(engine)) =>
    new ProducerController({
      engine: loading,
      scheduleRepeating: scheduleInterval,
      post: (event, transfer = []) => posted.push({ event, transfer }),
    });
  // Runs the pending timers in `ms`, and settles promises (such as the engine loading).
  const advance = (ms = 0) => vi.advanceTimersByTimeAsync(ms);
  async function readyController() {
    const controller = createController();
    await advance();
    return controller;
  }

  const events = () => posted.map(({ event }) => event);
  const lastEvent = () => events().at(-1);
  const snapshots = () => events().filter((event) => event.type === 'snapshot');
  const lastSnapshot = () => snapshots().at(-1)!;
  const firstVolume = (snapshot: SnapshotEvent) => snapshot.data[SNAPSHOT_FIELD.volume];

  it('posts ready once the engine has loaded', async () => {
    await readyController();

    expect(events()).toEqual([{ type: 'ready' }]);
  });

  it('reports a failed load as an init error with the loader message', async () => {
    createController(Promise.reject(new Error(LOAD_ERROR)));
    await advance();

    expect(events()).toEqual([{ type: 'error', phase: 'init', message: LOAD_ERROR }]);
  });

  it('starts a run: inits the engine, posts running and an empty snapshot', async () => {
    const controller = await readyController();
    controller.handle(start());

    expect(engine.inits).toEqual([{ instrumentCount: SETTINGS.instrumentCount, seed: SEED }]);
    expect(events().slice(1)).toEqual([
      { type: 'status', runId: RUN_ID, state: 'running' },
      {
        type: 'snapshot',
        runId: RUN_ID,
        seq: 0,
        totalUpdates: 0,
        batches: 0,
        data: createAccumulators(SETTINGS.instrumentCount),
      },
    ]);
  });

  it('generates updatesPerBatch updates every batchIntervalMs', async () => {
    const controller = await readyController();
    controller.handle(start());

    await advance(INTERVAL_MS - 1);
    expect(engine.batchSizes).toEqual([]);

    await advance(1 + (BATCH_COUNT - 1) * INTERVAL_MS);
    expect(engine.batchSizes).toEqual(Array(BATCH_COUNT).fill(SETTINGS.updatesPerBatch));
    expect(lastSnapshot()).toMatchObject({
      seq: BATCH_COUNT,
      batches: BATCH_COUNT,
      totalUpdates: BATCH_COUNT * SETTINGS.updatesPerBatch,
    });
    expect(firstVolume(lastSnapshot())).toBe(volumeAfter(BATCH_COUNT));
    // One interval drives every batch.
    expect(vi.getTimerCount()).toBe(1);
  });

  it('generates nothing while paused', async () => {
    const controller = await readyController();
    controller.handle(start());
    controller.handle(pause());

    await advance(MANY_INTERVALS * INTERVAL_MS);

    expect(engine.batchSizes).toEqual([]);
    expect(lastEvent()).toEqual({ type: 'status', runId: RUN_ID, state: 'paused' });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('resumes with the values and totals kept, without making up the paused time', async () => {
    const controller = await readyController();
    controller.handle(start());
    await advance(INTERVAL_MS);
    controller.handle(pause());
    await advance(MANY_INTERVALS * INTERVAL_MS);

    controller.handle(resume());
    expect(lastEvent()).toEqual({ type: 'status', runId: RUN_ID, state: 'running' });

    await advance(INTERVAL_MS);
    expect(engine.batchSizes).toHaveLength(2);
    expect(lastSnapshot()).toMatchObject({
      batches: 2,
      totalUpdates: 2 * SETTINGS.updatesPerBatch,
    });
    expect(firstVolume(lastSnapshot())).toBe(volumeAfter(2));
  });

  it('treats pause while paused and resume while running as no-ops', async () => {
    const controller = await readyController();
    controller.handle(start());
    controller.handle(resume());
    // A resume while running must not start a second tick loop.
    expect(vi.getTimerCount()).toBe(1);
    controller.handle(pause());
    controller.handle(pause());

    const statuses = events().filter((event) => event.type === 'status');
    expect(statuses.map((status) => status.state)).toEqual(['running', 'paused']);
  });

  it('resets totals and values on a new start, and runs it even after a pause', async () => {
    const controller = await readyController();
    controller.handle(start());
    await advance(INTERVAL_MS);
    controller.handle(pause());
    const postedBeforeNewRun = posted.length;

    controller.handle(start(NEW_RUN_ID, NEW_SEED));
    expect(engine.inits.at(-1)).toEqual({
      instrumentCount: SETTINGS.instrumentCount,
      seed: NEW_SEED,
    });
    expect(lastSnapshot()).toEqual({
      type: 'snapshot',
      runId: NEW_RUN_ID,
      seq: 0,
      totalUpdates: 0,
      batches: 0,
      data: createAccumulators(SETTINGS.instrumentCount),
    });

    await advance(INTERVAL_MS);
    expect(lastSnapshot()).toMatchObject({ runId: NEW_RUN_ID, batches: 1 });
    expect(firstVolume(lastSnapshot())).toBe(volumeAfter(1));
    // Nothing from the replaced run is posted after the new start.
    const newRunEvents = events().slice(postedBeforeNewRun);
    expect(newRunEvents.every((event) => 'runId' in event && event.runId === NEW_RUN_ID)).toBe(
      true,
    );
  });

  it('ignores a pause for a replaced run', async () => {
    const controller = await readyController();
    controller.handle(start(RUN_ID));
    controller.handle(start(NEW_RUN_ID));
    controller.handle(pause(RUN_ID));

    await advance(INTERVAL_MS);
    expect(engine.batchSizes).toHaveLength(1);
  });

  it('ignores a resume for a replaced run', async () => {
    const controller = await readyController();
    controller.handle(start(RUN_ID));
    controller.handle(start(NEW_RUN_ID));
    controller.handle(pause(NEW_RUN_ID));
    controller.handle(resume(RUN_ID));

    await advance(INTERVAL_MS);
    expect(engine.batchSizes).toEqual([]);
  });

  it('runs a start sent while loading, dropping an earlier start it overtook', async () => {
    let finishLoading!: (engine: Engine) => void;
    const controller = createController(new Promise((resolve) => (finishLoading = resolve)));
    controller.handle(start(RUN_ID, SEED));
    controller.handle(start(NEW_RUN_ID, NEW_SEED));
    expect(events()).toEqual([]);

    finishLoading(engine);
    await advance();

    expect(engine.inits).toEqual([{ instrumentCount: SETTINGS.instrumentCount, seed: NEW_SEED }]);
    expect(events().map((event) => event.type)).toEqual(['ready', 'status', 'snapshot']);
    expect(lastSnapshot().runId).toBe(NEW_RUN_ID);
  });

  it('posts each snapshot as a copy and transfers its buffer', async () => {
    const controller = await readyController();
    controller.handle(start());
    await advance(INTERVAL_MS);

    // Spoiling a posted snapshot must not affect the worker's own accumulators.
    lastSnapshot().data.fill(0);
    await advance(INTERVAL_MS);

    expect(firstVolume(lastSnapshot())).toBe(volumeAfter(2));
    for (const { event, transfer } of posted.filter(({ event }) => event.type === 'snapshot')) {
      expect(transfer).toEqual([(event as SnapshotEvent).data.buffer]);
    }
  });

  it('stops the run and posts a generate error when a batch fails', async () => {
    const controller = await readyController();
    controller.handle(start());
    await advance(INTERVAL_MS);
    engine.failure = new Error(GENERATE_ERROR);
    await advance(INTERVAL_MS);

    // The engine would work again, but the failed run must not ask it for more batches.
    engine.failure = null;
    await advance(MANY_INTERVALS * INTERVAL_MS);

    expect(engine.batchSizes).toHaveLength(1);
    expect(lastEvent()).toEqual({
      type: 'error',
      runId: RUN_ID,
      phase: 'generate',
      message: GENERATE_ERROR,
    });
    expect(events().filter((event) => event.type === 'error')).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('stops generating and ignores later commands after dispose', async () => {
    const controller = await readyController();
    controller.handle(start());
    controller.handle({ type: 'dispose' });
    const postedBeforeDispose = posted.length;

    controller.handle(start(NEW_RUN_ID));
    await advance(MANY_INTERVALS * INTERVAL_MS);

    expect(engine.inits).toHaveLength(1);
    expect(engine.batchSizes).toEqual([]);
    expect(posted).toHaveLength(postedBeforeDispose);
  });
});
