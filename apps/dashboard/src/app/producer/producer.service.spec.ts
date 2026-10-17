import { createEnvironmentInjector, EnvironmentInjector, inject } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MarketUpdate, tickerOf } from '@findev/producer';
import { DEFAULT_PRODUCER_SETTINGS, ProducerSettings } from '../settings/producer-settings';
import { ProducerSettingsStore } from '../settings/producer-settings-store';
import {
  accumulateBatch,
  createAccumulators,
  deriveMetrics,
  emptyInstrumentMetrics,
} from './metrics';
import { InstrumentMetrics, SnapshotEvent, StartCommand } from './producer-events';
import { ProducerService } from './producer.service';
import { encodeUpdates } from './testing/encode-updates';
import { FakeProducerWorker, provideFakeProducerWorker } from './testing/fake-producer-worker';

describe('ProducerService', () => {
  const FIRST_RUN_ID = 1;
  const SECOND_RUN_ID = 2;
  const THIRD_RUN_ID = 3;
  const FIRST = 0;
  // Valid settings that differ from the defaults in every field.
  const NEW_SETTINGS: ProducerSettings = {
    instrumentCount: 3,
    updatesPerBatch: 20,
    batchIntervalMs: 200,
  };
  const LOAD_ERROR = 'Could not fetch producer Wasm from producer.wasm: HTTP 404 Not Found';
  const WORKER_SCRIPT_ERROR = 'Uncaught SyntaxError: Unexpected token';
  const RUN_ERROR = 'producer.wasm aborted: assertion failed';

  // The task's worked example on the first instrument, as one batch: 10 @ $100.00, then
  // 30 @ $102.00, with a final book of bid $101.96 × 600 / ask $102.00 × 400.
  const WORKED_EXAMPLE_BATCH: MarketUpdate[] = [
    {
      instrumentIndex: FIRST,
      priceCents: 10000,
      tradeQty: 10,
      bidCents: 9996,
      askCents: 10000,
      bidQty: 500,
      askQty: 500,
    },
    {
      instrumentIndex: FIRST,
      priceCents: 10200,
      tradeQty: 30,
      bidCents: 10196,
      askCents: 10200,
      bidQty: 600,
      askQty: 400,
    },
  ];
  const WORKED_EXAMPLE_ROW: InstrumentMetrics = {
    ticker: tickerOf(FIRST),
    lastPriceCents: 10200,
    spreadCents: 4,
    cumulativeVolume: 40,
    vwapCents: 10150,
    imbalance: 0.2,
  };

  // What the worker posts after the first batch of a run with the default settings.
  const workedExampleSnapshot = (runId: number): SnapshotEvent => {
    const accumulators = createAccumulators(DEFAULT_PRODUCER_SETTINGS.instrumentCount);
    accumulateBatch(accumulators, encodeUpdates(WORKED_EXAMPLE_BATCH));
    return {
      type: 'snapshot',
      runId,
      seq: 1,
      totalUpdates: WORKED_EXAMPLE_BATCH.length,
      batches: 1,
      metrics: deriveMetrics(accumulators),
    };
  };

  let fakes: ReturnType<typeof provideFakeProducerWorker>;
  let service: ProducerService;

  beforeEach(() => {
    fakes = provideFakeProducerWorker();
    TestBed.configureTestingModule({ providers: fakes.providers });
    service = TestBed.inject(ProducerService);
  });

  const worker = () => fakes.workers.at(-1)!;
  const lastCommand = () => worker().posted.at(-1);
  const startCommand = (runId: number, settings: ProducerSettings): StartCommand => ({
    type: 'start',
    runId,
    settings,
    seed: expect.any(Number),
  });
  // The worker loads the Wasm and confirms the current run.
  const confirmRunning = () => {
    worker().emit({ type: 'ready' });
    worker().emit({ type: 'status', runId: service.runId(), state: 'running' });
  };
  const counters = () => ({ totalUpdates: service.totalUpdates(), batches: service.batches() });
  const NO_COUNTS = { totalUpdates: 0, batches: 0 };

  it('starts a run with the applied settings and an integer seed when created', () => {
    expect(worker().posted).toEqual([startCommand(FIRST_RUN_ID, DEFAULT_PRODUCER_SETTINGS)]);
    const { seed } = worker().posted[0] as StartCommand;
    expect(Number.isSafeInteger(seed) && seed >= 0).toBe(true);

    expect(service.status()).toBe('starting');
    expect(service.instruments()).toEqual(
      emptyInstrumentMetrics(DEFAULT_PRODUCER_SETTINGS.instrumentCount),
    );
    expect(counters()).toEqual(NO_COUNTS);
  });

  it('shows the rows and counters of a snapshot for the current run', () => {
    confirmRunning();
    worker().emit(workedExampleSnapshot(FIRST_RUN_ID));

    expect(service.status()).toBe('running');
    expect(service.instruments()).toEqual([
      WORKED_EXAMPLE_ROW,
      ...emptyInstrumentMetrics(DEFAULT_PRODUCER_SETTINGS.instrumentCount).slice(FIRST + 1),
    ]);
    expect(counters()).toEqual({ totalUpdates: WORKED_EXAMPLE_BATCH.length, batches: 1 });
  });

  it('resets the rows and counters at once when settings are applied, and starts a new run', () => {
    confirmRunning();
    worker().emit(workedExampleSnapshot(FIRST_RUN_ID));

    service.apply(NEW_SETTINGS);

    // Checked before the worker has posted anything for the new run.
    expect(service.instruments()).toEqual(emptyInstrumentMetrics(NEW_SETTINGS.instrumentCount));
    expect(counters()).toEqual(NO_COUNTS);
    expect(service.runId()).toBe(SECOND_RUN_ID);
    expect(service.status()).toBe('running');
    expect(lastCommand()).toEqual(startCommand(SECOND_RUN_ID, NEW_SETTINGS));
    expect(TestBed.inject(ProducerSettingsStore).appliedSettings()).toEqual(NEW_SETTINGS);
  });

  it('ignores a snapshot and a status still in flight from the previous run', () => {
    confirmRunning();
    service.apply(NEW_SETTINGS);

    worker().emit(workedExampleSnapshot(FIRST_RUN_ID));
    worker().emit({ type: 'status', runId: FIRST_RUN_ID, state: 'paused' });

    expect(service.instruments()).toEqual(emptyInstrumentMetrics(NEW_SETTINGS.instrumentCount));
    expect(counters()).toEqual(NO_COUNTS);
    expect(service.status()).toBe('running');
  });

  it('pauses and resumes the current run, keeping its rows', () => {
    confirmRunning();
    worker().emit(workedExampleSnapshot(FIRST_RUN_ID));
    const commandCount = worker().posted.length;

    // Nothing to resume while running.
    service.resume();
    expect(worker().posted).toHaveLength(commandCount);

    service.pause();
    expect(lastCommand()).toEqual({ type: 'pause', runId: FIRST_RUN_ID });
    expect(service.status()).toBe('paused');

    service.resume();
    expect(lastCommand()).toEqual({ type: 'resume', runId: FIRST_RUN_ID });
    expect(service.status()).toBe('running');
    expect(service.instruments()[FIRST]).toEqual(WORKED_EXAMPLE_ROW);
    expect(counters()).toEqual({ totalUpdates: WORKED_EXAMPLE_BATCH.length, batches: 1 });
  });

  it('starts a new running run when settings are applied while paused', () => {
    confirmRunning();
    service.pause();

    service.apply(NEW_SETTINGS);

    expect(lastCommand()).toEqual(startCommand(SECOND_RUN_ID, NEW_SETTINGS));
    expect(service.status()).toBe('running');
  });

  it.each([
    {
      failure: 'the Wasm fails to load',
      message: LOAD_ERROR,
      fail: (worker: FakeProducerWorker) =>
        worker.emit({ type: 'error', phase: 'init', message: LOAD_ERROR }),
    },
    {
      failure: 'the worker script fails',
      message: WORKER_SCRIPT_ERROR,
      fail: (worker: FakeProducerWorker) =>
        worker.dispatchEvent(new ErrorEvent('error', { message: WORKER_SCRIPT_ERROR })),
    },
  ])('shows an error when $failure, and retry replaces the worker', ({ message, fail }) => {
    const failedWorker = worker();
    fail(failedWorker);

    expect(service.status()).toBe('error');
    expect(service.errorMessage()).toBe(message);

    service.retry();

    expect(failedWorker.terminated).toBe(true);
    expect(fakes.workers).toHaveLength(2);
    expect(worker().posted).toEqual([startCommand(SECOND_RUN_ID, DEFAULT_PRODUCER_SETTINGS)]);
    expect(service.status()).toBe('starting');
    expect(service.errorMessage()).toBeNull();

    // A late event from the replaced worker can't reach the new run.
    failedWorker.emit(workedExampleSnapshot(SECOND_RUN_ID));
    expect(counters()).toEqual(NO_COUNTS);
  });

  it.each(['init', 'generate'] as const)(
    "reports the current run's %s error, and ignores one from an earlier run",
    (phase) => {
      confirmRunning();
      service.apply(NEW_SETTINGS);

      worker().emit({ type: 'error', runId: FIRST_RUN_ID, phase, message: RUN_ERROR });
      expect(service.status()).toBe('running');

      worker().emit({ type: 'error', runId: SECOND_RUN_ID, phase, message: RUN_ERROR });
      expect(service.status()).toBe('error');
      expect(service.errorMessage()).toBe(RUN_ERROR);

      // The worker itself still works, so retry starts again on it.
      service.retry();
      expect(fakes.workers).toHaveLength(1);
      expect(lastCommand()).toEqual(startCommand(THIRD_RUN_ID, NEW_SETTINGS));
    },
  );

  it('creates one worker for the whole app, and disposes of it when the app is destroyed', () => {
    // Lazy-loaded routes inject from child injectors like this one.
    const childInjector = createEnvironmentInjector([], TestBed.inject(EnvironmentInjector));
    expect(childInjector.get(ProducerService)).toBe(service);
    expect(TestBed.runInInjectionContext(() => inject(ProducerService))).toBe(service);
    expect(fakes.workers).toHaveLength(1);

    TestBed.resetTestingModule();

    expect(worker().posted.at(-1)).toEqual({ type: 'dispose' });
    expect(worker().terminated).toBe(true);
  });
});
