import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      // Only the TS API is measured. The AssemblyScript in assembly/ runs as
      // compiled Wasm, so V8 can't map line coverage back to it.
      include: ["src/**/*.ts"],
      reporter: ["text", "html"],
    },
  },
});
