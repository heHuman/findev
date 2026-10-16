import { Injectable, signal } from '@angular/core';
import { DEFAULT_PRODUCER_SETTINGS, ProducerSettings } from './producer-settings';

@Injectable({ providedIn: 'root' })
export class ProducerSettingsStore {
  readonly #appliedSettings = signal<ProducerSettings>(DEFAULT_PRODUCER_SETTINGS);

  readonly appliedSettings = this.#appliedSettings.asReadonly();

  apply(settings: ProducerSettings): void {
    this.#appliedSettings.set({ ...settings });
  }
}
