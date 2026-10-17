import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatToolbarModule } from '@angular/material/toolbar';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { APP_NAME } from '../app-title-strategy';
import { PRODUCER_STATUS_LABELS, ProducerService } from '../producer/producer.service';

@Component({
  selector: 'app-shell',
  imports: [MatToolbarModule, MatButtonModule, RouterLink, RouterLinkActive, RouterOutlet],
  templateUrl: './shell.component.html',
  styleUrl: './shell.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ShellComponent {
  readonly appName = APP_NAME;
  readonly producer = inject(ProducerService);
  readonly statusLabels = PRODUCER_STATUS_LABELS;
}
