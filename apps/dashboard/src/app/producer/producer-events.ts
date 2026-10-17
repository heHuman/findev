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

// The display values of one instrument; null means unavailable
export interface InstrumentMetrics {
  ticker: string;
  lastPriceCents: number | null;
  // askPrice − bidPrice
  spreadCents: number | null;
  cumulativeVolume: number;
  // sum(tradePrice × tradeQuantity) / sum(tradeQuantity) since the run started
  vwapCents: number | null;
  // Latest (bidQuantity − askQuantity) / (bidQuantity + askQuantity)
  imbalance: number | null;
}

export interface SnapshotEvent {
  type: 'snapshot';
  runId: number;
  seq: number;
  totalUpdates: number;
  batches: number;
  metrics: InstrumentMetrics[];
}

export interface ProducerErrorEvent {
  type: 'error';
  runId?: number;
  phase: 'init' | 'generate';
  message: string;
}

export type ProducerEvent = ReadyEvent | StatusEvent | SnapshotEvent | ProducerErrorEvent;
