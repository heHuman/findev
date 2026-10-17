import { FIELD_OFFSETS, TICKERS, TRADE_UPDATE_I32_FIELD_COUNT } from "./layout";

export interface MarketUpdate {
  /** In [0, instrumentCount); `tickerOf(instrumentIndex)` gives its ticker. */
  instrumentIndex: number;
  priceCents: number;
  tradeQty: number;
  bidCents: number;
  askCents: number;
  bidQty: number;
  askQty: number;
}

/**
 * The ticker of an instrument, for any index >= 0.
 * - Indices below `TICKERS.length` (50) get the named ticker: ALFA, BETA, ...
 * - Higher indices get "I" plus the index, padded to at least 4 digits: I0050, I0051, ..., I9999, I10000.
 *   They contain digits, so they can never equal a named (all-letter) ticker, and different
 *   indices always give different numbers, so they never collide with each other.
 */
export function tickerOf(instrumentIndex: number): string {
  if (!Number.isSafeInteger(instrumentIndex) || instrumentIndex < 0) {
    throw new RangeError(`No ticker for instrument index ${instrumentIndex}`);
  }
  return TICKERS[instrumentIndex] ?? `I${String(instrumentIndex).padStart(4, "0")}`;
}

/** The tickers of instruments 0 to count - 1. */
export function tickersFor(count: number): string[] {
  if (!Number.isSafeInteger(count) || count < 0) throw new RangeError(`Cannot list tickers for ${count} instruments`);
  return Array.from({ length: count }, (_, i) => tickerOf(i));
}

export function decodeBatch(view: Int32Array, count: number): MarketUpdate[] {
  if (!Number.isInteger(count) || count < 0 || count * TRADE_UPDATE_I32_FIELD_COUNT > view.length) {
    throw new RangeError(`Cannot decode ${count} updates from a view of ${view.length} values`);
  }
  const updates: MarketUpdate[] = new Array(count);
  for (let i = 0; i < count; i++) {
    const base = i * TRADE_UPDATE_I32_FIELD_COUNT;
    updates[i] = {
      instrumentIndex: view[base + FIELD_OFFSETS.instrumentIndex]!,
      priceCents: view[base + FIELD_OFFSETS.priceCents]!,
      tradeQty: view[base + FIELD_OFFSETS.tradeQty]!,
      bidCents: view[base + FIELD_OFFSETS.bidCents]!,
      askCents: view[base + FIELD_OFFSETS.askCents]!,
      bidQty: view[base + FIELD_OFFSETS.bidQty]!,
      askQty: view[base + FIELD_OFFSETS.askQty]!,
    };
  }
  return updates;
}
