import { InjectionToken } from '@angular/core';

export function createProducerWorker(): Worker {
  return new Worker(new URL('./producer.worker', import.meta.url), { type: 'module' });
}

export const PRODUCER_WORKER_FACTORY = new InjectionToken<() => Worker>('PRODUCER_WORKER_FACTORY', {
  providedIn: 'root',
  factory: () => createProducerWorker,
});
