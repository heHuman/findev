/// <reference lib="webworker" />

import { ProducerController, scheduleInterval } from './producer-controller';
import { loadWasmEngine } from './producer-engine';
import { ProducerCommand } from './producer-events';

// The build emits this script next to the app's other files and copies producer.wasm there too
const wasmUrl = new URL('producer.wasm', self.location.href);

const controller = new ProducerController({
  engine: loadWasmEngine(wasmUrl),
  scheduleRepeating: scheduleInterval,
  post: (event, transfer = []) => postMessage(event, transfer),
});

addEventListener('message', (event: MessageEvent<ProducerCommand>) =>
  controller.handle(event.data),
);
