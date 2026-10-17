import { Provider } from '@angular/core';
import { PRODUCER_WORKER_FACTORY } from '../create-producer-worker';
import { ProducerCommand, ProducerEvent } from '../producer-events';

/** Stands in for the producer Worker in tests (jsdom has no Worker): records commands, emits events. */
export class FakeProducerWorker extends EventTarget {
  readonly posted: ProducerCommand[] = [];
  terminated = false;

  postMessage(command: ProducerCommand): void {
    this.posted.push(command);
  }

  terminate(): void {
    this.terminated = true;
  }

  emit(event: ProducerEvent): void {
    this.dispatchEvent(new MessageEvent('message', { data: event }));
  }
}

/** Providers that make ProducerService use fakes, plus every fake created so far, oldest first. */
export function provideFakeProducerWorker(): {
  providers: Provider[];
  workers: FakeProducerWorker[];
} {
  const workers: FakeProducerWorker[] = [];
  const createFake = () => {
    const worker = new FakeProducerWorker();
    workers.push(worker);
    // The fake has only the parts of Worker that ProducerService uses.
    return worker as unknown as Worker;
  };
  return { providers: [{ provide: PRODUCER_WORKER_FACTORY, useValue: createFake }], workers };
}
