# @findev/producer

Simulated market-data producer compiled to WebAssembly from AssemblyScript. It runs inside the dashboard's Web Worker. Each call to `simulateTradeBatch` returns a batch of **market updates**: one simulated trade plus the instrument's current bid/ask. The random draws and all the price logic run inside Wasm; the JS host only passes a seed.

## Build

```sh
npm install                               # at the repo root
npm run build:wasm                        # root script → packages/producer/build/producer.wasm
npm run build:debug -w @findev/producer   # build/producer.debug.wasm (+ .wat, source map)
npm run typecheck -w @findev/producer     # tsc --noEmit for src/
```

`build/` is gitignored. The release build (`-O3`, `--runtime stub`) is about 2 KB.

## Tests

```sh
npm test                                     # at the repo root: rebuilds build/producer.wasm, then runs Vitest
npm test -w @findev/producer                 # the same, from the package
npm run test:watch -w @findev/producer       # watch mode
npm run test:coverage -w @findev/producer    # coverage of src/ (text + coverage/index.html)
npm run typecheck -w @findev/producer        # also type-checks tests/ (tests/tsconfig.json)
```

`pretest` rebuilds the release `build/producer.wasm`, and every test runs against it. There are 31 tests in 5 files. They use fixed seeds, never wait on real time and take well under a second.

`tests/helpers.ts` loads the producer from `build/producer.wasm` (`loadTestProducer`), decodes one batch (`generateAndDecodeBatch`), and holds `assertValidMarketUpdate`, the single place where the data rules are checked. Its errors name the broken rule and print the update.

| Requirement | Test file: what it checks |
|---|---|
| Batches have exactly the requested size | `generator`: 1, 100 and 1000 updates come back as asked. Sizes 0 and 1001, and a call before `init`, throw. |
| Each update is a trade plus a bid/ask snapshot in integer cents: positive prices, bid < ask, trade price = bid or ask, tradeQty > 0, book quantities ≥ 0 | `generator`: 20k updates each for 1, 5, 50 and 51 instruments (fixed seeds) pass `assertValidMarketUpdate`. Every instrument appears, and trades happen at both the bid and the ask. `decodeBatch` maps the 7 fields correctly. |
| Prices evolve from previous values; state carries over between calls | `generator`: with one update per call, each mid moves by at most `debug.maxMidPriceStep`, and most updates do move it. |
| Prices stay positive | `generator`: with every mid set to the minimum, all updates are still valid. |
| "Apply" starts a new run: seeding and reset | `run-control`: the same seed gives identical output and different seeds differ. Re-`init` with the same seed after another run reproduces the first stream. A bad instrument count (0) or seed (−1, 1.5) throws a readable `ProducerError`, and a failed `init` leaves the run working. |
| Any number of instruments | `instrument-count`: 100,000 instruments give valid updates. Re-`init` from 100,000 down to 5 and back reproduces the same streams. Memory grows on `init` only when it needs more room, never in `simulateTradeBatch`. A count past 4 GiB of state throws an `OutOfMemory` `ProducerError` and the run keeps working. After a grow, batches are live views with correct data and the debug hooks work. Tickers: the first 50 are `TICKERS`, the generated format is `I0050`…, and the first 100,000 are unique. |
| Randomness and price generation run in Wasm | `wasm-randomness`: the module imports only `env.seed` and `env.abort`, and `env.seed` is never called once `init` has run. |
| Meaningful initialization errors | `loader`: loading from bytes works. An HTML page gives "not a WebAssembly binary", and HTTP 404 gives an error naming the status. |

## TypeScript API (`src/`)

```ts
import { loadProducer, decodeBatch, tickerOf, TRADE_UPDATE_I32_FIELD_COUNT, FIELD_OFFSETS } from "@findev/producer";

const producer = await loadProducer(new URL("producer.wasm", location.href)); // or a Response or the bytes
producer.init(5, seed);                          // 5 instruments; seed is an integer in [0, 2^53 - 1]
const view = producer.simulateTradeBatch(100);   // Int32Array view, length 100 * TRADE_UPDATE_I32_FIELD_COUNT
const price = view[3 * TRADE_UPDATE_I32_FIELD_COUNT + FIELD_OFFSETS.priceCents];
const updates = decodeBatch(view, 100);          // MarketUpdate[] (handy for tests, slower)
```

