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

`pretest` rebuilds the release `build/producer.wasm`, and every test runs against it. There are 20 tests in 4 files. They use fixed seeds, never wait on real time and take well under a second.

`tests/helpers.ts` loads the producer from `build/producer.wasm` (`loadTestProducer`), decodes one batch (`nextBatch`), and holds `assertValidUpdate`, the single place where the data rules are checked. Its errors name the broken rule and print the update.

| Requirement | Test file: what it checks |
|---|---|
| Batches have exactly the requested size | `generator`: 1, 100 and 1000 updates come back as asked. Sizes 0 and 1001, and a call before `init`, throw. |
| Each update is a trade plus a bid/ask snapshot in integer cents: positive prices, bid < ask, trade price = bid or ask, tradeQty > 0, book quantities ≥ 0 | `generator`: 20k updates each for 1, 5 and 50 instruments (fixed seeds) pass `assertValidUpdate`. Every instrument appears, and trades happen at both the bid and the ask. `decodeBatch` maps the 7 fields correctly. |
| Prices evolve from previous values; state carries over between calls | `generator`: with one update per call, each mid moves by at most `debug.maxMidPriceStep`, and most updates do move it. |
| Prices stay positive | `generator`: with every mid set to the minimum, all updates are still valid. |
| "Apply" starts a new run: seeding and reset | `run-control`: the same seed gives identical output and different seeds differ. Re-`init` with the same seed after another run reproduces the first stream. A bad instrument count (0, 51) or seed (−1, 1.5) throws a readable `ProducerError`, and a failed `init` leaves the run working. |
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

- `loadProducer(source)` takes a `URL | string | Response | BufferSource`. For a URL or a Response it uses `WebAssembly.instantiateStreaming`. If that fails, for example because the MIME type isn't `application/wasm`, it falls back to `arrayBuffer()` + `instantiate`. HTTP errors, non-Wasm bodies (such as an HTML fallback page) and instantiate failures all throw descriptive `Error`s. It also checks that the module's `MAX_BATCH`, `MAX_INSTRUMENTS` and `TRADE_UPDATE_I32_FIELD_COUNT` match `layout.ts`.
- `Producer.init(count, seed)` and `Producer.simulateTradeBatch(n)` throw a `ProducerError` with a `code` when the module rejects the call. Non-integer arguments are rejected in JS before they reach Wasm, where they would be truncated.
- The view that `simulateTradeBatch` returns points into Wasm memory and is **overwritten by the next call**. Read it, or copy it, first.
- `producer.debug` has the test hooks: `setMidPrice`, `getMidPrice`, `maxMidPriceStep(midPrice)` and `minMidPriceCents`.
- `createImports()` builds the import object (`env.seed`, `env.abort`) for tests that instantiate the `.wasm` directly.
- `layout.ts` defines `TRADE_UPDATE_I32_FIELD_COUNT`, `FIELD_OFFSETS`, the limits, `ProducerErrorCode` and `TICKERS` (50 fictional tickers: ALFA, BETA, …).

## Wasm exports (`assembly/index.ts`)

| Export | Description |
|---|---|
| `init(instrumentCount, seed: f64): i32` | Resets all state and seeds the generator. `seed` is a plain JS number: an integer in [0, 2^53 − 1], converted to i64 inside Wasm. Returns 0 or an error code. A failed call leaves the current run untouched. |
| `simulateTradeBatch(batchSize): i32` | Writes `batchSize` updates at `getOutputBuffer()` and returns the count, or an error code. |
| `getOutputBuffer(): usize` | Byte offset of the output buffer. It is fixed for the module's lifetime. |
| `MAX_BATCH`, `MAX_INSTRUMENTS`, `TRADE_UPDATE_I32_FIELD_COUNT`, `MIN_MID_PRICE_CENTS` | Read-only globals (`.value`). |
| `debugSetMidPrice(i, cents)`, `debugGetMidPrice(i)`, `debugMaxMidPriceStep(mid)` | Test hooks. |
| `memory` | The module's memory. It is one page and never grows. |

**Imports:** `env.seed`, which comes from AssemblyScript's `Math.random` (see below), and `env.abort`, which is called when an `assert` fails (e.g. a random range with `lo > hi` after a bad tunable edit). `createImports()` provides both.

**Error codes:** `-1` instrumentCount outside 1–50, `-2` batchSize outside 1–1000, `-3` called before a successful `init`, `-4` debug instrument index out of range, `-5` debug mid out of range, `-6` seed not an integer in [0, 2^53 − 1].

## Data layout

One flat `Int32Array`, stride 7 per update. All values are integer cents or units:

```
[instrumentIndex, priceCents, tradeQty, bidCents, askCents, bidQty, askQty]
```

`instrumentIndex` indexes `TICKERS` (the ticker list stays on the JS side; see `tickerOf`). Invariants: `price > 0`, `bid ≥ 1`, `bid < ask`, `price ∈ {bid, ask}`, `tradeQty ≥ 1`, and book quantities `≥ 0`.

## Generation model (`assembly/market.ts`)

The state lives in static memory (`memory.data`): the output buffer, and `midPrice`, `bidQty` and `askQty` per instrument. `simulateTradeBatch` never allocates.

- **Random numbers:** these come from AssemblyScript's stdlib `Math.random()` (NativeMath: xorshift128+, compiled into the module). The wrappers live in `assembly/random.ts`, which is the one place to swap the generator. `init` seeds it explicitly with `NativeMath.seedRandom(<i64>seed)`, for two reasons:
  - **Deterministic tests:** the same seed always reproduces the same stream, and `init` fully resets the run.
  - **A fresh run on every Apply:** the host draws a new seed for each run.

  Without an explicit seed, the stdlib would pull one from the host via `env.seed`. Because `init` always seeds first, that import is never called. The loader still has to provide it, so it supplies `Date.now()`.
- **`init`:** zeroes all state, then draws each instrument's starting mid in $20–$500 and its book quantities in 0–1000.
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
| `MAX_INSTRUMENTS` / `MAX_BATCH` | 50 / 1 000 | limits (mirrored in `src/layout.ts`) |
| `TRADE_UPDATE_I32_FIELD_COUNT` | 7 | i32 fields per update (mirrored in `src/layout.ts`) |

Rebuild with `npm run build:wasm` after changing them. The limits and the stride are also checked by the loader at load time.
