import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  output,
} from '@angular/core';
import type { BlockKind } from '@forge/shared';
import { BLOCK_DEFS, BLOCK_GROUPS, BlockDef, BlockGroup } from './block-defs';

/**
 * Insert palette popover: every block type grouped Text / Media /
 * Interactive / Layout, each with an icon and a one-line description.
 * Emits the picked kind; dismisses on outside click or Escape.
 */
@Component({
  selector: 'app-block-palette',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:click)': 'onDocumentClick($event)',
    '(document:keydown.escape)': 'dismissed.emit()',
  },
  template: `
    <div class="palette" role="menu" aria-label="Insert a block">
      @for (group of groups(); track group.name) {
        <div class="palette-group">
          <span class="group-name">{{ group.name }}</span>
          <div class="group-items">
            @for (def of group.defs; track def.kind) {
              <button type="button" class="palette-item" role="menuitem" (click)="pick(def.kind)">
                <span class="item-icon"><i [class]="def.icon"></i></span>
                <span class="item-text">
                  <span class="item-label">{{ def.label }}</span>
                  <span class="item-desc">{{ def.description }}</span>
                </span>
              </button>
            }
          </div>
        </div>
      }
    </div>
  `,
  styles: `
    :host {
      position: absolute;
      top: calc(100% + 6px);
      left: 50%;
      transform: translateX(-50%);
      z-index: 60;
    }

    .palette {
      width: 560px;
      max-width: min(560px, 78vw);
      max-height: 420px;
      overflow-y: auto;
      background: var(--forge-surface);
      border: 1px solid var(--forge-border);
      border-radius: var(--forge-radius);
      box-shadow: var(--forge-shadow-elevated);
      padding: 14px;
      display: flex;
      flex-direction: column;
      gap: 14px;
      animation: palette-in 130ms ease-out;
    }

    @keyframes palette-in {
      from {
        opacity: 0;
        transform: translateY(-4px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    .group-name {
      display: block;
      margin-bottom: 6px;
      font-family: var(--forge-font-display);
      font-size: 12px;
      font-weight: 600;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      color: var(--forge-text-subtle);
    }

    .group-items {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 4px;
    }

    .palette-item {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 8px 10px;
      border: 0;
      border-radius: var(--forge-radius-small);
      background: transparent;
      font: inherit;
      text-align: left;
      cursor: pointer;
      transition: background 130ms ease-out;
    }

    .palette-item:hover {
      background: color-mix(in srgb, var(--forge-accent) 9%, var(--forge-surface));
    }

    .item-icon {
      display: grid;
      place-items: center;
      flex: 0 0 auto;
      width: 34px;
      height: 34px;
      border-radius: var(--forge-radius-small);
      background: var(--forge-surface-dim);
      color: var(--forge-accent);
    }

    .palette-item:hover .item-icon {
      background: var(--forge-accent);
      color: #fff;
    }

    .item-text {
      display: flex;
      flex-direction: column;
      min-width: 0;
    }

    .item-label {
      font-weight: 600;
      font-size: 14px;
      color: var(--forge-text);
    }

    .item-desc {
      font-size: 12.5px;
      color: var(--forge-text-subtle);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
  `,
})
export class BlockPalette {
  readonly picked = output<BlockKind>();
  readonly dismissed = output<void>();

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly groups = computed<{ name: BlockGroup; defs: BlockDef[] }[]>(() =>
    BLOCK_GROUPS.map((name) => ({
      name,
      defs: BLOCK_DEFS.filter((def) => def.group === name),
    })),
  );

  protected pick(kind: BlockKind): void {
    this.picked.emit(kind);
  }

  protected onDocumentClick(event: Event): void {
    if (!this.host.nativeElement.contains(event.target as Node)) {
      this.dismissed.emit();
    }
  }
}
