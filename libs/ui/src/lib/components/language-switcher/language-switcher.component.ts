import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';

/**
 * Language selector bound to the active Transloco language. Drop
 * `<assurance-language-switcher />` into any app shell; the active language persists
 * via Transloco for the session.
 */
@Component({
  selector: 'assurance-language-switcher',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <label class="lang">
      <span class="lang__label">Language</span>
      <select
        [value]="active()"
        (change)="setLang($any($event.target).value)"
        aria-label="Select language"
      >
        @for (lang of langs; track lang) {
          <option [value]="lang">{{ lang.toUpperCase() }}</option>
        }
      </select>
    </label>
  `,
  styles: [
    `
      .lang {
        display: inline-flex;
        align-items: center;
        gap: 0.5rem;
      }
      .lang__label {
        font-size: 0.8125rem;
      }
    `,
  ],
})
export class LanguageSwitcherComponent {
  private readonly transloco = inject(TranslocoService);
  protected readonly langs = this.transloco.getAvailableLangs() as string[];
  protected readonly active = signal(this.transloco.getActiveLang());

  protected setLang(lang: string): void {
    this.transloco.setActiveLang(lang);
    this.active.set(lang);
  }
}
