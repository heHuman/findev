import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { routes } from '../app.routes';
import { ShellComponent } from './shell.component';

describe('ShellComponent', () => {
  let fixture: ComponentFixture<ShellComponent>;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [ShellComponent],
      providers: [provideRouter(routes)],
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
  });
});
