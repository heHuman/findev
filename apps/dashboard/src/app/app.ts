import { ChangeDetectionStrategy, Component } from '@angular/core';
import { Shell } from './shell/shell';

@Component({
  imports: [Shell],
  selector: 'app-root',
  templateUrl: './app.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {}
