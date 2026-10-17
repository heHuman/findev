import { beforeEach, describe, expect, it } from "vitest";
import {
  createImports,
  ProducerError,
  ProducerErrorCode,
  TICKERS,
  tickerOf,
  tickersFor,
  TRADE_UPDATE_I32_FIELD_COUNT,
  type Producer,
  type ProducerExports,
} from "../src/index";
import { assertValidMarketUpdate, generateAndDecodeBatch, loadTestProducer, wasmBytes } from "./helpers";

const LARGE_COUNT = 100_000;
const SMALL_COUNT = 5;
/** Needs about 24 GiB of state, far past the 4 GiB that 32-bit Wasm memory can address. */
const HUGE_COUNT = 2 ** 31 - 1;
const SEED = 42;
const BATCH_SIZE = 1000;
const BATCHES = 5;

function recordTradeStream(producer: Producer): number[] {
  const values: number[] = [];
  for (let batch = 0; batch < BATCHES; batch++) values.push(...producer.simulateTradeBatch(BATCH_SIZE));
  return values;
}

describe("instrument count: no upper limit", () => {
  let producer: Producer;

  beforeEach(async () => {
    producer = await loadTestProducer();
  });

  it(`${LARGE_COUNT} instruments give valid updates with indices in range`, () => {
    producer.init(LARGE_COUNT, SEED);
    for (let batch = 0; batch < BATCHES; batch++) {
      for (const update of generateAndDecodeBatch(producer, BATCH_SIZE)) assertValidMarketUpdate(update, LARGE_COUNT);
    }
  });

  it("re-init down to a small count and back up reproduces the same stream for the same seed and count", async () => {
    producer.init(LARGE_COUNT, SEED);
    const large = recordTradeStream(producer);
    producer.init(SMALL_COUNT, SEED);
    const small = recordTradeStream(producer);
    producer.init(LARGE_COUNT, SEED);
    expect(recordTradeStream(producer)).toEqual(large);

    const freshSmall = await loadTestProducer();
    freshSmall.init(SMALL_COUNT, SEED);
    expect(recordTradeStream(freshSmall)).toEqual(small);
  });

  it("init grows memory only when the state needs more room, and simulateTradeBatch never does", async () => {
    const { instance } = await WebAssembly.instantiate(wasmBytes, createImports());
    const wasm = instance.exports as unknown as ProducerExports;
    const memoryBytes = () => wasm.memory.buffer.byteLength;
    const initialBytes = memoryBytes();

    expect(wasm.init(SMALL_COUNT, SEED)).toBe(0);
    expect(memoryBytes()).toBe(initialBytes);

    expect(wasm.init(LARGE_COUNT, SEED)).toBe(0);
    const largeBytes = memoryBytes();
    expect(largeBytes).toBeGreaterThan(initialBytes);

    expect(wasm.init(SMALL_COUNT, SEED)).toBe(0);
    expect(wasm.init(LARGE_COUNT, SEED)).toBe(0);
    for (let batch = 0; batch < BATCHES; batch++) expect(wasm.simulateTradeBatch(BATCH_SIZE)).toBe(BATCH_SIZE);
    expect(memoryBytes()).toBe(largeBytes);
  });

  it("a count too large for memory gives a readable OutOfMemory error and the current run keeps working", async () => {
    producer.init(SMALL_COUNT, SEED);
    let error: unknown;
    try {
      producer.init(HUGE_COUNT, SEED);
    } catch (err) {
      error = err;
    }
    expect(error).toBeInstanceOf(ProducerError);
    expect(error).toMatchObject({
      code: ProducerErrorCode.OutOfMemory,
      message: `Not enough memory for ${HUGE_COUNT} instruments (32-bit Wasm memory is limited to 4 GiB)`,
    });
    // Past the i32 range, rejected in JS before it could wrap around to a small count
    expect(() => producer.init(2 ** 32 + SMALL_COUNT, SEED)).toThrow(`Not enough memory for ${2 ** 32 + SMALL_COUNT} instruments`);

    const referenceWithTheSameSeed = await loadTestProducer();
    referenceWithTheSameSeed.init(SMALL_COUNT, SEED);
    expect(recordTradeStream(producer)).toEqual(recordTradeStream(referenceWithTheSameSeed));
  });

  it("after init grows memory, batches are live views with correct data and the debug hooks still work", async () => {
    producer.init(SMALL_COUNT, SEED);
    const beforeGrowth = producer.simulateTradeBatch(BATCH_SIZE);
    producer.init(LARGE_COUNT, SEED);
    // The grow detached the old ArrayBuffer, so views taken before it are now empty
    expect(beforeGrowth).toHaveLength(0);

    const batch = producer.simulateTradeBatch(BATCH_SIZE);
    expect(batch).toHaveLength(BATCH_SIZE * TRADE_UPDATE_I32_FIELD_COUNT);
    const reference = await loadTestProducer();
    reference.init(LARGE_COUNT, SEED);
    expect([...batch]).toEqual([...reference.simulateTradeBatch(BATCH_SIZE)]);

    const last = LARGE_COUNT - 1;
    producer.debug.setMidPrice(last, 12_345);
    expect(producer.debug.getMidPrice(last)).toBe(12_345);
  });
});

describe("tickers for any instrument index", () => {
  const NAMED_COUNT = TICKERS.length;

  it("the first 50 tickers are the named TICKERS", () => {
    expect(NAMED_COUNT).toBe(50);
    expect(tickersFor(NAMED_COUNT)).toEqual([...TICKERS]);
  });

  it('higher indices get "I" plus the index, padded to at least 4 digits', () => {
    expect([50, 51, 999, 9_999, 10_000, LARGE_COUNT].map(tickerOf)).toEqual([
      "I0050", "I0051", "I0999", "I9999", "I10000", "I100000",
    ]);
  });

  it(`the first ${LARGE_COUNT} tickers are all unique`, () => {
    expect(new Set(tickersFor(LARGE_COUNT)).size).toBe(LARGE_COUNT);
  });

  it.each([-1, 1.5])("tickerOf(%d) throws", (index) => {
    expect(() => tickerOf(index)).toThrow(`No ticker for instrument index ${index}`);
  });
});
