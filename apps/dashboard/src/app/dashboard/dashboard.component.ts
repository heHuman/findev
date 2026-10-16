import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { ProducerSettingsStore } from '../settings/producer-settings-store';
import { emptyInstrumentRows } from './instrument-row';
import { InstrumentsTableComponent } from './instruments-table/instruments-table.component';

@Component({
  selector: 'app-dashboard',
  imports: [InstrumentsTableComponent],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardComponent {
  readonly #settingsStore = inject(ProducerSettingsStore);

  // TODO: Empty rows for the applied instrument count. The producer step replaces this with live rows.
  readonly rows = computed(() =>
    emptyInstrumentRows(this.#settingsStore.appliedSettings().instrumentCount),
  );
}