- `loadProducer(source)` takes a `URL | string | Response | BufferSource`. For a URL or a Response it uses `WebAssembly.instantiateStreaming`. If that fails, for example because the MIME type isn't `application/wasm`, it falls back to `arrayBuffer()` + `instantiate`. HTTP errors, non-Wasm bodies (such as an HTML fallback page) and instantiate failures all throw descriptive `Error`s. It also checks that the module's `MAX_BATCH` and `TRADE_UPDATE_I32_FIELD_COUNT` match `layout.ts`.
- `Producer.init(count, seed)` and `Producer.simulateTradeBatch(n)` throw a `ProducerError` with a `code` when the module rejects the call. Non-integer arguments are rejected in JS before they reach Wasm, where they would be truncated. A count above 2^31 − 1 (the i32 range) is rejected in JS as `OutOfMemory`, since it would wrap around in Wasm.
- The view that `simulateTradeBatch` returns points into Wasm memory and is **overwritten by the next call**. Read it, or copy it, first. An `init` that grows memory also **detaches** it (its length becomes 0). The loader recreates its own view after every `init` and batch, so the next batch is always live.
- `producer.debug` has the test hooks: `setMidPrice`, `getMidPrice`, `maxMidPriceStep(midPrice)` and `minMidPriceCents`.
- `createImports()` builds the import object (`env.seed`, `env.abort`) for tests that instantiate the `.wasm` directly.
- `layout.ts` defines `TRADE_UPDATE_I32_FIELD_COUNT`, `FIELD_OFFSETS`, the limits (`MIN_INSTRUMENTS`, `MIN_BATCH`, `MAX_BATCH`; there is no maximum instrument count), `ProducerErrorCode` and `TICKERS` (50 fictional tickers: ALFA, BETA, …).
- `tickerOf(index)` gives a unique ticker for any index ≥ 0: `TICKERS[index]` below 50, then `"I"` plus the index padded to at least 4 digits (`I0050`, `I0051`, …, `I9999`, `I10000`). Generated tickers contain digits, so they never equal a named one, and different indices give different numbers. `tickersFor(count)` lists the first `count`. Both throw a `RangeError` for a negative or non-integer value.

## Wasm exports (`assembly/index.ts`)

| Export | Description |
|---|---|
| `init(instrumentCount, seed: f64): i32` | Resets all state and seeds the generator. `instrumentCount` is at least 1, with no upper limit other than memory. `seed` is a plain JS number: an integer in [0, 2^53 − 1], converted to i64 inside Wasm. Grows memory if the new count needs more room. Returns 0 or an error code. A failed call leaves the current run untouched. |
| `simulateTradeBatch(batchSize): i32` | Writes `batchSize` updates at `getOutputBuffer()` and returns the count, or an error code. |
| `getOutputBuffer(): usize` | Byte offset of the output buffer. It is fixed for the module's lifetime. |
| `MAX_BATCH`, `TRADE_UPDATE_I32_FIELD_COUNT`, `MIN_MID_PRICE_CENTS` | Read-only globals (`.value`). |
| `debugSetMidPrice(i, cents)`, `debugGetMidPrice(i)`, `debugMaxMidPriceStep(mid)` | Test hooks. |
| `memory` | The module's memory. It starts at one page (64 KiB). `init` grows it when the state for the new count doesn't fit; `simulateTradeBatch` never grows it. |

**Imports:** `env.seed`, which comes from AssemblyScript's `Math.random` (see below), and `env.abort`, which is called when an `assert` fails (e.g. a random range with `lo > hi` after a bad tunable edit). `createImports()` provides both.

**Error codes:** `-1` instrumentCount below 1, `-2` batchSize outside 1–1000, `-3` called before a successful `init`, `-4` debug instrument index out of range, `-5` debug mid out of range, `-6` seed not an integer in [0, 2^53 − 1], `-7` not enough memory for the instrument count (the state would pass 4 GiB, or `memory.grow` failed). The loader turns `-7` into "Not enough memory for N instruments".

## Data layout

One flat `Int32Array`, stride 7 per update. All values are integer cents or units:

