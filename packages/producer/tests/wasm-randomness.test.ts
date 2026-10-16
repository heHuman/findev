import { describe, expect, it } from "vitest";
import { createImports, type ProducerExports } from "../src/index";
import { wasmBytes } from "./helpers";

describe("randomness runs in Wasm", () => {
  it("the module imports only env.seed and env.abort, so it cannot use a JS random source or clock", () => {
    const imports = WebAssembly.Module.imports(new WebAssembly.Module(wasmBytes));
    expect(imports.map((imp) => `${imp.module}.${imp.name}`).sort()).toEqual(["env.abort", "env.seed"]);
  });

  it("env.seed is never called", async () => {
    let seedCalls = 0;
    const imports = createImports();
    imports.env.seed = () => {
      seedCalls++;
      return 123;
    };
    const { instance } = await WebAssembly.instantiate(wasmBytes, imports);
    const wasm = instance.exports as unknown as ProducerExports;

    expect(wasm.init(5, 42)).toBe(0);
    for (let batch = 0; batch < 10; batch++) expect(wasm.simulateTradeBatch(1000)).toBe(1000);
    expect(seedCalls).toBe(0);
  });
});
