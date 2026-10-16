import { TestBed } from '@angular/core/testing';
import { ImbalancePipe } from './imbalance.pipe';
import { PricePipe } from './price.pipe';
import { UNAVAILABLE } from './unavailable';

describe('Formatting pipes', () => {
  const WORKED_EXAMPLE = {
    lastPriceCents: 10200,
    vwapCents: 10150,
    spreadCents: 4,
    imbalance: 0.2,
  };
  const MILLIONS_PRICE_CENTS = 123456789;
  const HALF_ASK_SIDE_IMBALANCE = -0.5;
  const ALL_BID_IMBALANCE = 1;
  const ALL_ASK_IMBALANCE = -1;

  let price: PricePipe;
  let imbalance: ImbalancePipe;

  beforeEach(() => {
    price = new PricePipe();
    imbalance = TestBed.runInInjectionContext(() => new ImbalancePipe());
  });

  it.each([
    { cents: WORKED_EXAMPLE.lastPriceCents, text: '$102.00' },
    { cents: WORKED_EXAMPLE.vwapCents, text: '$101.50' },
    { cents: WORKED_EXAMPLE.spreadCents, text: '$0.04' },
    { cents: MILLIONS_PRICE_CENTS, text: '$1,234,567.89' },
  ])('formats $cents cents as $text', ({ cents, text }) => {
    expect(price.transform(cents)).toBe(text);
  });

  it.each([
    { value: WORKED_EXAMPLE.imbalance, text: '+0.20' },
    { value: HALF_ASK_SIDE_IMBALANCE, text: '-0.50' },
    { value: ALL_BID_IMBALANCE, text: '+1.00' },
    { value: ALL_ASK_IMBALANCE, text: '-1.00' },
  ])('formats imbalance $value as $text', ({ value, text }) => {
    expect(imbalance.transform(value)).toBe(text);
  });

  it('shows the unavailable marker for a missing value', () => {
    expect(price.transform(null)).toBe(UNAVAILABLE);
    expect(imbalance.transform(null)).toBe(UNAVAILABLE);
  });
});
