import { inject, LOCALE_ID, Pipe, PipeTransform } from '@angular/core';
import { UNAVAILABLE } from './unavailable';

@Pipe({ name: 'imbalance' })
export class ImbalancePipe implements PipeTransform {
  readonly #format = new Intl.NumberFormat(inject(LOCALE_ID), {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    signDisplay: 'exceptZero',
  });

  transform(imbalance: number | null): string {
    return imbalance === null ? UNAVAILABLE : this.#format.format(imbalance);
  }
}
