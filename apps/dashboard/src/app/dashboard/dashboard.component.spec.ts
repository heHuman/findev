import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TICKERS } from '@findev/producer';
import { DEFAULT_PRODUCER_SETTINGS, PRODUCER_SETTINGS_LIMITS } from '../settings/producer-settings';
import { ProducerSettingsStore } from '../settings/producer-settings-store';
import { DashboardComponent } from './dashboard.component';

describe('DashboardComponent', () => {
  const MAX_APPLIED_INSTRUMENT_COUNT = PRODUCER_SETTINGS_LIMITS.instrumentCount.max;

  let fixture: ComponentFixture<DashboardComponent>;
  let store: ProducerSettingsStore;

  beforeEach(async () => {
    TestBed.configureTestingModule({ imports: [DashboardComponent] });
    store = TestBed.inject(ProducerSettingsStore);
    fixture = TestBed.createComponent(DashboardComponent);
    await fixture.whenStable();
  });

  const tickers = () =>
    Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('.body [role="row"] .ticker'),
    ).map((cell) => cell.textContent?.trim());

  it('shows a row for each instrument in the default settings', () => {
    expect(tickers()).toEqual(TICKERS.slice(0, DEFAULT_PRODUCER_SETTINGS.instrumentCount));
  });

  it('shows the new number of rows after settings are applied', async () => {
    store.apply({ ...DEFAULT_PRODUCER_SETTINGS, instrumentCount: MAX_APPLIED_INSTRUMENT_COUNT });
    await fixture.whenStable();

    expect(tickers()).toEqual(TICKERS.slice(0, MAX_APPLIED_INSTRUMENT_COUNT));
  });
});
