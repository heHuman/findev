import { readFileSync } from "node:fs";
import { decodeBatch, loadProducer, type MarketUpdate, type Producer } from "../src/index";

export const wasmBytes = new Uint8Array(readFileSync(new URL("../build/producer.wasm", import.meta.url)));

export function loadTestProducer(): Promise<Producer> {
  return loadProducer(wasmBytes);
}

export function generateAndDecodeBatch(producer: Producer, batchSize: number): MarketUpdate[] {
  return decodeBatch(producer.simulateTradeBatch(batchSize), batchSize);
}

export function assertValidMarketUpdate(update: MarketUpdate, instrumentCount: number): void {
  const fail = (rule: string): never => {
    throw new Error(`Invalid market update: ${rule}. Update: ${JSON.stringify(update)}`);
  };

  for (const [field, value] of Object.entries(update)) {
    if (!Number.isInteger(value)) fail(`${field} must be an integer (cents or units)`);
  }
  if (update.instrumentIndex < 0 || update.instrumentIndex >= instrumentCount) {
    fail(`instrumentIndex must be in [0, ${instrumentCount})`);
  }

  if (update.bidCents <= 0) fail("bidCents must be positive");
  if (update.askCents <= update.bidCents) fail("bidCents must be below askCents");
  if (update.priceCents !== update.bidCents && update.priceCents !== update.askCents) {
    fail("priceCents must equal bidCents or askCents");
  }
  if (update.tradeQty <= 0) fail("tradeQty must be positive");
  if (update.bidQty < 0) fail("bidQty must not be negative");
  if (update.askQty < 0) fail("askQty must not be negative");
}
