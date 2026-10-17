import { FIELD_OFFSETS, TRADE_UPDATE_I32_FIELD_COUNT } from '@findev/producer';
import { InstrumentRow } from '../dashboard/instrument-row';
import { SNAPSHOT_FIELD, SNAPSHOT_FIELD_COUNT } from './producer-events';

export function createAccumulators(instrumentCount: number): Float64Array {
  const accumulators = new Float64Array(instrumentCount * SNAPSHOT_FIELD_COUNT);
  for (let base = 0; base < accumulators.length; base += SNAPSHOT_FIELD_COUNT) {
    accumulators[base + SNAPSHOT_FIELD.lastPriceCents] = NaN;
    accumulators[base + SNAPSHOT_FIELD.bidCents] = NaN;
    accumulators[base + SNAPSHOT_FIELD.askCents] = NaN;
    accumulators[base + SNAPSHOT_FIELD.bidQty] = NaN;
    accumulators[base + SNAPSHOT_FIELD.askQty] = NaN;
  }
  return accumulators;
}

export function accumulateBatch(accumulators: Float64Array, updates: Int32Array): void {
  for (let source = 0; source < updates.length; source += TRADE_UPDATE_I32_FIELD_COUNT) {
    const target = updates[source + FIELD_OFFSETS.instrumentIndex] * SNAPSHOT_FIELD_COUNT;
    const priceCents = updates[source + FIELD_OFFSETS.priceCents];
    const tradeQty = updates[source + FIELD_OFFSETS.tradeQty];

    accumulators[target + SNAPSHOT_FIELD.lastPriceCents] = priceCents;
    accumulators[target + SNAPSHOT_FIELD.bidCents] = updates[source + FIELD_OFFSETS.bidCents];
    accumulators[target + SNAPSHOT_FIELD.askCents] = updates[source + FIELD_OFFSETS.askCents];
    accumulators[target + SNAPSHOT_FIELD.bidQty] = updates[source + FIELD_OFFSETS.bidQty];
    accumulators[target + SNAPSHOT_FIELD.askQty] = updates[source + FIELD_OFFSETS.askQty];

    accumulators[target + SNAPSHOT_FIELD.volume] += tradeQty;
    accumulators[target + SNAPSHOT_FIELD.notionalCents] += priceCents * tradeQty;
  }
}

export function deriveRow(snapshot: Float64Array, index: number, ticker: string): InstrumentRow {
  const base = index * SNAPSHOT_FIELD_COUNT;
  const field = (offset: number) => snapshot[base + offset];

  const bidQty = field(SNAPSHOT_FIELD.bidQty);
  const askQty = field(SNAPSHOT_FIELD.askQty);
  const volume = field(SNAPSHOT_FIELD.volume);

  return {
    ticker,
    lastPriceCents: valueOrNull(field(SNAPSHOT_FIELD.lastPriceCents)),
    spreadCents: valueOrNull(field(SNAPSHOT_FIELD.askCents) - field(SNAPSHOT_FIELD.bidCents)),
    cumulativeVolume: volume,
    vwapCents: ratioOrNull(field(SNAPSHOT_FIELD.notionalCents), volume),
    imbalance: ratioOrNull(bidQty - askQty, bidQty + askQty),
  };
}

function valueOrNull(value: number): number | null {
  return Number.isNaN(value) ? null : value;
}

function ratioOrNull(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : valueOrNull(numerator / denominator);
}
