import { MarketUpdate, tickerOf } from '@findev/producer';
import {
  accumulateBatch,
  createAccumulators,
  deriveMetrics,
  emptyInstrumentMetrics,
} from './metrics';
import { encodeUpdates } from './testing/encode-updates';

describe('metrics', () => {
  const INSTRUMENT_COUNT = 2;
  const FIRST = 0;
  const SECOND = 1;

  // The task's worked example: 10 @ $100.00, then 30 @ $102.00, with a final book of
  // bid $101.96 × 600 / ask $102.00 × 400.
  const WORKED_EXAMPLE = {
    batch: encodeUpdates([
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
    ]),
    row: {
      ticker: tickerOf(FIRST),
      lastPriceCents: 10200,
      spreadCents: 4,
      cumulativeVolume: 40,
      vwapCents: 10150, // (10 × 10000 + 30 × 10200) / 40
      imbalance: 0.2, // (600 − 400) / (600 + 400)
    },
  };

  const TRADE: MarketUpdate = {
    instrumentIndex: FIRST,
    priceCents: 5000,
    tradeQty: 7,
    bidCents: 4999,
    askCents: 5000,
    bidQty: 300,
    askQty: 100,
  };

  it('computes the worked example', () => {
    const accumulators = createAccumulators(INSTRUMENT_COUNT);
    accumulateBatch(accumulators, WORKED_EXAMPLE.batch);

    expect(deriveMetrics(accumulators)[FIRST]).toEqual(WORKED_EXAMPLE.row);
  });

  it('shows unavailable values and zero volume before any trade', () => {
    const accumulators = createAccumulators(INSTRUMENT_COUNT);

    expect(deriveMetrics(accumulators)).toEqual(emptyInstrumentMetrics(INSTRUMENT_COUNT));
  });

  it('shows an unavailable imbalance when both book quantities are zero', () => {
    const accumulators = createAccumulators(INSTRUMENT_COUNT);
    accumulateBatch(accumulators, encodeUpdates([{ ...TRADE, bidQty: 0, askQty: 0 }]));

    const metrics = deriveMetrics(accumulators)[FIRST];
    expect(metrics.imbalance).toBeNull();
    expect(metrics.vwapCents).toBe(TRADE.priceCents);
  });

  it('keeps instruments separate', () => {
    const accumulators = createAccumulators(INSTRUMENT_COUNT);
    accumulateBatch(accumulators, WORKED_EXAMPLE.batch);

    expect(deriveMetrics(accumulators)[SECOND]).toEqual(
      emptyInstrumentMetrics(INSTRUMENT_COUNT)[SECOND],
    );
  });

  it('counts every trade once across batches, and never counts book quantities', () => {
    const TRADE_QTYS = [[3, 5], [11], [2, 4, 6]];
    const accumulators = createAccumulators(INSTRUMENT_COUNT);

    for (const batchQtys of TRADE_QTYS) {
      accumulateBatch(
        accumulators,
        encodeUpdates(batchQtys.map((tradeQty) => ({ ...TRADE, tradeQty }))),
      );
    }

    const totalQty = TRADE_QTYS.flat().reduce((sum, qty) => sum + qty, 0);
    expect(deriveMetrics(accumulators)[FIRST].cumulativeVolume).toBe(totalQty);
  });
});
