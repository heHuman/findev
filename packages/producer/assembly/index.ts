import {
  MAX_BATCH as MAX_BATCH_,
  MAX_MID_PRICE_CENTS,
  MIN_MID_PRICE_CENTS as MIN_MID_PRICE_CENTS_,
  OUT_BUFFER_PTR,
  TRADE_UPDATE_I32_FIELD_COUNT as TRADE_UPDATE_I32_FIELD_COUNT_,
  getInstrumentCount,
  getMidPrice,
  getMaxMidPriceStep,
  reserveStateMemory,
  restart,
  setMidPrice,
  simulateTrade,
} from "./market";

// Limits and layout, exported as read-only Wasm globals (read with `.value` in JS).
export const MAX_BATCH: i32 = MAX_BATCH_;
export const TRADE_UPDATE_I32_FIELD_COUNT: i32 = TRADE_UPDATE_I32_FIELD_COUNT_;
export const MIN_MID_PRICE_CENTS: i32 = MIN_MID_PRICE_CENTS_;

const OK: i32 = 0;
const ERR_INSTRUMENT_COUNT: i32 = -1;
const ERR_BATCH_SIZE: i32 = -2;
const ERR_NOT_INITIALIZED: i32 = -3;
const ERR_INSTRUMENT_INDEX: i32 = -4;
const ERR_MID_RANGE: i32 = -5;
const ERR_SEED: i32 = -6;
const ERR_OUT_OF_MEMORY: i32 = -7;

/** Largest integer a JS number holds exactly: 2^53 - 1 (Number.MAX_SAFE_INTEGER). */
const MAX_SEED: f64 = 9_007_199_254_740_991;

export function init(instrumentCount: i32, seed: f64): i32 {
  if (instrumentCount < 1) return ERR_INSTRUMENT_COUNT;
  // `!(seed >= 0)` also rejects NaN, since every comparison with NaN is false.
  if (!(seed >= 0) || seed > MAX_SEED || Math.trunc(seed) != seed) return ERR_SEED;
  // Last check: it may grow memory, but it never changes the current run.
  if (!reserveStateMemory(instrumentCount)) return ERR_OUT_OF_MEMORY;
  restart(instrumentCount, <i64>seed);
  return OK;
}

export function simulateTradeBatch(batchSize: i32): i32 {
  if (getInstrumentCount() == 0) return ERR_NOT_INITIALIZED;
  if (batchSize < 1 || batchSize > MAX_BATCH) return ERR_BATCH_SIZE;
  const updateBytes = <usize>TRADE_UPDATE_I32_FIELD_COUNT * sizeof<i32>();
  let out = OUT_BUFFER_PTR;
  for (let k = 0; k < batchSize; k++) {
    simulateTrade(out);
    out += updateBytes;
  }
  return batchSize;
}

export function getOutputBuffer(): usize {
  return OUT_BUFFER_PTR;
}

// TEST FUNCTIONS
function checkIndex(i: i32): i32 {
  if (getInstrumentCount() == 0) return ERR_NOT_INITIALIZED;
  if (i < 0 || i >= getInstrumentCount()) return ERR_INSTRUMENT_INDEX;
  return OK;
}

export function debugSetMidPrice(i: i32, cents: i32): i32 {
  const status = checkIndex(i);
  if (status != OK) return status;
  if (cents < MIN_MID_PRICE_CENTS || cents > MAX_MID_PRICE_CENTS) return ERR_MID_RANGE;
  setMidPrice(i, cents);
  return OK;
}

export function debugGetMidPrice(i: i32): i32 {
  const status = checkIndex(i);
  if (status != OK) return status;
  return getMidPrice(i);
}

export function debugMaxMidPriceStep(midCents: i32): i32 {
  return getMaxMidPriceStep(midCents);
}
