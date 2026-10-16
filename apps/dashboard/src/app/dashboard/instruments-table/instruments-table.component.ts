import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { ImbalancePipe } from '../formatting/imbalance.pipe';
import { PricePipe } from '../formatting/price.pipe';
import { InstrumentRow } from '../instrument-row';

@Component({
  selector: 'app-instruments-table',
  imports: [DecimalPipe, PricePipe, ImbalancePipe],
  templateUrl: './instruments-table.component.html',
  styleUrl: './instruments-table.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InstrumentsTableComponent {
  readonly rows = input.required<readonly InstrumentRow[]>();
}
