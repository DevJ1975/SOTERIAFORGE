import { mergeApplicationConfig, ApplicationConfig } from '@angular/core';
import { provideServerRendering, withRoutes } from '@angular/ssr';
import { sharedAppConfig } from './app.config';
import { serverRoutes } from './app.routes.server';

const serverConfig: ApplicationConfig = {
  providers: [provideServerRendering(withRoutes(serverRoutes))],
};

/**
 * Server bootstrap: the shared providers only — no Firebase. The server
 * renders the SEO shell (home hero, catalog headings + skeletons); all data
 * loading and auth happens in the browser. See app.config.ts for the
 * rationale and catalog.page.ts for the Phase 8 full data-SSR note.
 */
export const config = mergeApplicationConfig(sharedAppConfig, serverConfig);
