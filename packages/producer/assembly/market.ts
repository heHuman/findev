import { getRandomIntLessThan, getRandomBool, getRandomIntInRange, seedRandom } from "./random";

// Starting mid prices in the range of $20 to $500
export const INITIAL_MID_PRICE_MIN_CENTS: i32 = 2_000;
export const INITIAL_MID_PRICE_MAX_CENTS: i32 = 50_000;

// Mid price constraints to avoid falling below 0$ or overflowing i32
export const MIN_MID_PRICE_CENTS: i32 = 100;
export const MAX_MID_PRICE_CENTS: i32 = 100_000_000;

// Max mid price move per update: 5 bps (0.05%) of the mid price, but at least 1 cent
export const MID_PRICE_STEP_BPS: i32 = 5;
export const MIN_MID_PRICE_STEP_CENTS: i32 = 1;

// Spread is drawn from 1 cent up to 10 bps (0.1%) of the mid, at least 1 cent
export const MAX_SPREAD_BPS: i32 = 10;

/** Book quantities start in [0, 1000] and move by up to ±150 per update
 * They always stay in [0, 5000] */
export const INITIAL_BOOK_QTY_MAX: i32 = 1_000;
export const BOOK_QTY_STEP: i32 = 150;
export const MAX_BOOK_QTY: i32 = 5_000;

// Each trade is for [1, 500] units
export const MAX_TRADE_QTY: i32 = 500;

export const MAX_INSTRUMENTS: i32 = 50;
export const MAX_BATCH: i32 = 1000;

// One trade update has 7 consecutive i32 values in the output buffer
export const TRADE_UPDATE_I32_FIELD_COUNT: i32 = 7;
const F_INSTRUMENT_INDEX: i32 = 0;
const F_PRICE: i32 = 1;
const F_TRADE_QTY: i32 = 2;
const F_BID: i32 = 3;
const F_ASK: i32 = 4;
const F_BID_QTY: i32 = 5;
const F_ASK_QTY: i32 = 6;

// Preallocated memory

const I32_BYTES: i32 = 4;
const OUT_BYTES: i32 = MAX_BATCH * TRADE_UPDATE_I32_FIELD_COUNT * I32_BYTES;
const STATE_BYTES: i32 = MAX_INSTRUMENTS * I32_BYTES;

// Output buffers
export const OUT_BUFFER_PTR: usize = memory.data(OUT_BYTES);
const MID_PRICE_PTR: usize = memory.data(STATE_BYTES);
const BID_QTY_PTR: usize = memory.data(STATE_BYTES);
const ASK_QTY_PTR: usize = memory.data(STATE_BYTES);

let instrumentCount: i32 = 0;

export function getInstrumentCount(): i32 {
  return instrumentCount;
}

@inline function getAt(base: usize, i: i32): i32 {
  return load<i32>(base + (<usize>i << 2));
}
@inline function setAt(base: usize, i: i32, value: i32): void {
  store<i32>(base + (<usize>i << 2), value);
}

export function getMidPrice(i: i32): i32 {
  return getAt(MID_PRICE_PTR, i);
}
export function setMidPrice(i: i32, cents: i32): void {
  setAt(MID_PRICE_PTR, i, cents);
}

@inline function clampValueToRange(value: i32, lo: i32, hi: i32): i32 {
  assert(lo <= hi, "clampValueToRange: lo must be <= hi");
  if (value < lo) return lo;
  if (value > hi) return hi;
  return value;
}

@inline function bpsOfValueToCents(value: i32, bps: i32): i32 {
  return <i32>((<i64>value * <i64>bps) / 10_000);
}

export function getMaxMidPriceStep(midPriceCents: i32): i32 {
  return max(MIN_MID_PRICE_STEP_CENTS, bpsOfValueToCents(midPriceCents, MID_PRICE_STEP_BPS));
}

function maxSpreadForMidPrice(midPriceCents: i32): i32 {
  return max(1, bpsOfValueToCents(midPriceCents, MAX_SPREAD_BPS));
}

export function restart(newInstrumentCount: i32, newSeed: i64): void {
  seedRandom(newSeed);
  instrumentCount = newInstrumentCount;

  memory.fill(OUT_BUFFER_PTR, 0, OUT_BYTES);
  memory.fill(MID_PRICE_PTR, 0, STATE_BYTES);
  memory.fill(BID_QTY_PTR, 0, STATE_BYTES);
  memory.fill(ASK_QTY_PTR, 0, STATE_BYTES);

  for (let i = 0; i < newInstrumentCount; i++) {
    setAt(MID_PRICE_PTR, i, getRandomIntInRange(INITIAL_MID_PRICE_MIN_CENTS, INITIAL_MID_PRICE_MAX_CENTS));
    setAt(BID_QTY_PTR, i, getRandomIntInRange(0, INITIAL_BOOK_QTY_MAX));
    setAt(ASK_QTY_PTR, i, getRandomIntInRange(0, INITIAL_BOOK_QTY_MAX));
  }
}

export function simulateTrade(out: usize): void {
  const randomInstrumentIndex = getRandomIntLessThan(instrumentCount);

  const maxStep = getMaxMidPriceStep(getAt(MID_PRICE_PTR, randomInstrumentIndex));
  const newMidPrice = clampValueToRange(getAt(MID_PRICE_PTR, randomInstrumentIndex) + getRandomIntInRange(-maxStep, maxStep), MIN_MID_PRICE_CENTS, MAX_MID_PRICE_CENTS);
  setAt(MID_PRICE_PTR, randomInstrumentIndex, newMidPrice);

  const spread = getRandomIntInRange(1, maxSpreadForMidPrice(newMidPrice));
  let bid = newMidPrice - spread / 2;
  if (bid < 1) bid = 1;
  const ask = bid + spread;

  const bidQty = clampValueToRange(getAt(BID_QTY_PTR, randomInstrumentIndex) + getRandomIntInRange(-BOOK_QTY_STEP, BOOK_QTY_STEP), 0, MAX_BOOK_QTY);
  const askQty = clampValueToRange(getAt(ASK_QTY_PTR, randomInstrumentIndex) + getRandomIntInRange(-BOOK_QTY_STEP, BOOK_QTY_STEP), 0, MAX_BOOK_QTY);
  setAt(BID_QTY_PTR, randomInstrumentIndex, bidQty);
  setAt(ASK_QTY_PTR, randomInstrumentIndex, askQty);

  const price = getRandomBool() ? ask : bid;
  const tradeQty = getRandomIntInRange(1, MAX_TRADE_QTY);

  store<i32>(out, randomInstrumentIndex, F_INSTRUMENT_INDEX * I32_BYTES);
  store<i32>(out, price, F_PRICE * I32_BYTES);
  store<i32>(out, tradeQty, F_TRADE_QTY * I32_BYTES);
  store<i32>(out, bid, F_BID * I32_BYTES);
  store<i32>(out, ask, F_ASK * I32_BYTES);
  store<i32>(out, bidQty, F_BID_QTY * I32_BYTES);
  store<i32>(out, askQty, F_ASK_QTY * I32_BYTES);
}
