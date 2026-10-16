import { ChangeDetectionStrategy, Component } from '@angular/core';
import { ShellComponent } from './shell/shell.component';

@Component({
  imports: [ShellComponent],
  selector: 'app-root',
  templateUrl: './app.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent {}
