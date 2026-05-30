import { type EnvironmentProviders, Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { type Translation, type TranslocoLoader, provideTransloco } from '@jsverse/transloco';
import type { Observable } from 'rxjs';

/** Languages FORGE ships translations for. Add a locale + an asset file to grow. */
export const FORGE_LANGS = ['en', 'es'] as const;
export type ForgeLang = (typeof FORGE_LANGS)[number];

/** Loads `/assets/i18n/{lang}.json` at runtime. */
@Injectable({ providedIn: 'root' })
export class ForgeTranslocoLoader implements TranslocoLoader {
  private readonly http = inject(HttpClient);
  getTranslation(lang: string): Observable<Translation> {
    return this.http.get<Translation>(`/assets/i18n/${lang}.json`);
  }
}

/**
 * Wire Transloco for an app. Strings are translated via the `transloco` pipe/
 * directive; adoption is incremental (untranslated keys fall back to the key).
 * Apps must also provide `provideHttpClient()` for the loader.
 */
export function provideForgeTransloco(): EnvironmentProviders {
  return provideTransloco({
    config: {
      availableLangs: [...FORGE_LANGS],
      defaultLang: 'en',
      fallbackLang: 'en',
      reRenderOnLangChange: true,
      missingHandler: { useFallbackTranslation: true },
    },
    loader: ForgeTranslocoLoader,
  });
}
