import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { routes } from '../app.routes';
import { provideFakeProducerWorker } from '../producer/testing/fake-producer-worker';
import { ShellComponent } from './shell.component';

describe('ShellComponent', () => {
  const LOAD_ERROR = 'Could not fetch producer Wasm from producer.wasm: HTTP 404 Not Found';

  let fixture: ComponentFixture<ShellComponent>;
  let fakes: ReturnType<typeof provideFakeProducerWorker>;

  beforeEach(async () => {
    fakes = provideFakeProducerWorker();
    TestBed.configureTestingModule({
      imports: [ShellComponent],
      providers: [provideRouter(routes), fakes.providers],
    });
    fixture = TestBed.createComponent(ShellComponent);
    await fixture.whenStable();
  });

  it('renders the main nav links with the right hrefs', () => {
    const links = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLAnchorElement>('nav a'),
    );

    expect(links.map((a) => [a.textContent?.trim(), a.getAttribute('href')])).toEqual([
      ['Dashboard', '/'],
      ['Settings', '/settings'],
    ]);
  });

  it('opens the matching page when a nav link is clicked', async () => {
    const host = fixture.nativeElement as HTMLElement;
    const clickLink = async (text: string) => {
      const link = Array.from(host.querySelectorAll<HTMLAnchorElement>('nav a')).find(
        (a) => a.textContent?.trim() === text,
      );
      link!.click();
      await fixture.whenStable();
    };

    await clickLink('Settings');
    expect(host.querySelector('app-settings')).not.toBeNull();
    expect(host.querySelector('app-dashboard')).toBeNull();

    await clickLink('Dashboard');
    expect(host.querySelector('app-dashboard')).not.toBeNull();
    expect(host.querySelector('app-settings')).toBeNull();
    // Both pages share the app's single producer.
    expect(fakes.workers).toHaveLength(1);
  });

  it('shows the producer status in the toolbar', async () => {
    const badge = () =>
      (fixture.nativeElement as HTMLElement).querySelector('.status-badge')!.textContent?.trim();
    expect(badge()).toBe('Producer: Starting');

    fakes.workers[0].emit({ type: 'error', phase: 'init', message: LOAD_ERROR });
    await fixture.whenStable();

    expect(badge()).toBe('Producer: Error');
  });
});
