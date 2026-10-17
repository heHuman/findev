import { DestroyRef, inject, Injectable, signal } from '@angular/core';
import { ProducerSettings } from '../settings/producer-settings';
import { ProducerSettingsStore } from '../settings/producer-settings-store';
import { PRODUCER_WORKER_FACTORY } from './create-producer-worker';
import { emptyInstrumentMetrics } from './metrics';
import { InstrumentMetrics, ProducerCommand, ProducerEvent, RunState } from './producer-events';

export type ProducerStatus = RunState | 'starting' | 'error';

export const PRODUCER_STATUS_LABELS: Record<ProducerStatus, string> = {
  starting: 'Starting',
  running: 'Running',
  paused: 'Paused',
  error: 'Error',
};

@Injectable({ providedIn: 'root' })
export class ProducerService {
  readonly #store = inject(ProducerSettingsStore);
  readonly #createWorker = inject(PRODUCER_WORKER_FACTORY);

  readonly #status = signal<ProducerStatus>('starting');
  readonly #errorMessage = signal<string | null>(null);
  readonly #runId = signal(0);
  readonly #instruments = signal<InstrumentMetrics[]>([]);
  readonly #totalUpdates = signal(0);
  readonly #batches = signal(0);

  readonly status = this.#status.asReadonly();
  readonly errorMessage = this.#errorMessage.asReadonly();
  readonly runId = this.#runId.asReadonly();
  readonly instruments = this.#instruments.asReadonly();
  readonly totalUpdates = this.#totalUpdates.asReadonly();
  readonly batches = this.#batches.asReadonly();

  #worker: Worker;
  #workerState: 'loading' | 'ready' | 'failed' = 'loading';

  constructor() {
    this.#worker = this.#openWorker();
    inject(DestroyRef).onDestroy(() => {
      this.#post({ type: 'dispose' });
      this.#closeWorker();
    });
    this.#startRun();
  }

  apply(settings: ProducerSettings): void {
    this.#store.apply(settings);
    this.#startRun();
  }

  retry(): void {
    this.#startRun();
  }

  pause(): void {
    if (this.#status() === 'running') {
      this.#status.set('paused');
      this.#post({ type: 'pause', runId: this.#runId() });
    }
  }

  resume(): void {
    if (this.#status() === 'paused') {
      this.#status.set('running');
      this.#post({ type: 'resume', runId: this.#runId() });
    }
  }

  #startRun(): void {
    if (this.#workerState === 'failed') {
      this.#closeWorker();
      this.#worker = this.#openWorker();
    }
    const settings = this.#store.appliedSettings();
    const runId = this.#runId() + 1;

    this.#runId.set(runId);
    this.#instruments.set(emptyInstrumentMetrics(settings.instrumentCount));
    this.#totalUpdates.set(0);
    this.#batches.set(0);
    this.#status.set(this.#workerState === 'ready' ? 'running' : 'starting');
    this.#errorMessage.set(null);
    const seed = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);
    this.#post({ type: 'start', runId, settings, seed });
  }

  readonly #onWorkerError = (event: ErrorEvent): void => {
    this.#onLoadFailed(event.message || 'The producer worker could not be started');
  };

  #openWorker(): Worker {
    const worker = this.#createWorker();
    this.#workerState = 'loading';
    worker.addEventListener('message', this.#onMessage);
    worker.addEventListener('error', this.#onWorkerError);
    return worker;
  }

  #closeWorker(): void {
    this.#worker.removeEventListener('message', this.#onMessage);
    this.#worker.removeEventListener('error', this.#onWorkerError);
    this.#worker.terminate();
  }

  #post(command: ProducerCommand): void {
    this.#worker.postMessage(command);
  }

  readonly #onMessage = ({ data: event }: MessageEvent<ProducerEvent>): void => {
    if (event.type === 'ready') {
      this.#workerState = 'ready';
      return;
    }
    if (event.type === 'error' && event.runId === undefined) {
      this.#onLoadFailed(event.message);
      return;
    }
    if (event.runId !== this.#runId()) {
      return;
    }
    switch (event.type) {
      case 'status':
        this.#status.set(event.state);
        return;
      case 'snapshot':
        this.#instruments.set(event.metrics);
        this.#totalUpdates.set(event.totalUpdates);
        this.#batches.set(event.batches);
        return;
      case 'error':
        this.#fail(event.message);
        return;
    }
  };

  #onLoadFailed(message: string): void {
    this.#workerState = 'failed';
    this.#fail(message);
  }

  #fail(message: string): void {
    this.#status.set('error');
    this.#errorMessage.set(message);
  }
}
