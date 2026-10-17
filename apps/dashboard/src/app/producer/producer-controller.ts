import { TRADE_UPDATE_I32_FIELD_COUNT } from '@findev/producer';
import { ProducerSettings } from '../settings/producer-settings';
import { accumulateBatch, createAccumulators } from './metrics';
import { Engine } from './producer-engine';
import {
  PauseCommand,
  ProducerCommand,
  ProducerEvent,
  ResumeCommand,
  StartCommand,
} from './producer-events';

export type CancelTimer = () => void;
export type ScheduleRepeating = (callback: () => void, intervalMs: number) => CancelTimer;

// Scheduler helper that can be mocked in tests
export const scheduleInterval: ScheduleRepeating = (callback, intervalMs) => {
  const id = setInterval(callback, intervalMs);
  return () => clearInterval(id);
};

export interface ProducerControllerDeps {
  engine: Promise<Engine>;
  scheduleRepeating: ScheduleRepeating;
  post: (event: ProducerEvent, transfer?: Transferable[]) => void;
}

type RunCommand = StartCommand | PauseCommand | ResumeCommand;

interface Run {
  id: number;
  settings: ProducerSettings;
  accumulators: Float64Array;
  seq: number;
  totalUpdates: number;
  batches: number;
  paused: boolean;
}

export class ProducerController {
  readonly #scheduleRepeating: ScheduleRepeating;
  readonly #post: ProducerControllerDeps['post'];

  #state: 'loading' | 'ready' | 'failed' | 'disposed' = 'loading';
  #engine: Engine | null = null;
  #waiting: RunCommand[] = [];
  #run: Run | null = null;
  #cancelTicking: CancelTimer | null = null;

  constructor({ engine, scheduleRepeating, post }: ProducerControllerDeps) {
    this.#scheduleRepeating = scheduleRepeating;
    this.#post = post;
    engine.then(
      (loaded) => this.#onLoaded(loaded),
      (error: unknown) => this.#onLoadFailed(error),
    );
  }

  handle(command: ProducerCommand): void {
    if (command.type === 'dispose') {
      this.#disposeOfEngine();
      return;
    }
    switch (this.#state) {
      case 'loading':
        this.#wait(command);
        return;
      case 'ready':
        this.#execute(command);
        return;
      case 'failed':
      case 'disposed':
        return;
    }
  }

  #wait(command: RunCommand): void {
    if (command.type === 'start') {
      this.#waiting = [command];
    } else {
      this.#waiting.push(command);
    }
  }

  #onLoaded(engine: Engine): void {
    if (this.#state === 'disposed') {
      return;
    }
    this.#engine = engine;
    this.#state = 'ready';
    this.#post({ type: 'ready' });
    for (const command of this.#waiting) {
      this.#execute(command);
    }
    this.#waiting = [];
  }

  #onLoadFailed(error: unknown): void {
    if (this.#state === 'disposed') {
      return;
    }
    this.#state = 'failed';
    this.#waiting = [];
    this.#post({ type: 'error', phase: 'init', message: this.#getErrorMessage(error) });
  }

  #execute(command: RunCommand): void {
    switch (command.type) {
      case 'start':
        this.#start(command);
        return;
      case 'pause':
        this.#pause(command.runId);
        return;
      case 'resume':
        this.#resume(command.runId);
        return;
    }
  }

  #start({ runId, settings, seed }: StartCommand): void {
    // Apply starts a NEW run replacing the previous one even if it was paused
    // Pause/resume of the current run is handled by #pause/#resume which keep its values
    this.#stopTicking();
    this.#run = null;
    try {
      this.#engine!.init(settings.instrumentCount, seed);
    } catch (error) {
      this.#post({ type: 'error', runId, phase: 'init', message: this.#getErrorMessage(error) });
      return;
    }
    const run: Run = {
      id: runId,
      settings,
      accumulators: createAccumulators(settings.instrumentCount),
      seq: 0,
      totalUpdates: 0,
      batches: 0,
      paused: false,
    };
    this.#run = run;
    this.#post({ type: 'status', runId, state: 'running' });
    this.#postSnapshot(run);
    this.#startTicking(settings.batchIntervalMs);
  }

  #pause(runId: number): void {
    const run = this.#getCurrentRunIfExists(runId);
    if (run === null || run.paused) {
      return;
    }
    this.#stopTicking();
    run.paused = true;
    this.#post({ type: 'status', runId, state: 'paused' });
  }

  #resume(runId: number): void {
    const run = this.#getCurrentRunIfExists(runId);
    if (run === null || !run.paused) {
      return;
    }
    run.paused = false;
    this.#post({ type: 'status', runId, state: 'running' });
    this.#startTicking(run.settings.batchIntervalMs);
  }

  #disposeOfEngine(): void {
    this.#stopTicking();
    this.#state = 'disposed';
    this.#waiting = [];
    this.#run = null;
    this.#engine = null;
  }

  #getCurrentRunIfExists(runId: number): Run | null {
    return this.#run?.id === runId ? this.#run : null;
  }

  #startTicking(intervalMs: number): void {
    this.#stopTicking();
    this.#cancelTicking = this.#scheduleRepeating(() => this.#tick(), intervalMs);
  }

  #stopTicking(): void {
    this.#cancelTicking?.();
    this.#cancelTicking = null;
  }

  #tick(): void {
    const run = this.#run!;

    let updateCount: number;
    try {
      const updates = this.#engine!.simulateTradeBatch(run.settings.updatesPerBatch);
      accumulateBatch(run.accumulators, updates);
      updateCount = updates.length / TRADE_UPDATE_I32_FIELD_COUNT;
    } catch (error) {
      // The interval would otherwise keep firing for a run that no longer exists
      this.#stopTicking();
      this.#run = null;
      this.#post({ type: 'error', runId: run.id, phase: 'generate', message: this.#getErrorMessage(error) });
      return;
    }

    run.totalUpdates += updateCount;
    run.batches += 1;
    this.#postSnapshot(run);
  }

  #postSnapshot(run: Run): void {
    const data = run.accumulators.slice();
    this.#post(
      {
        type: 'snapshot',
        runId: run.id,
        seq: run.seq,
        totalUpdates: run.totalUpdates,
        batches: run.batches,
        data,
      },
      [data.buffer],
    );
    run.seq += 1;
  }

  #getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}

