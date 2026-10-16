import { Pipe, PipeTransform } from '@angular/core';
import { MaskitoNumberParams, maskitoStringifyNumber } from '@maskito/kit';
import { UNAVAILABLE } from './unavailable';

const CENTS_PER_DOLLAR = 100;

const PRICE_FORMAT: MaskitoNumberParams = {
  prefix: '$',
  thousandSeparator: ',',
  decimalSeparator: '.',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  minusSign: '-',
  negativePattern: 'minusFirst',
};

@Pipe({ name: 'price' })
export class PricePipe implements PipeTransform {
  transform(cents: number | null): string {
    if (cents === null) {
      return UNAVAILABLE;
    }
    return maskitoStringifyNumber(Math.round(cents) / CENTS_PER_DOLLAR, PRICE_FORMAT);
  }
}
