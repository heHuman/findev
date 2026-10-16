import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TICKERS } from '@findev/producer';
import { UNAVAILABLE } from '../formatting/unavailable';
import { emptyInstrumentRows, InstrumentRow } from '../instrument-row';
import { InstrumentsTableComponent } from './instruments-table.component';

describe('InstrumentsTableComponent', () => {
  const EMPTY_ROW_COUNT = 3;

  const WORKED_EXAMPLE: InstrumentRow = {
    ticker: TICKERS[0]!,
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
    fixture.componentRef.setInput('rows', emptyInstrumentRows(EMPTY_ROW_COUNT));
    await fixture.whenStable();
  });

  const bodyRows = () =>
    Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('.body [role="row"]'));
  const cells = (row: Element) => Array.from(row.querySelectorAll('[role="cell"]'));
  const cellTexts = () => bodyRows().map((row) => cells(row).map((c) => c.textContent?.trim()));

  it('renders one row per input row, with the tickers in order', () => {
    expect(cellTexts().map(([ticker]) => ticker)).toEqual(TICKERS.slice(0, EMPTY_ROW_COUNT));
  });

  it('shows unavailable markers and zero volume for rows without data', () => {
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
});
