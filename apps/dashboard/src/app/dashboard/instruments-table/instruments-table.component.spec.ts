import { ComponentFixture, TestBed } from '@angular/core/testing';
import { tickerOf, tickersFor } from '@findev/producer';
import { emptyInstrumentMetrics } from '../../producer/metrics';
import { InstrumentMetrics } from '../../producer/producer-events';
import { UNAVAILABLE } from '../formatting/unavailable';
import { InstrumentsTableComponent, MAX_VISIBLE_ROWS } from './instruments-table.component';

describe('InstrumentsTableComponent', () => {
  const EMPTY_ROW_COUNT = 3;
  const VIEWPORT_ROWS = 10;
  const LARGE_COUNT = 10_000;
  // Well above the visible rows plus the CDK buffers, and far below LARGE_COUNT.
  const MAX_RENDERED_ROWS = 100;

  const WORKED_EXAMPLE: InstrumentMetrics = {
    ticker: tickerOf(0),
    lastPriceCents: 10200,
    spreadCents: 4,
    cumulativeVolume: 40,
    vwapCents: 10150,
    imbalance: 0.2,
  };
  const WORKED_EXAMPLE_CELLS = [
    WORKED_EXAMPLE.ticker,
    '$102.00',
    '$0.04',
    '40',
    '$101.50',
    '+0.20',
  ];

  let fixture: ComponentFixture<InstrumentsTableComponent>;

  beforeEach(async () => {
    TestBed.configureTestingModule({ imports: [InstrumentsTableComponent] });
    fixture = TestBed.createComponent(InstrumentsTableComponent);
    fixture.componentRef.setInput('rows', emptyInstrumentMetrics(EMPTY_ROW_COUNT));
    await fixture.whenStable();
    await sizeViewport();
  });

  // jsdom has no layout, so the CDK viewport would measure a height of 0. Give it the height of
  // VIEWPORT_ROWS rows and let it measure again, so the rendered window is deterministic. The
  // component measures again on later row count changes, which reads this same stubbed height.
  async function sizeViewport() {
    const { viewport, rowHeight } = fixture.componentInstance;
    Object.defineProperty(viewport().getElementRef().nativeElement, 'clientHeight', {
      configurable: true,
      value: VIEWPORT_ROWS * rowHeight,
    });
    viewport().checkViewportSize();
    await fixture.whenStable();
  }

  const host = () => fixture.nativeElement as HTMLElement;
  const bodyRows = () => Array.from(host().querySelectorAll('.body .row'));
  const cells = (row: Element) => Array.from(row.querySelectorAll('.cell'));
  const cellTexts = () => bodyRows().map((row) => cells(row).map((c) => c.textContent?.trim()));

  it('renders one row per input row, with the tickers in order', () => {
    expect(cellTexts().map(([ticker]) => ticker)).toEqual(tickersFor(EMPTY_ROW_COUNT));
  });

  it('shows unavailable markers and zero volume for rows without data', () => {
    expect(bodyRows()).toHaveLength(EMPTY_ROW_COUNT);
    for (const row of bodyRows()) {
      const metrics = cells(row).slice(1);
      expect(metrics.map((c) => c.textContent?.trim())).toEqual([
        UNAVAILABLE,
        UNAVAILABLE,
        '0',
        UNAVAILABLE,
        UNAVAILABLE,
      ]);
    }
  });

  it('shows formatted values for a row with data', async () => {
    fixture.componentRef.setInput('rows', [WORKED_EXAMPLE]);
    await fixture.whenStable();

    expect(cellTexts()).toEqual([WORKED_EXAMPLE_CELLS]);
  });

  it('renders only a window of a large list', async () => {
    fixture.componentRef.setInput('rows', emptyInstrumentMetrics(LARGE_COUNT));
    await fixture.whenStable();

    expect(bodyRows().length).toBeGreaterThanOrEqual(VIEWPORT_ROWS);
    expect(bodyRows().length).toBeLessThan(MAX_RENDERED_ROWS);
    expect(cellTexts()[0]?.[0]).toBe(tickerOf(0));
  });

  it('grows with its rows up to MAX_VISIBLE_ROWS, then stops at that height', async () => {
    const { rowHeight } = fixture.componentInstance;
    const bodyHeight = () => host().querySelector<HTMLElement>('.body')!.style.height;

    expect(bodyHeight()).toBe(`${EMPTY_ROW_COUNT * rowHeight}px`);

    fixture.componentRef.setInput('rows', emptyInstrumentMetrics(LARGE_COUNT));
    await fixture.whenStable();
    expect(bodyHeight()).toBe(`${MAX_VISIBLE_ROWS * rowHeight}px`);
  });
});
