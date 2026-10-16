import { beforeEach, describe, expect, it } from "vitest";
import { decodeBatch, TRADE_UPDATE_I32_FIELD_COUNT, type Producer } from "../src/index";
import { assertValidMarketUpdate, loadTestProducer, generateAndDecodeBatch } from "./helpers";

describe("generator", () => {
  const instrumentCount = 5;
  const seed = 42;
  let producer: Producer;

  beforeEach(async () => {
    producer = await loadTestProducer();
    producer.init(instrumentCount, seed);
  });

  it("decodeBatch maps the 7 values of an update to the named fields", () => {
    const view = Int32Array.from([3, 10_002, 25, 10_001, 10_003, 400, 7]);
    expect(decodeBatch(view, 1)).toEqual([
      { instrumentIndex: 3, priceCents: 10_002, tradeQty: 25, bidCents: 10_001, askCents: 10_003, bidQty: 400, askQty: 7 },
    ]);
  });

  it("returns exactly the requested batch size (1, 100 and 1000 updates)", () => {
    for (const n of [1, 100, 1000]) {
      expect(producer.simulateTradeBatch(n)).toHaveLength(n * TRADE_UPDATE_I32_FIELD_COUNT);
    }
  });

  it("rejects batch sizes 0 and 1001, and calls before init", async () => {
    expect(() => producer.simulateTradeBatch(0)).toThrow("batchSize must be an integer from 1 to 1000, got 0");
    expect(() => producer.simulateTradeBatch(1001)).toThrow("batchSize must be an integer from 1 to 1000, got 1001");

    const notInitialized = await loadTestProducer();
    expect(() => notInitialized.simulateTradeBatch(10)).toThrow("producer is not initialized: call init() first");
  });

  it.each([
    [1, 1],
    [5, 42],
    [50, 2024],
  ])("every update is valid with %i instrument(s) (seed %i), all instruments appear, and trades hit both bid and ask", (instrumentCount, seed) => {
    producer.init(instrumentCount, seed);
    const seen = new Set<number>();
    let tradesAtBid = 0;
    let tradesAtAsk = 0;

    for (let batch = 0; batch < 20; batch++) {
      for (const trade of generateAndDecodeBatch(producer, 1000)) {
        assertValidMarketUpdate(trade, instrumentCount);
        seen.add(trade.instrumentIndex);
        if (trade.priceCents === trade.bidCents) tradesAtBid++;
        else tradesAtAsk++;
      }
    }

    expect(seen.size).toBe(instrumentCount);
    expect(tradesAtBid).toBeGreaterThan(0);
    expect(tradesAtAsk).toBeGreaterThan(0);
  });

  it("prices evolve gradually from their previous values, and state carries over between calls", () => {
    let moves = 0;
    for (let step = 0; step < 10_000; step++) {
      const initialMidPrices = [0, 1, 2, 3, 4].map((i) => producer.debug.getMidPrice(i));
      const [update] = generateAndDecodeBatch(producer, 1);
      const i = update!.instrumentIndex;
      const before = initialMidPrices[i]!;
      const after = producer.debug.getMidPrice(i);

      expect(Math.abs(after - before), `instrument ${i}: mid ${before} -> ${after}`).toBeLessThanOrEqual(
        producer.debug.maxMidPriceStep(before),
      );
      if (after !== before) moves++;
    }
    expect(moves).toBeGreaterThan(0);
  });

  it("prices stay positive at the price floor", () => {
    for (let i = 0; i < instrumentCount; i++) producer.debug.setMidPrice(i, producer.debug.minMidPriceCents);

    for (let batch = 0; batch < 10; batch++) {
      for (const update of generateAndDecodeBatch(producer, 1000)) assertValidMarketUpdate(update, instrumentCount);
    }
  });
});
