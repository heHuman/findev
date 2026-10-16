import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
  DEFAULT_PRODUCER_SETTINGS,
  PRODUCER_SETTINGS_LIMITS,
  ProducerSettings,
} from '../producer-settings';
import { ProducerSettingsStore } from '../producer-settings-store';
import { Settings } from './settings';

type SettingKey = keyof ProducerSettings;

describe('Settings', () => {
  // Valid settings that differ from the defaults in every field.
  const CUSTOM_SETTINGS: ProducerSettings = {
    instrumentCount: 12,
    updatesPerBatch: 200,
    batchIntervalMs: 1000,
  };

  // What gets typed into a masked input, and what the input shows afterwards.
  const DECIMAL_INPUT = '1.5';
  const DECIMAL_MASKED = '1';
  const NEGATIVE_INPUT = '-3';
  const NEGATIVE_MASKED = '3';
  const LETTERS_INPUT = 'abc';
  const FOUR_DIGIT_INPUT = '1000'; // stays as typed: no thousands separator in the input
  const LONE_ZERO_INPUT = '0'; // stays as typed
  const LEADING_ZERO_INPUT = '05';
  const LEADING_ZERO_MASKED = '5';

  // 1000 updates every 50 ms: a rate big enough to need a thousands separator.
  const FAST_UPDATES_PER_BATCH = 1000;
  const FAST_BATCH_INTERVAL_MS = 50;
  const FAST_RATE_TEXT = '≈ 20,000 updates/s across all instruments';

  const NO_ERROR = '';
  const REQUIRED_ERROR = 'Required';
  const RATE_HIDDEN_TEXT = 'Fix the values above to see the update rate';
  const APPLIED_STATUS = 'Applied: new run started';
  const MS_PER_SECOND = 1000;

  const rangeError = (key: SettingKey) => {
    const { min, max } = PRODUCER_SETTINGS_LIMITS[key];
    return `Must be between ${min} and ${max}`;
  };
  const rateText = (settings: ProducerSettings) => {
    const rate = (settings.updatesPerBatch * MS_PER_SECOND) / settings.batchIntervalMs;
    const formatted = rate.toLocaleString('en-US', { maximumFractionDigits: 1 });
    return `≈ ${formatted} updates/s across all instruments`;
  };
  const asFormValues = (settings: ProducerSettings) => ({
    instrumentCount: String(settings.instrumentCount),
    updatesPerBatch: String(settings.updatesPerBatch),
    batchIntervalMs: String(settings.batchIntervalMs),
  });

  let fixture: ComponentFixture<Settings>;
  let store: ProducerSettingsStore;

  beforeEach(async () => {
    TestBed.configureTestingModule({ imports: [Settings] });
    store = TestBed.inject(ProducerSettingsStore);
    fixture = TestBed.createComponent(Settings);
    await fixture.whenStable();
  });

  const host = () => fixture.nativeElement as HTMLElement;
  const input = (key: SettingKey) =>
    host().querySelector<HTMLInputElement>(`input[name="${key}"]`)!;
  const formValues = () => ({
    instrumentCount: input('instrumentCount').value,
    updatesPerBatch: input('updatesPerBatch').value,
    batchIntervalMs: input('batchIntervalMs').value,
  });
  const errorText = (key: SettingKey) =>
    input(key).closest('mat-form-field')!.querySelector('mat-error')?.textContent?.trim() ?? '';
  const button = (text: string) =>
    Array.from(host().querySelectorAll('button')).find((b) => b.textContent?.trim() === text)!;
  const text = (selector: string) => host().querySelector(selector)?.textContent?.trim() ?? '';

  async function type(key: SettingKey, value: string | number) {
    input(key).value = String(value);
    input(key).dispatchEvent(new Event('input'));
    await fixture.whenStable();
  }

  it('starts with the default settings and their nominal rate', () => {
    expect(formValues()).toEqual(asFormValues(DEFAULT_PRODUCER_SETTINGS));
    expect(button('Apply').disabled).toBe(false);
    expect(text('.rate')).toBe(rateText(DEFAULT_PRODUCER_SETTINGS));
  });

  // Just outside, and exactly on, each end of the field's allowed range.
  const boundaryCases = (key: SettingKey) => {
    const { min, max } = PRODUCER_SETTINGS_LIMITS[key];
    return [
      { key, value: min - 1, error: rangeError(key) },
      { key, value: min, error: NO_ERROR },
      { key, value: max, error: NO_ERROR },
      { key, value: max + 1, error: rangeError(key) },
    ];
  };

  it.each([
    ...boundaryCases('instrumentCount'),
    ...boundaryCases('updatesPerBatch'),
    ...boundaryCases('batchIntervalMs'),
    { key: 'batchIntervalMs' as const, value: '', error: REQUIRED_ERROR },
  ])('validates $key = "$value"', async ({ key, value, error }) => {
    await type(key, value);

    expect(errorText(key)).toBe(error);
    expect(button('Apply').disabled).toBe(error !== NO_ERROR);
  });

  it.each([
    {
      key: 'instrumentCount' as const,
      problem: 'below the minimum',
      invalidValue: PRODUCER_SETTINGS_LIMITS.instrumentCount.min - 1,
    },
    {
      key: 'updatesPerBatch' as const,
      problem: 'above the maximum',
      invalidValue: PRODUCER_SETTINGS_LIMITS.updatesPerBatch.max + 1,
    },
    { key: 'batchIntervalMs' as const, problem: 'empty', invalidValue: '' },
  ])(
    'disables Apply while $key is $problem, and enables it again once fixed',
    async ({ key, invalidValue }) => {
      expect(button('Apply').disabled).toBe(false);

      await type(key, invalidValue);
      expect(button('Apply').disabled).toBe(true);

      // Clicking the disabled button applies nothing.
      button('Apply').click();
      await fixture.whenStable();
      expect(store.appliedSettings()).toEqual(DEFAULT_PRODUCER_SETTINGS);

      await type(key, CUSTOM_SETTINGS[key]);
      expect(button('Apply').disabled).toBe(false);
    },
  );

  it('masks the inputs so only digits get in', async () => {
    await type('updatesPerBatch', DECIMAL_INPUT);
    expect(input('updatesPerBatch').value).toBe(DECIMAL_MASKED);
    // The form got the masked value, so the rate uses it rather than the typed one.
    expect(text('.rate')).toBe(
      rateText({ ...DEFAULT_PRODUCER_SETTINGS, updatesPerBatch: Number(DECIMAL_MASKED) }),
    );

    await type('updatesPerBatch', NEGATIVE_INPUT);
    expect(input('updatesPerBatch').value).toBe(NEGATIVE_MASKED);

    await type('updatesPerBatch', LETTERS_INPUT);
    expect(input('updatesPerBatch').value).toBe('');

    await type('updatesPerBatch', FOUR_DIGIT_INPUT);
    expect(input('updatesPerBatch').value).toBe(FOUR_DIGIT_INPUT);

    // Leading zeros go away while typing, without a blur; a lone "0" stays.
    await type('updatesPerBatch', LONE_ZERO_INPUT);
    expect(input('updatesPerBatch').value).toBe(LONE_ZERO_INPUT);
    await type('updatesPerBatch', LEADING_ZERO_INPUT);
    expect(input('updatesPerBatch').value).toBe(LEADING_ZERO_MASKED);
  });

  it('updates the nominal rate as values change, and hides it while invalid', async () => {
    await type('updatesPerBatch', FAST_UPDATES_PER_BATCH);
    await type('batchIntervalMs', FAST_BATCH_INTERVAL_MS);
    expect(text('.rate')).toBe(FAST_RATE_TEXT);

    await type('batchIntervalMs', '');
    expect(text('.rate')).toBe(RATE_HIDDEN_TEXT);
  });

  it('does not apply anything while editing', async () => {
    await type('instrumentCount', CUSTOM_SETTINGS.instrumentCount);
    await type('updatesPerBatch', CUSTOM_SETTINGS.updatesPerBatch);

    expect(store.appliedSettings()).toEqual(DEFAULT_PRODUCER_SETTINGS);
    expect(text('.status')).toBe('');
  });

  it('applies the form values when Apply is clicked', async () => {
    await type('instrumentCount', CUSTOM_SETTINGS.instrumentCount);
    await type('batchIntervalMs', CUSTOM_SETTINGS.batchIntervalMs);
    button('Apply').click();
    await fixture.whenStable();

    expect(store.appliedSettings()).toEqual({
      ...DEFAULT_PRODUCER_SETTINGS,
      instrumentCount: CUSTOM_SETTINGS.instrumentCount,
      batchIntervalMs: CUSTOM_SETTINGS.batchIntervalMs,
    });
    expect(text('.status')).toBe(APPLIED_STATUS);
  });

  it('resets the form to the defaults and applies them', async () => {
    store.apply(CUSTOM_SETTINGS);
    fixture.destroy();
    fixture = TestBed.createComponent(Settings);
    await fixture.whenStable();

    button('Reset to defaults').click();
    await fixture.whenStable();

    expect(formValues()).toEqual(asFormValues(DEFAULT_PRODUCER_SETTINGS));
    expect(store.appliedSettings()).toEqual(DEFAULT_PRODUCER_SETTINGS);
    expect(text('.status')).toBe(APPLIED_STATUS);
  });

  it('shows the applied settings when the page is opened again', async () => {
    await type('instrumentCount', CUSTOM_SETTINGS.instrumentCount);
    button('Apply').click();
    await fixture.whenStable();

    fixture.destroy();
    fixture = TestBed.createComponent(Settings);
    await fixture.whenStable();

    expect(formValues()).toEqual(
      asFormValues({
        ...DEFAULT_PRODUCER_SETTINGS,
        instrumentCount: CUSTOM_SETTINGS.instrumentCount,
      }),
    );
  });
});