```
[instrumentIndex, priceCents, tradeQty, bidCents, askCents, bidQty, askQty]
```

`instrumentIndex` is in [0, instrumentCount); `tickerOf(instrumentIndex)` gives its ticker (the tickers stay on the JS side). Invariants: `price > 0`, `bid ≥ 1`, `bid < ask`, `price ∈ {bid, ask}`, `tradeQty ≥ 1`, and book quantities `≥ 0`.

## Generation model (`assembly/market.ts`)

Memory has two parts, and `simulateTradeBatch` never allocates or grows memory:

- **Output buffer:** static (`memory.data`), room for `MAX_BATCH` updates. Its offset never changes.
- **Per-instrument state:** three i32 arrays, `midPrice`, `bidQty` and `askQty`, laid out back to back for `instrumentCount` entries (12 bytes per instrument). The region starts at `__heap_base` (the end of all static data), aligned to 16 bytes. The stub runtime never frees memory, so instead of allocating, `init` computes the region's end in u64 (no overflow for any count) and calls `memory.grow` only when it doesn't fit in the current memory. An `init` with the same or a smaller count reuses the region, so repeated inits never leak. This is safe because nothing in the module allocates on the heap. If the end would pass 4 GiB, or `memory.grow` fails, `init` returns `-7` before touching any state.

- **Random numbers:** these come from AssemblyScript's stdlib `Math.random()` (NativeMath: xorshift128+, compiled into the module). The wrappers live in `assembly/random.ts`, which is the one place to swap the generator. `init` seeds it explicitly with `NativeMath.seedRandom(<i64>seed)`, for two reasons:
  - **Deterministic tests:** the same seed always reproduces the same stream, and `init` fully resets the run.
  - **A fresh run on every Apply:** the host draws a new seed for each run.

  Without an explicit seed, the stdlib would pull one from the host via `env.seed`. Because `init` always seeds first, that import is never called. The loader still has to provide it, so it supplies `Date.now()`.
- **`init`:** makes room for the state (see above), zeroes the output buffer, then draws each instrument's starting mid in $20–$500 and its book quantities in 0–1000, so nothing from a previous run survives.
- **Each update:**
  1. Pick a random instrument. Repeats within a batch are allowed.
  2. Random-walk the mid by ±`max(1¢, 5 bps of mid)`, then clamp it to [$1.00, $1,000,000].
  3. Draw a spread of 1¢ to `max(1¢, 10 bps of mid)`. Set `bid = mid − floor(spread/2)` and `ask = bid + spread`, so `ask > bid` always holds.
  4. Random-walk `bidQty` and `askQty` by ±150, clamped to [0, 5000]. Zero is reachable on purpose.
  5. The trade hits the bid or lifts the ask with equal probability: `price = bid` or `price = ask`. `tradeQty` is in 1–500.

### Tunables (top of `assembly/market.ts`)

| Constant | Value | Meaning |
|---|---|---|
| `INITIAL_MID_PRICE_MIN_CENTS` / `INITIAL_MID_PRICE_MAX_CENTS` | 2 000 / 50 000 | starting mid range ($20–$500) |
| `MIN_MID_PRICE_CENTS` / `MAX_MID_PRICE_CENTS` | 100 / 100 000 000 | mid clamp ($1 – $1M) |
| `MID_PRICE_STEP_BPS` / `MIN_MID_PRICE_STEP_CENTS` | 5 / 1 | max mid move per update |
| `MAX_SPREAD_BPS` | 10 | max spread, as bps of mid (at least 1¢) |
| `INITIAL_BOOK_QTY_MAX` | 1 000 | starting book quantity range |
| `BOOK_QTY_STEP` / `MAX_BOOK_QTY` | 150 / 5 000 | book quantity walk and cap |
| `MAX_TRADE_QTY` | 500 | trade size range 1–500 |
| `MAX_BATCH` | 1 000 | batch size limit (mirrored in `src/layout.ts`) |
| `TRADE_UPDATE_I32_FIELD_COUNT` | 7 | i32 fields per update (mirrored in `src/layout.ts`) |

Rebuild with `npm run build:wasm` after changing them. `MAX_BATCH` and the stride are also checked by the loader at load time. There is no instrument limit to tune: the count is bounded only by memory.
