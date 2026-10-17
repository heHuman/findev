/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { TICKERS } from '@findev/producer';
import { ProducerSettings } from '../settings/producer-settings';
import { ProducerController, scheduleInterval } from './producer-controller';
import { loadWasmEngine } from './producer-engine';
import { ProducerEvent, SnapshotEvent } from './producer-events';

const WASM_PATH = '../../packages/producer/build/producer.wasm';

describe('ProducerController with the real Wasm engine', () => {
  const SETTINGS: ProducerSettings = {
    instrumentCount: 3,
    updatesPerBatch: 50,
    batchIntervalMs: 100,
  };
  const SEED = 12345;
  const RUN_ID = 1;
  const BATCH_COUNT = 4;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('generates valid snapshots that count every update', async () => {
    const events: ProducerEvent[] = [];
    const controller = new ProducerController({
      engine: loadWasmEngine(readFileSync(WASM_PATH)),
      scheduleRepeating: scheduleInterval,
      post: (event) => events.push(event),
    });
    await vi.waitFor(() => expect(events).toEqual([{ type: 'ready' }]));

    controller.handle({ type: 'start', runId: RUN_ID, settings: SETTINGS, seed: SEED });
    await vi.advanceTimersByTimeAsync(BATCH_COUNT * SETTINGS.batchIntervalMs);

    const last = events.filter((event) => event.type === 'snapshot').at(-1) as SnapshotEvent;
    const rows = last.metrics;
    const totalVolume = rows.reduce((sum, row) => sum + row.cumulativeVolume, 0);

    expect(last).toMatchObject({
      runId: RUN_ID,
      batches: BATCH_COUNT,
      totalUpdates: BATCH_COUNT * SETTINGS.updatesPerBatch,
    });
    expect(rows.map((row) => row.ticker)).toEqual(TICKERS.slice(0, SETTINGS.instrumentCount));
    expect(totalVolume).toBeGreaterThanOrEqual(last.totalUpdates);
    for (const row of rows) {
      expect(row.spreadCents).toBeGreaterThan(0);
      expect(row.vwapCents).toBeGreaterThan(0);
    }
  });
});
