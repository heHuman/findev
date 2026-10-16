import { describe, expect, it } from "vitest";
import { loadProducer, TRADE_UPDATE_I32_FIELD_COUNT } from "../src/index";
import { wasmBytes } from "./helpers";

describe("loadProducer", () => {
  it("loads the producer from the Wasm bytes and generates a batch", async () => {
    const producer = await loadProducer(wasmBytes);
    producer.init(5, 42);
    expect(producer.simulateTradeBatch(10)).toHaveLength(10 * TRADE_UPDATE_I32_FIELD_COUNT);
  });

  it("an HTML page instead of the Wasm file gives a 'not a WebAssembly binary' error", async () => {
    const html = new Response("<!doctype html><html><body>App</body></html>", {
      headers: { "content-type": "text/html" },
    });
    await expect(loadProducer(html)).rejects.toThrow(
      "Producer Wasm from <Response> (content-type: text/html) is not a WebAssembly binary; check the path and the server's response",
    );
  });

  it("an HTTP 404 response gives an error naming the status", async () => {
    const notFound = new Response("Not found", { status: 404, statusText: "Not Found" });
    await expect(loadProducer(notFound)).rejects.toThrow("Could not fetch producer Wasm from <Response>: HTTP 404 Not Found");
  });
});
