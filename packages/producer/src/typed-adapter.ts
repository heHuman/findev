import {
  MAX_BATCH,
  MIN_BATCH,
  MIN_INSTRUMENTS,
  ProducerErrorCode,
  TRADE_UPDATE_I32_FIELD_COUNT,
} from "./layout";

export interface ProducerRawExports {
  memory: WebAssembly.Memory;
  MAX_BATCH: WebAssembly.Global;
  TRADE_UPDATE_I32_FIELD_COUNT: WebAssembly.Global;
  MIN_MID_PRICE_CENTS: WebAssembly.Global;
  init(instrumentCount: number, seed: number): number;
  simulateTradeBatch(batchSize: number): number;
  getOutputBuffer(): number;
  debugSetMidPrice(i: number, cents: number): number;
  debugGetMidPrice(i: number): number;
  debugMaxMidPriceStep(midCents: number): number;
}

export interface ProducerDebug {
  readonly minMidPriceCents: number;
  setMidPrice(instrumentIndex: number, cents: number): void;
  getMidPrice(instrumentIndex: number): number;
  maxMidPriceStep(midPriceCents: number): number;
}

export interface Producer {
  init(instrumentCount: number, seed: number): void;
  simulateTradeBatch(batchSize: number): Int32Array;
  readonly debug: ProducerDebug;
}

export class ProducerError extends Error {
  readonly code: ProducerErrorCode;

  constructor(code: ProducerErrorCode, message: string) {
    super(message);
    this.name = "ProducerError";
    this.code = code;
  }
}

export interface ProducerImports extends WebAssembly.Imports {
  env: {
    seed(): number;
    abort(messagePtr: number, filePtr: number, line: number, column: number): never;
  };
}

/**
 * Host functions the module may import.
 * - `env.seed`: AssemblyScript's Math.random asks for a seed through it only if it
 *   is used before being seeded. `init` always seeds explicitly first, so it is
 *   never actually called; it exists because the import must be satisfied.
 * - `env.abort`: AssemblyScript's failure hook, called when an `assert` fails (e.g. a
 *   random range with lo > hi after a bad tunable edit). It throws a JS Error so the
 *   worker can report it. Pass `getMemory` to decode the abort message from Wasm memory.
 */
export function createImports(getMemory: () => WebAssembly.Memory | undefined = () => undefined): ProducerImports {
  return {
    env: {
      seed: () => Date.now(),
      abort(messagePtr, filePtr, line, column) {
        const memory = getMemory();
        const message = memory ? readAsString(memory, messagePtr) : `<message at ${messagePtr}>`;
        const file = memory ? readAsString(memory, filePtr) : `<file at ${filePtr}>`;
        throw new Error(`producer.wasm aborted: ${message} (${file}:${line}:${column})`);
      },
    },
  };
}

function readAsString(memory: WebAssembly.Memory, ptr: number): string {
  if (ptr === 0) return "";
  const byteLength = new DataView(memory.buffer).getUint32(ptr - 4, true);
  return new TextDecoder("utf-16le").decode(new Uint8Array(memory.buffer, ptr, byteLength));
}

export async function loadProducer(source: URL | string | Response | BufferSource): Promise<Producer> {
  let exports: ProducerRawExports | undefined;
  const imports = createImports(() => exports?.memory);

  let instance: WebAssembly.Instance;
  if (typeof source === "string" || source instanceof URL) {
    const url = String(source);
    let response: Response;
    try {
      response = await fetch(url);
    } catch (err) {
      throw new Error(`Could not fetch producer Wasm from ${url}: ${errorText(err)}`, { cause: err });
    }
    instance = await instantiateResponse(response, url, imports);
  } else if (isResponse(source)) {
    instance = await instantiateResponse(source, source.url || "<Response>", imports);
  } else {
    instance = await instantiateBytes(source, "<bytes>", imports);
  }

  exports = checkExports(instance.exports);
  return wrap(exports);
}

async function instantiateResponse(
  response: Response,
  label: string,
  imports: WebAssembly.Imports,
): Promise<WebAssembly.Instance> {
  if (!response.ok) {
    throw new Error(`Could not fetch producer Wasm from ${label}: HTTP ${response.status} ${response.statusText}`.trim());
  }
  if (typeof WebAssembly.instantiateStreaming === "function") {
    // Streaming compiles while downloading, but it requires the
    // `application/wasm` MIME type. Keep a copy of the body for the fallback.
    const fallback = response.clone();
    try {
      return (await WebAssembly.instantiateStreaming(response, imports)).instance;
    } catch {
      response = fallback;
    }
  }
  const contentType = response.headers.get("content-type") ?? "unknown";
  return instantiateBytes(await response.arrayBuffer(), `${label} (content-type: ${contentType})`, imports);
}

async function instantiateBytes(
  bytes: BufferSource,
  label: string,
  imports: WebAssembly.Imports,
): Promise<WebAssembly.Instance> {
  const view = ArrayBuffer.isView(bytes)
    ? new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    : new Uint8Array(bytes);
  // Every Wasm binary starts with "\0asm". A miss usually means the server
  // returned an HTML page (e.g. an SPA fallback for a wrong path).
  if (view.length < 4 || view[0] !== 0x00 || view[1] !== 0x61 || view[2] !== 0x73 || view[3] !== 0x6d) {
    throw new Error(`Producer Wasm from ${label} is not a WebAssembly binary; check the path and the server's response`);
  }
  try {
    return (await WebAssembly.instantiate(bytes, imports)).instance;
  } catch (err) {
    throw new Error(`Could not instantiate producer Wasm from ${label}: ${errorText(err)}`, { cause: err });
  }
}

