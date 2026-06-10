import {
  ChangeDetectionStrategy,
  Component,
  effect,
  ElementRef,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { sanitizeHtml } from '@forge/lms-core';

/**
 * Inline rich-text editor for paragraph/callout/accordion/tab bodies.
 * contenteditable with a Bold/Italic/Underline/Link mini-toolbar (visible
 * while focused). Content is run through the allowlist sanitizer on blur
 * before being committed, so only the supported inline subset survives.
 *
 * Note: document.execCommand is deprecated but remains the only dependency-
 * free way to apply inline formatting to a live selection; all major
 * browsers still support it and the sanitizer guards the output regardless.
 */
@Component({
  selector: 'app-rich-text',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="rt" [class.focused]="focused()">
      <div class="rt-toolbar" [class.visible]="focused()" role="toolbar" aria-label="Formatting">
        <button type="button" class="rt-tool bold" (mousedown)="exec($event, 'bold')" title="Bold">
          B
        </button>
        <button
          type="button"
          class="rt-tool italic"
          (mousedown)="exec($event, 'italic')"
          title="Italic"
        >
          I
        </button>
        <button
          type="button"
          class="rt-tool underline"
          (mousedown)="exec($event, 'underline')"
          title="Underline"
        >
          U
        </button>
        <span class="rt-sep"></span>
        <button type="button" class="rt-tool" (mousedown)="addLink($event)" title="Insert link">
          <i class="pi pi-link"></i>
        </button>
      </div>
      <div
        #area
        class="rt-area"
        contenteditable="true"
        [attr.data-placeholder]="placeholder()"
        (focus)="focused.set(true)"
        (blur)="onBlur()"
      ></div>
    </div>
  `,
  styles: `
    .rt {
      position: relative;
    }

    .rt-toolbar {
      position: absolute;
      top: -38px;
      left: 0;
      z-index: 20;
      display: flex;
      align-items: center;
      gap: 2px;
      padding: 3px;
      background: var(--sf-charcoal, #1b1e23);
      border-radius: var(--forge-radius-small);
      box-shadow: var(--forge-shadow-elevated);
      opacity: 0;
      pointer-events: none;
      transform: translateY(4px);
      transition:
        opacity 130ms ease-out,
        transform 130ms ease-out;
    }

    .rt-toolbar.visible {
      opacity: 1;
      pointer-events: auto;
      transform: translateY(0);
    }

    .rt-tool {
      display: grid;
      place-items: center;
      width: 28px;
      height: 26px;
      border: 0;
      border-radius: 3px;
      background: transparent;
      color: #e9e8ea;
      font-family: var(--forge-font);
      font-size: 13px;
      cursor: pointer;
      transition: background 130ms ease-out;
    }

    .rt-tool:hover {
      background: var(--forge-accent);
    }

    .rt-tool.bold {
      font-weight: 700;
    }

    .rt-tool.italic {
      font-style: italic;
    }

    .rt-tool.underline {
      text-decoration: underline;
    }

    .rt-tool .pi {
      font-size: 12px;
    }

    .rt-sep {
      width: 1px;
      height: 16px;
      margin: 0 3px;
      background: rgb(255 255 255 / 0.25);
    }

    .rt-area {
      min-height: 24px;
      outline: none;
      font-size: 15.5px;
      line-height: 1.6;
      border-radius: var(--forge-radius-small);
      transition: background 130ms ease-out;
    }

    .rt-area:focus {
      background: color-mix(in srgb, var(--forge-accent) 4%, transparent);
      box-shadow: none;
    }

    .rt-area:empty::before {
      content: attr(data-placeholder);
      color: var(--forge-text-subtle);
      pointer-events: none;
    }
  `,
})
export class RichTextEditor {
  readonly value = input('');
  readonly placeholder = input('Start writing…');
  readonly valueChange = output<string>();

  protected readonly focused = signal(false);
  private readonly area = viewChild<ElementRef<HTMLDivElement>>('area');

  constructor() {
    // Reflect external value changes into the DOM, but never while the
    // author is typing (that would clobber the caret).
    effect(() => {
      const element = this.area()?.nativeElement;
      const value = this.value();
      if (element && !this.focused() && element.innerHTML !== value) {
        element.innerHTML = value;
      }
    });
  }

  protected exec(event: MouseEvent, command: 'bold' | 'italic' | 'underline'): void {
    event.preventDefault(); // keep the selection + focus in the editable area
    document.execCommand(command, false);
  }

  protected addLink(event: MouseEvent): void {
    event.preventDefault();
    const url = window.prompt('Link URL (https://…)');
    if (url && /^https?:\/\//i.test(url.trim())) {
      document.execCommand('createLink', false, url.trim());
    }
  }

  protected onBlur(): void {
    this.focused.set(false);
    const element = this.area()?.nativeElement;
    if (!element) return;
    const sanitized = sanitizeHtml(element.innerHTML);
    if (element.innerHTML !== sanitized) {
      element.innerHTML = sanitized;
    }
    if (sanitized !== this.value()) {
      this.valueChange.emit(sanitized);
    }
  }
}
