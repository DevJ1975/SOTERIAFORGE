import { DOCUMENT } from '@angular/common';
import { Injectable, inject } from '@angular/core';
import { Title, Meta } from '@angular/platform-browser';
import { ASSURANCE_ENV } from '@assurance/auth';

/** Options accepted by {@link SeoService.setSeo}. */
export interface SeoOptions {
  /** Page `<title>` (also used for `og:title` / `twitter:title`). */
  title: string;
  /** Meta description (also used for `og:description` / `twitter:description`). */
  description: string;
  /**
   * Path of the current page (e.g. `/catalog`). Combined with the configured
   * root domain to produce an absolute canonical / `og:url`. Defaults to `/`.
   */
  path?: string;
  /** Open Graph object type. Defaults to `website`. */
  type?: string;
  /** Absolute or root-relative image URL for OG/Twitter cards. */
  image?: string;
}

/**
 * Centralises head-tag management for the public storefront so every page sets
 * a consistent set of SEO + social tags with one call.
 *
 * SSR-safe: `Title`/`Meta` write into the document on both the server (during
 * prerender) and the browser, with **no** reliance on `window`/`document`/
 * `location`. The absolute canonical/`og:url` is derived from the configured
 * `rootDomain` rather than `location.href`, so it is stable during SSR.
 */
@Injectable({ providedIn: 'root' })
export class SeoService {
  private readonly title = inject(Title);
  private readonly meta = inject(Meta);
  private readonly env = inject(ASSURANCE_ENV);
  private readonly doc = inject(DOCUMENT);

  /** `https://<rootDomain>` with no trailing slash (falls back to the prod host). */
  private get origin(): string {
    const domain = (this.env.rootDomain ?? '').trim() || 'soteriaforge.com';
    // rootDomain is a bare host (no scheme); always serve canonical over https.
    return `https://${domain.replace(/^https?:\/\//, '').replace(/\/+$/, '')}`;
  }

  /** Build an absolute URL from a root-relative path. */
  private absolute(pathOrUrl: string): string {
    if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
    const path = pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`;
    return `${this.origin}${path}`;
  }

  /**
   * Set title, description, Open Graph, Twitter card and the canonical link in
   * one call. Idempotent — repeated calls update the same tags.
   */
  setSeo(options: SeoOptions): void {
    const { title, description } = options;
    const type = options.type ?? 'website';
    const url = this.absolute(options.path ?? '/');
    const image = options.image
      ? this.absolute(options.image)
      : this.absolute('/assets/og-default.png');

    this.title.setTitle(title);
    this.meta.updateTag({ name: 'description', content: description });

    // Open Graph
    this.meta.updateTag({ property: 'og:title', content: title });
    this.meta.updateTag({ property: 'og:description', content: description });
    this.meta.updateTag({ property: 'og:type', content: type });
    this.meta.updateTag({ property: 'og:url', content: url });
    this.meta.updateTag({ property: 'og:image', content: image });
    this.meta.updateTag({ property: 'og:site_name', content: 'Soteria Assurance' });

    // Twitter card
    this.meta.updateTag({ name: 'twitter:card', content: 'summary_large_image' });
    this.meta.updateTag({ name: 'twitter:title', content: title });
    this.meta.updateTag({ name: 'twitter:description', content: description });
    this.meta.updateTag({ name: 'twitter:image', content: image });

    this.setCanonical(url);
  }

  /**
   * Maintain a single `<link rel="canonical">` in the document head. Angular's
   * `Meta`/`Title` do not manage `<link>`, so we manage it directly on the
   * injected `DOCUMENT` — which is the Domino document during SSR (so the tag is
   * server-rendered for crawlers) and the real document in the browser.
   */
  private setCanonical(href: string): void {
    const head = this.doc.head;
    if (!head) return;
    let link = head.querySelector("link[rel='canonical']") as HTMLLinkElement | null;
    if (!link) {
      link = this.doc.createElement('link');
      link.setAttribute('rel', 'canonical');
      head.appendChild(link);
    }
    link.setAttribute('href', href);
  }
}
