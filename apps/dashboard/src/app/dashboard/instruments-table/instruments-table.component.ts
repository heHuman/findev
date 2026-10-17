import {
  CdkFixedSizeVirtualScroll,
  CdkVirtualForOf,
  CdkVirtualScrollViewport,
} from '@angular/cdk/scrolling';
import { DecimalPipe } from '@angular/common';
import {
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  TrackByFunction,
  viewChild,
} from '@angular/core';
import { ImbalancePipe } from '../formatting/imbalance.pipe';
import { InstrumentMetrics } from '../../producer/producer-events';
import { PricePipe } from '../formatting/price.pipe';

const ROW_HEIGHT_PX = 36;
export const MAX_VISIBLE_ROWS = 10;
const MIN_BUFFER_ROWS = 10;
const MAX_BUFFER_ROWS = 20;

@Component({
  selector: 'app-instruments-table',
  imports: [
    CdkVirtualScrollViewport,
    CdkFixedSizeVirtualScroll,
    CdkVirtualForOf,
    DecimalPipe,
    PricePipe,
    ImbalancePipe,
  ],
  templateUrl: './instruments-table.component.html',
  styleUrl: './instruments-table.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[style.--row-height.px]': 'rowHeight' },
})
export class InstrumentsTableComponent {
  readonly rows = input.required<readonly InstrumentMetrics[]>();

  readonly rowHeight = ROW_HEIGHT_PX;
  readonly minBufferPx = MIN_BUFFER_ROWS * ROW_HEIGHT_PX;
  readonly maxBufferPx = MAX_BUFFER_ROWS * ROW_HEIGHT_PX;

  readonly bodyHeight = computed(
    () => Math.min(this.rows().length, MAX_VISIBLE_ROWS) * ROW_HEIGHT_PX,
  );
  readonly trackByTicker: TrackByFunction<InstrumentMetrics> = (_index, row) => row.ticker;

  readonly viewport = viewChild.required(CdkVirtualScrollViewport);

  constructor() {
    afterRenderEffect(() => {
      this.bodyHeight();
      this.viewport().checkViewportSize();
    });
  }
}