function checkExports(raw: WebAssembly.Exports): ProducerRawExports {
  const functions = [
    "init",
    "simulateTradeBatch",
    "getOutputBuffer",
    "debugSetMidPrice",
    "debugGetMidPrice",
    "debugMaxMidPriceStep",
  ];
  for (const name of functions) {
    if (typeof raw[name] !== "function") throw new Error(`Producer Wasm is missing the export "${name}"`);
  }
  if (!(raw["memory"] instanceof WebAssembly.Memory)) throw new Error(`Producer Wasm does not export its memory`);

  // Keyed by the Wasm export name; values are the layout.ts constants they must match.
  const expected = { MAX_BATCH, TRADE_UPDATE_I32_FIELD_COUNT };
  for (const [name, value] of Object.entries(expected)) {
    const global = raw[name];
    const actual = global instanceof WebAssembly.Global ? global.value : undefined;
    if (actual !== value) {
      throw new Error(`Producer Wasm ${name} is ${actual}, but layout.ts expects ${value}; rebuild the Wasm or update layout.ts`);
    }
  }
  return raw as unknown as ProducerRawExports;
}

const MAX_I32 = 2 ** 31 - 1;

function wrap(wasm: ProducerRawExports): Producer {
  const ptr = wasm.getOutputBuffer();
  // A view over the whole output buffer. `init` grows memory when it needs room for more
  // instruments, and growing detaches the old ArrayBuffer, so the view is recreated
  // whenever `memory.buffer` has changed. The debug hooks go through Wasm calls, not views.
  const outputView = () => new Int32Array(wasm.memory.buffer, ptr, MAX_BATCH * TRADE_UPDATE_I32_FIELD_COUNT);
  let view = outputView();
  const refreshView = () => {
    if (view.buffer !== wasm.memory.buffer) view = outputView();
  };
  const minMidPriceCents = wasm.MIN_MID_PRICE_CENTS.value as number;

  return {
    init(instrumentCount, seed) {
      const value = requireInteger(instrumentCount, ProducerErrorCode.InstrumentCount);
      // Wasm takes an i32, so a larger count would wrap around. It could never fit in memory anyway.
      if (value > MAX_I32) throw new ProducerError(ProducerErrorCode.OutOfMemory, describe(ProducerErrorCode.OutOfMemory, value));
      check(wasm.init(value, seed), instrumentCount, seed);
      refreshView(); // a failed init never grows memory, so only a successful one needs this
    },

    simulateTradeBatch(batchSize) {
      const value = requireInteger(batchSize, ProducerErrorCode.BatchSize);
      const count = check(wasm.simulateTradeBatch(value), batchSize);
      refreshView();
      return view.subarray(0, count * TRADE_UPDATE_I32_FIELD_COUNT);
    },

    debug: {
      minMidPriceCents,
      setMidPrice(instrumentIndex, cents) {
        const i = requireInteger(instrumentIndex, ProducerErrorCode.InstrumentIndex);
        check(wasm.debugSetMidPrice(i, requireInteger(cents, ProducerErrorCode.MidPriceRange)), instrumentIndex, cents);
      },
      getMidPrice(instrumentIndex) {
        return check(
          wasm.debugGetMidPrice(requireInteger(instrumentIndex, ProducerErrorCode.InstrumentIndex)),
          instrumentIndex,
        );
      },
      maxMidPriceStep(midPriceCents) {
        return wasm.debugMaxMidPriceStep(midPriceCents);
      },
    },
  };

  function requireInteger(value: number, code: ProducerErrorCode): number {
    if (!Number.isInteger(value)) throw new ProducerError(code, describe(code, value));
    return value;
  }

  function check(result: number, arg: number, extra?: number): number {
    if (result >= 0) return result;
    const code = result as ProducerErrorCode;
    const usesExtra = code === ProducerErrorCode.MidPriceRange || code === ProducerErrorCode.Seed;
    throw new ProducerError(code, describe(code, usesExtra ? (extra ?? arg) : arg));
  }

  function describe(code: ProducerErrorCode, value: number): string {
    switch (code) {
      case ProducerErrorCode.InstrumentCount:
        return `instrumentCount must be an integer of at least ${MIN_INSTRUMENTS}, got ${value}`;
      case ProducerErrorCode.BatchSize:
        return `batchSize must be an integer from ${MIN_BATCH} to ${MAX_BATCH}, got ${value}`;
      case ProducerErrorCode.NotInitialized:
        return `producer is not initialized: call init() first`;
      case ProducerErrorCode.InstrumentIndex:
        return `instrument index must be an integer in [0, instrumentCount), got ${value}`;
      case ProducerErrorCode.MidPriceRange:
        return `mid price must be an integer of at least ${minMidPriceCents} cents (and within the module's maximum), got ${value}`;
      case ProducerErrorCode.Seed:
        return `seed must be an integer from 0 to Number.MAX_SAFE_INTEGER (2^53 - 1), got ${value}`;
      case ProducerErrorCode.OutOfMemory:
        return `Not enough memory for ${value} instruments (32-bit Wasm memory is limited to 4 GiB)`;
      default:
        return `producer.wasm returned unknown error code ${code as number}`;
    }
  }
}

function isResponse(value: unknown): value is Response {
  return typeof Response !== "undefined" && value instanceof Response;
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
