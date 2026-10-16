import { FIELD_OFFSETS, TICKERS, TRADE_UPDATE_I32_FIELD_COUNT } from "./layout";

export interface MarketUpdate {
  /** Index into TICKERS, in [0, instrumentCount). */
  instrumentIndex: number;
  priceCents: number;
  tradeQty: number;
  bidCents: number;
  askCents: number;
  bidQty: number;
  askQty: number;
}

export function tickerOf(instrumentIndex: number): string {
  const ticker = TICKERS[instrumentIndex];
  if (ticker === undefined) throw new RangeError(`No ticker for instrument index ${instrumentIndex}`);
  return ticker;
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
