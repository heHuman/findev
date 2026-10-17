import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { PRODUCER_STATUS_LABELS, ProducerService } from '../producer/producer.service';
import { InstrumentsTableComponent } from './instruments-table/instruments-table.component';

@Component({
  selector: 'app-dashboard',
  imports: [InstrumentsTableComponent, MatButtonModule, DecimalPipe],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardComponent {
  readonly producer = inject(ProducerService);
  readonly statusLabels = PRODUCER_STATUS_LABELS;

  readonly canTogglePause = computed(() => {
    const status = this.producer.status();
    return status === 'running' || status === 'paused';
  });

  togglePause(): void {
    if (this.producer.status() === 'paused') {
      this.producer.resume();
    } else {
      this.producer.pause();
    }
  }
}
