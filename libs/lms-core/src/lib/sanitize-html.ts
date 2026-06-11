/**
 * Allowlist sanitizer for Forge Studio rich-text fields.
 *
 * Only inline formatting survives: b, strong, i, em, u, br, and a (with a
 * safe href, forced rel="noopener noreferrer" and target="_blank"). Every
 * other element is unwrapped (its text kept), script/style/iframe-like
 * content is removed entirely, and all attributes — including any on*
 * handler — are dropped.
 *
 * When a DOM is available the input is parsed in a detached <template> (its
 * content is inert: scripts never execute, images never load). Without a DOM
 * we fall back to a conservative strip that removes all markup.
 */

const ALLOWED_TAGS = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'A', 'BR']);

/** Tags whose entire subtree (including text) must be discarded. */
const DISALLOWED_CONTENT_TAGS = new Set([
  'SCRIPT',
  'STYLE',
  'IFRAME',
  'OBJECT',
  'EMBED',
  'NOSCRIPT',
  'TEMPLATE',
  'TITLE',
  'SVG',
  'MATH',
]);

function isSafeHref(href: string): boolean {
  // Collapse whitespace/control characters used to obfuscate "java\nscript:".
  const value = href
    .trim()
    .toLowerCase()
    // eslint-disable-next-line no-control-regex
    .replace(/[\s\u0000-\u001f]/g, '');
  return (
    !value.startsWith('javascript:') && !value.startsWith('data:') && !value.startsWith('vbscript:')
  );
}

/** Replace an element with its (already sanitized) children. */
function unwrap(element: Element): void {
  const parent = element.parentNode;
  if (!parent) return;
  while (element.firstChild) {
    parent.insertBefore(element.firstChild, element);
  }
  element.remove();
}

function sanitizeElement(element: Element): void {
  const tag = element.tagName.toUpperCase();

  if (DISALLOWED_CONTENT_TAGS.has(tag)) {
    element.remove();
    return;
  }

  if (!ALLOWED_TAGS.has(tag)) {
    unwrap(element);
    return;
  }

  // Allowed tag: scrub every attribute, then restore the safe subset.
  const href = tag === 'A' ? element.getAttribute('href') : null;
  for (const attr of Array.from(element.attributes)) {
    element.removeAttribute(attr.name);
  }
  if (tag === 'A') {
    if (href && isSafeHref(href)) {
      element.setAttribute('href', href);
      element.setAttribute('rel', 'noopener noreferrer');
      element.setAttribute('target', '_blank');
    } else {
      // A link without a safe destination becomes plain text.
      unwrap(element);
    }
  }
}

function walk(root: ParentNode): void {
  // Snapshot the children first: sanitizeElement mutates the tree.
  for (const child of Array.from(root.childNodes)) {
    if (child.nodeType === 1 /* ELEMENT_NODE */) {
      const element = child as Element;
      walk(element);
      sanitizeElement(element);
    } else if (child.nodeType !== 3 /* TEXT_NODE */) {
      // Comments, processing instructions, CDATA: drop.
      child.parentNode?.removeChild(child);
    }
  }
}

/**
 * Conservative fallback when no DOM is available: remove script/style-like
 * blocks together with their content, then strip every remaining tag,
 * leaving plain text only.
 */
export function sanitizeHtmlFallback(html: string): string {
  return html
    .replace(
      /<(script|style|iframe|object|embed|noscript|template|svg|math)\b[\s\S]*?<\/\1\s*>/gi,
      '',
    )
    .replace(/<(script|style|iframe|object|embed|noscript|template|svg|math)\b[\s\S]*$/gi, '')
    .replace(/<[^>]*>?/g, '');
}

/** Sanitize a rich-text HTML string down to the Forge Studio inline subset. */
export function sanitizeHtml(html: string): string {
  if (!html) return '';
  if (typeof document === 'undefined' || typeof document.createElement !== 'function') {
    return sanitizeHtmlFallback(html);
  }
  const template = document.createElement('template');
  template.innerHTML = html;
  walk(template.content);
  return template.innerHTML;
}
