import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { MarketUpdate, tickersFor } from '@findev/producer';
import { accumulateBatch, createAccumulators, deriveMetrics } from '../producer/metrics';
import { ProducerService } from '../producer/producer.service';
import { encodeUpdates } from '../producer/testing/encode-updates';
import { provideFakeProducerWorker } from '../producer/testing/fake-producer-worker';
import { DEFAULT_PRODUCER_SETTINGS, PRODUCER_SETTINGS_LIMITS } from '../settings/producer-settings';
import { DashboardComponent } from './dashboard.component';
import { InstrumentsTableComponent } from './instruments-table/instruments-table.component';

describe('DashboardComponent', () => {
  const MAX_APPLIED_INSTRUMENT_COUNT = PRODUCER_SETTINGS_LIMITS.instrumentCount.max;
  const RUN_ID = 1;
  const FIRST = 0;
  const TRADE: MarketUpdate = {
    instrumentIndex: FIRST,
    priceCents: 10200,
    tradeQty: 30,
    bidCents: 10196,
    askCents: 10200,
    bidQty: 600,
    askQty: 400,
  };
  const LAST_PRICE_COLUMN = 1;
  const TRADE_PRICE_TEXT = '$102.00';
  // Enough updates to need thousands separators in the status line.
  const TOTAL_UPDATES = 12400;
  const BATCHES = 1240;
  const statusText = (status: string, totalUpdates: number, batches: number) =>
    `Status: ${status} · Run ${RUN_ID} · ` +
    `${totalUpdates.toLocaleString('en-US')} updates in ${batches.toLocaleString('en-US')} batches`;
  const LOAD_ERROR = 'Could not fetch producer Wasm from producer.wasm: HTTP 404 Not Found';

  let fixture: ComponentFixture<DashboardComponent>;
  let fakes: ReturnType<typeof provideFakeProducerWorker>;

  beforeEach(async () => {
    fakes = provideFakeProducerWorker();
    TestBed.configureTestingModule({ imports: [DashboardComponent], providers: fakes.providers });
    fixture = TestBed.createComponent(DashboardComponent);
    await fixture.whenStable();
  });

  const host = () => fixture.nativeElement as HTMLElement;
  const worker = () => fakes.workers.at(-1)!;
  const text = (selector: string) =>
    host().querySelector(selector)?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  const button = (label: string) =>
    Array.from(host().querySelectorAll('button')).find((b) => b.textContent?.trim() === label);
  const pauseToggle = () => host().querySelector<HTMLButtonElement>('.pause-toggle')!;
  const tickers = () =>
    Array.from(host().querySelectorAll('.body .row .ticker')).map((cell) =>
      cell.textContent?.trim(),
    );
  const tableRows = () =>
    fixture.debugElement
      .query(By.directive(InstrumentsTableComponent))
      .injector.get(InstrumentsTableComponent)
      .rows();
  const firstRowCells = () =>
    Array.from(host().querySelectorAll('.body .row:first-child .cell')).map((cell) =>
      cell.textContent?.trim(),
    );

  // The worker loads the Wasm, confirms the run, and posts one batch with TRADE.
  async function runOneBatch() {
    const accumulators = createAccumulators(DEFAULT_PRODUCER_SETTINGS.instrumentCount);
    accumulateBatch(accumulators, encodeUpdates([TRADE]));
    worker().emit({ type: 'ready' });
    worker().emit({ type: 'status', runId: RUN_ID, state: 'running' });
    worker().emit({
      type: 'snapshot',
      runId: RUN_ID,
      seq: 1,
      totalUpdates: TOTAL_UPDATES,
      batches: BATCHES,
      metrics: deriveMetrics(accumulators),
    });
    await fixture.whenStable();
  }

  it('shows a row for each instrument in the default settings', () => {
    expect(tickers()).toEqual(tickersFor(DEFAULT_PRODUCER_SETTINGS.instrumentCount));
  });

  // The maximum is more than the named tickers, so the last rows get generated ones (I0050, ...).
  // The table renders only a window of them, so check the rows it gets.
  it('shows the new number of rows after settings are applied', async () => {
    TestBed.inject(ProducerService).apply({
      ...DEFAULT_PRODUCER_SETTINGS,
      instrumentCount: MAX_APPLIED_INSTRUMENT_COUNT,
    });
    await fixture.whenStable();

    expect(tableRows().map((row) => row.ticker)).toEqual(tickersFor(MAX_APPLIED_INSTRUMENT_COUNT));
  });

  it('shows the values from the latest snapshot in the table', async () => {
    await runOneBatch();

    expect(firstRowCells()[LAST_PRICE_COLUMN]).toBe(TRADE_PRICE_TEXT);
  });

  it('shows the status, run and counts in the status line', async () => {
    expect(text('.status-line')).toBe(statusText('Starting', 0, 0));

    await runOneBatch();

    expect(text('.status-line')).toBe(statusText('Running', TOTAL_UPDATES, BATCHES));
  });

  it('pauses and resumes the run with one toggle button', async () => {
    // Nothing to pause until the worker has started the run.
    expect(pauseToggle().disabled).toBe(true);
    await runOneBatch();

    pauseToggle().click();
    await fixture.whenStable();
    expect(worker().posted.at(-1)).toEqual({ type: 'pause', runId: RUN_ID });
    expect(pauseToggle().textContent?.trim()).toBe('Resume');
    expect(text('.status-line')).toContain('Status: Paused');

    pauseToggle().click();
    await fixture.whenStable();
    expect(worker().posted.at(-1)).toEqual({ type: 'resume', runId: RUN_ID });
    expect(pauseToggle().textContent?.trim()).toBe('Pause');
  });

  it('shows a load error with a Retry button that starts again on a new worker', async () => {
    expect(button('Retry')).toBeUndefined();

    worker().emit({ type: 'error', phase: 'init', message: LOAD_ERROR });
    await fixture.whenStable();

    expect(text('.error-message')).toBe(LOAD_ERROR);
    expect(pauseToggle().disabled).toBe(true);

    button('Retry')!.click();
    await fixture.whenStable();
    expect(fakes.workers).toHaveLength(2);
    expect(worker().posted.at(-1)).toMatchObject({ type: 'start' });
    expect(button('Retry')).toBeUndefined();
  });
});
