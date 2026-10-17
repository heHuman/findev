import { loadProducer } from '@findev/producer';

export interface Engine {
  init(instrumentCount: number, seed: number): void;
  simulateTradeBatch(batchSize: number): Int32Array;
}

export function loadWasmEngine(source: Parameters<typeof loadProducer>[0]): Promise<Engine> {
  return loadProducer(source);
}
