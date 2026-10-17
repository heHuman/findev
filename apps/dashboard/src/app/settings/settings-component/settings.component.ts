import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import {
  NonNullableFormBuilder,
  ReactiveFormsModule,
  ValidatorFn,
  Validators,
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MaskitoDirective } from '@maskito/angular';
import { MaskitoOptions, MaskitoPostprocessor } from '@maskito/core';
import { maskitoNumber } from '@maskito/kit';
import { map } from 'rxjs';
import {
  DEFAULT_PRODUCER_SETTINGS,
  PRODUCER_SETTINGS_LIMITS,
  ProducerSettings,
} from '../producer-settings';
import { ProducerService } from '../../producer/producer.service';
import { ProducerSettingsStore } from '../producer-settings-store';
import { ErrorStateMatcher, ShowOnDirtyErrorStateMatcher } from '@angular/material/core';

type SettingKey = keyof ProducerSettings;
type SettingsFormValue = Record<SettingKey, string>;

const numberMask = maskitoNumber({
  maximumFractionDigits: 0,
  min: 0,
  thousandSeparator: '',
});

// Drops leading zeros as you type ("05" -> "5", a lone "0" stays) and shifts the caret to match.
const stripLeadingZeros: MaskitoPostprocessor = ({ value, selection: [from, to] }) => {
  const removed = value.length - value.replace(/^0+(?=\d)/, '').length;
  return {
    value: value.slice(removed),
    selection: [Math.max(from - removed, 0), Math.max(to - removed, 0)],
  };
};

export const integerMask: MaskitoOptions = {
  ...numberMask,
  postprocessors: [...(numberMask.postprocessors ?? []), stripLeadingZeros],
};

@Component({
  selector: 'app-settings',
  imports: [
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MaskitoDirective,
    DecimalPipe,
  ],
  providers: [{ provide: ErrorStateMatcher, useClass: ShowOnDirtyErrorStateMatcher }],
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsComponent {
  readonly #store = inject(ProducerSettingsStore);
  readonly #producer = inject(ProducerService);

  readonly limits = PRODUCER_SETTINGS_LIMITS;
  readonly integerMask = integerMask;

  readonly fields: readonly { key: SettingKey; label: string }[] = [
    { key: 'instrumentCount', label: 'Instrument count' },
    { key: 'updatesPerBatch', label: 'Updates per batch' },
    { key: 'batchIntervalMs', label: 'Batch interval (ms)' },
  ];
  readonly #initialValue = this.#settingsToFormValue(this.#store.appliedSettings());

  readonly form = inject(NonNullableFormBuilder).group({
    instrumentCount: [
      this.#initialValue.instrumentCount,
      this.#getNumericFieldValidators('instrumentCount'),
    ],
    updatesPerBatch: [
      this.#initialValue.updatesPerBatch,
      this.#getNumericFieldValidators('updatesPerBatch'),
    ],
    batchIntervalMs: [
      this.#initialValue.batchIntervalMs,
      this.#getNumericFieldValidators('batchIntervalMs'),
    ],
  });

  readonly #lastValidSettings = toSignal(
    this.form.valueChanges.pipe(map(() => this.#getCurrentValidSettings())),
    { initialValue: this.#getCurrentValidSettings() },
  );

  readonly nominalRate = computed(() => {
    const settings = this.#lastValidSettings();
    return settings ? this.#getNominalUpdatesPerSecond(settings) : null;
  });

  readonly justApplied = signal(false);

  constructor() {
    this.form.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.justApplied.set(false));
  }

  apply(): void {
    if (this.form.invalid) {
      return;
    }
    this.#applySettings(this.#formValueToSettings(this.form.getRawValue()));
  }

  resetToDefaults(): void {
    this.form.setValue(this.#settingsToFormValue(DEFAULT_PRODUCER_SETTINGS));
    this.#applySettings(DEFAULT_PRODUCER_SETTINGS);
  }

  errorMessage(key: SettingKey): string {
    if (this.form.controls[key].hasError('required')) {
      return 'Required';
    }
    const { min, max } = this.limits[key];
    return `Must be between ${min} and ${max}`;
  }

  #applySettings(settings: ProducerSettings): void {
    this.#producer.apply(settings);
    this.form.markAsPristine();
    this.justApplied.set(true);
  }

  #getCurrentValidSettings(): ProducerSettings | null {
    return this.form.valid ? this.#formValueToSettings(this.form.getRawValue()) : null;
  }

  #getNominalUpdatesPerSecond(settings: ProducerSettings): number {
    return (settings.updatesPerBatch * 1000) / settings.batchIntervalMs;
  }

  #getNumericFieldValidators(key: SettingKey): ValidatorFn[] {
    const { min, max } = PRODUCER_SETTINGS_LIMITS[key];
    return [Validators.required, Validators.min(min), Validators.max(max)];
  }

  #settingsToFormValue(settings: ProducerSettings): SettingsFormValue {
    return {
      instrumentCount: String(settings.instrumentCount),
      updatesPerBatch: String(settings.updatesPerBatch),
      batchIntervalMs: String(settings.batchIntervalMs),
    };
  }

  #formValueToSettings(value: SettingsFormValue): ProducerSettings {
    return {
      instrumentCount: Number(value.instrumentCount),
      updatesPerBatch: Number(value.updatesPerBatch),
      batchIntervalMs: Number(value.batchIntervalMs),
    };
  }
}
