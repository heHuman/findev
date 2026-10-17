import { FIELD_OFFSETS, MarketUpdate, TRADE_UPDATE_I32_FIELD_COUNT } from '@findev/producer';

// Test helper that packs updates into the Int32Array layout that simulateTradeBatch returns
export function encodeUpdates(updates: MarketUpdate[]): Int32Array {
  const batch = new Int32Array(updates.length * TRADE_UPDATE_I32_FIELD_COUNT);
  updates.forEach((update, i) => {
    const base = i * TRADE_UPDATE_I32_FIELD_COUNT;
    for (const [field, offset] of Object.entries(FIELD_OFFSETS)) {
      batch[base + offset] = update[field as keyof MarketUpdate];
    }
  });
  return batch;
}
