import { MAX_BATCH } from '@findev/producer';

export interface ProducerSettings {
  instrumentCount: number;
  updatesPerBatch: number;
  batchIntervalMs: number;
}

export const DEFAULT_PRODUCER_SETTINGS: ProducerSettings = {
  instrumentCount: 5,
  updatesPerBatch: 100,
  batchIntervalMs: 500,
};

// The updatesPerBatch max is the Wasm MAX_BATCH. The library has no instrument cap, so the
// instrumentCount max is an app choice, kept modest because the table renders every row.
export const PRODUCER_SETTINGS_LIMITS = {
  instrumentCount: { min: 1, max: 10000 },
  updatesPerBatch: { min: 1, max: MAX_BATCH },
  batchIntervalMs: { min: 50, max: 2000 },
};
