import { TICKERS } from '@findev/producer';

export interface InstrumentRow {
  ticker: string;
  lastPriceCents: number | null;
  // askPrice − bidPrice
  spreadCents: number | null;
  cumulativeVolume: number;
  // sum(tradePrice × tradeQuantity) / sum(tradeQuantity) since the run started
  vwapCents: number | null;
  // Latest (bidQuantity − askQuantity) / (bidQuantity + askQuantity)
  imbalance: number | null;
}

export function emptyInstrumentRows(instrumentCount: number): InstrumentRow[] {
  return TICKERS.slice(0, instrumentCount).map((ticker) => ({
    ticker,
    lastPriceCents: null,
    spreadCents: null,
    cumulativeVolume: 0,
    vwapCents: null,
    imbalance: null,
  }));
}
