import { ProducerSettings } from '../settings/producer-settings';

export interface StartCommand {
  type: 'start';
  runId: number;
  settings: ProducerSettings;
  seed: number;
}

export interface PauseCommand {
  type: 'pause';
  runId: number;
}

export interface ResumeCommand {
  type: 'resume';
  runId: number;
}

export interface DisposeCommand {
  type: 'dispose';
}

export type ProducerCommand = StartCommand | PauseCommand | ResumeCommand | DisposeCommand;

export interface ReadyEvent {
  type: 'ready';
}

export type RunState = 'running' | 'paused';

export interface StatusEvent {
  type: 'status';
  runId: number;
  state: RunState;
}

export interface SnapshotEvent {
  type: 'snapshot';
  runId: number;
  seq: number;
  totalUpdates: number;
  batches: number;
  data: Float64Array;
}

export interface ProducerErrorEvent {
  type: 'error';
  runId?: number;
  phase: 'init' | 'generate';
  message: string;
}

export type ProducerEvent = ReadyEvent | StatusEvent | SnapshotEvent | ProducerErrorEvent;

export const SNAPSHOT_FIELD = {
  lastPriceCents: 0,
  bidCents: 1,
  askCents: 2,
  bidQty: 3,
  askQty: 4,
  volume: 5,
  notionalCents: 6,
} as const;

export const SNAPSHOT_FIELD_COUNT = Object.keys(SNAPSHOT_FIELD).length;
