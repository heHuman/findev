import { beforeEach, describe, expect, it } from "vitest";
import { ProducerError, type Producer } from "../src/index";
import { loadTestProducer } from "./helpers";

function recordTradeStream(producer: Producer): number[] {
  const values: number[] = [];
  for (let batch = 0; batch < 5; batch++) values.push(...producer.simulateTradeBatch(1000));
  return values;
}

describe("run control: seeding and init", () => {
  const seed = 42;
  const instrumentCount = 5;
  let producer: Producer;

  beforeEach(async () => {
    producer = await loadTestProducer();
  });

  it("the same seed gives identical output", async () => {
    const sameSeed = await loadTestProducer();
    producer.init(instrumentCount, seed);
    sameSeed.init(instrumentCount, seed);

    const stream = recordTradeStream(producer);
    expect(recordTradeStream(sameSeed)).toEqual(stream);
  });

  it("different seeds generate different outputs", async () => {
    const otherSeed = await loadTestProducer();
    producer.init(instrumentCount, seed);
    otherSeed.init(instrumentCount, seed + 1);

    const stream = recordTradeStream(producer);
    expect(recordTradeStream(otherSeed)).not.toEqual(stream);
  });

  it("init fully resets the run and the same seed after a different run reproduces the first stream", () => {
    producer.init(instrumentCount, seed);
    const first = recordTradeStream(producer);

    producer.init(50, 7);
    producer.debug.setMidPrice(0, 1_000_000);
    recordTradeStream(producer);

    producer.init(instrumentCount, seed);
    expect(recordTradeStream(producer)).toEqual(first);
  });

  it.each([
    [0, 42, "instrumentCount must be an integer of at least 1, got 0"],
    [5, -1, "seed must be an integer from 0 to Number.MAX_SAFE_INTEGER (2^53 - 1), got -1"],
    [5, 1.5, "seed must be an integer from 0 to Number.MAX_SAFE_INTEGER (2^53 - 1), got 1.5"],
  ])("init(%d, %d) is rejected with a readable ProducerError", (instrumentCount, seed, message) => {
    expect(() => producer.init(instrumentCount, seed)).toThrow(ProducerError);
    expect(() => producer.init(instrumentCount, seed)).toThrow(message);
  });

  it("a failed init leaves the current run working", async () => {
    producer.init(instrumentCount, seed);
    expect(() => producer.init(0, 7)).toThrow(ProducerError);
    expect(() => producer.init(5, -1)).toThrow(ProducerError);

    // The producer kept creating trades and they are equal ot uninterrupted run with the same seed
    const referenceWithTheSameSeed = await loadTestProducer();
    referenceWithTheSameSeed.init(instrumentCount, seed);
    expect(recordTradeStream(producer)).toEqual(recordTradeStream(referenceWithTheSameSeed));
  });
});
