import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { CoachDiagram, DiagramGroup, DiagramItem } from './coach-api';

let nextId = 0;

/** Greedy word wrap to `width` characters, at most `maxLines`, ending in an ellipsis if cut. */
export function wrapText(text: string, width: number, maxLines: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const raw of text.trim().split(/\s+/).filter(Boolean)) {
    // A single word longer than the line is cut rather than allowed to overflow.
    const word = raw.length > width ? `${raw.slice(0, width - 1)}…` : raw;
    if (!line) line = word;
    else if (line.length + 1 + word.length <= width) line += ` ${word}`;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  if (lines.length <= maxLines) return lines;
  const kept = lines.slice(0, maxLines);
  const last = kept[maxLines - 1];
  kept[maxLines - 1] = `${last.length >= width ? last.slice(0, width - 1) : last}…`;
  return kept;
}

interface TextLine {
  x: number;
  y: number;
  text: string;
  kind: 'label' | 'detail' | 'heading' | 'axis';
  anchor: 'start' | 'middle' | 'end';
}
interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
  /** A second outline style so boxes differ by more than colour. */
  emphasis: boolean;
  delay: number;
  lines: TextLine[];
  badge?: string;
}
interface Arrow {
  d: string;
  delay: number;
}
interface Layout {
  width: number;
  height: number;
  boxes: Box[];
  arrows: Arrow[];
  free: TextLine[];
}

const W = 640;
const PAD = 16;
const LABEL_LH = 18;
const DETAIL_LH = 16;
const STEP = 120; // ms between entrance animations

function itemLines(item: DiagramItem, x: number, y: number, chars: number): TextLine[] {
  const out: TextLine[] = [];
  let cursor = y;
  for (const text of wrapText(item.label, chars, 2)) {
    out.push({ x, y: cursor, text, kind: 'label', anchor: 'start' });
    cursor += LABEL_LH;
  }
  for (const text of wrapText(item.detail ?? '', chars + 4, 3)) {
    out.push({ x, y: cursor, text, kind: 'detail', anchor: 'start' });
    cursor += DETAIL_LH;
  }
  return out;
}

function groupLines(group: DiagramGroup, x: number, y: number, chars: number): TextLine[] {
  const out: TextLine[] = [];
  let cursor = y;
  for (const text of wrapText(group.label, chars, 2)) {
    out.push({ x, y: cursor, text, kind: 'heading', anchor: 'start' });
    cursor += LABEL_LH;
  }
  cursor += 6;
  for (const point of group.points.slice(0, 4)) {
    wrapText(point, chars - 2, 3).forEach((text, i) => {
      out.push({
        x: x + (i === 0 ? 0 : 12),
        y: cursor,
        text: i === 0 ? `• ${text}` : text,
        kind: 'detail',
        anchor: 'start',
      });
      cursor += DETAIL_LH;
    });
    cursor += 4;
  }
  return out;
}

const bottom = (lines: TextLine[], fallback: number) =>
  lines.length ? Math.max(...lines.map((l) => l.y)) : fallback;

function flow(steps: DiagramItem[]): Layout {
  const boxes: Box[] = [];
  const arrows: Arrow[] = [];
  let y = PAD;
  steps.slice(0, 6).forEach((step, i) => {
    const lines = itemLines(step, PAD + 52, y + 26, 58);
    const h = Math.max(52, bottom(lines, y + 26) - y + 16);
    boxes.push({
      x: PAD,
      y,
      w: W - PAD * 2,
      h,
      emphasis: false,
      delay: i * STEP,
      lines,
      badge: String(i + 1),
    });
    y += h;
    if (i < Math.min(steps.length, 6) - 1) {
      const cx = W / 2;
      arrows.push({
        d: `M ${cx} ${y + 2} V ${y + 18} M ${cx - 6} ${y + 12} L ${cx} ${y + 20} L ${cx + 6} ${y + 12}`,
        delay: i * STEP + STEP / 2,
      });
      y += 24;
    }
  });
  return { width: W, height: y + PAD, boxes, arrows, free: [] };
}

function columns(groups: DiagramGroup[], arrowBetween: boolean): Layout {
  const count = Math.min(groups.length, 3);
  const gap = arrowBetween ? 40 : 14;
  const w = (W - PAD * 2 - gap * (count - 1)) / count;
  const chars = Math.floor((w - 28) / 6.6);
  const drafts = groups.slice(0, 3).map((group, i) => {
    const x = PAD + i * (w + gap);
    return { x, lines: groupLines(group, x + 14, PAD + 28, chars) };
  });
  const h = Math.max(90, ...drafts.map((d) => bottom(d.lines, PAD + 28) - PAD + 18));
  const boxes: Box[] = drafts.map((d, i) => ({
    x: d.x,
    y: PAD,
    w,
    h,
    emphasis: arrowBetween && i === count - 1,
    delay: i * STEP * 1.5,
    lines: d.lines,
  }));
  const arrows: Arrow[] = [];
  if (arrowBetween && count === 2) {
    const x0 = PAD + w + 6;
    const x1 = x0 + gap - 12;
    const cy = PAD + h / 2;
    arrows.push({
      d: `M ${x0} ${cy} H ${x1} M ${x1 - 8} ${cy - 6} L ${x1} ${cy} L ${x1 - 8} ${cy + 6}`,
      delay: STEP,
    });
  }
  return { width: W, height: h + PAD * 2, boxes, arrows, free: [] };
}

function grid(diagram: Extract<CoachDiagram, { type: 'two_by_two' }>): Layout {
  const left = 78;
  const top = 34;
  const gap = 10;
  const w = (W - left - PAD - gap) / 2;
  const chars = Math.floor((w - 28) / 6.6);
  const drafts = diagram.quadrants.slice(0, 4).map((q, i) => {
    const col = i % 2;
    return { col, row: Math.floor(i / 2), q, x: left + col * (w + gap) };
  });
  const measure = (q: DiagramItem) => bottom(itemLines(q, 0, 26, chars), 26) + 16;
  const rowH = [0, 1].map((row) =>
    Math.max(84, ...drafts.filter((d) => d.row === row).map((d) => measure(d.q))),
  );
  const boxes: Box[] = drafts.map((d, i) => {
    const y = top + (d.row === 0 ? 0 : rowH[0] + gap);
    return {
      x: d.x,
      y,
      w,
      h: rowH[d.row],
      // The high/high corner (top-right) is outlined differently, not just tinted.
      emphasis: i === 1,
      delay: i * STEP,
      lines: itemLines(d.q, d.x + 14, y + 26, chars),
    };
  });
  const gridBottom = top + rowH[0] + gap + rowH[1];
  const midX = left + w + gap / 2;
  const free: TextLine[] = [
    {
      x: left,
      y: gridBottom + 20,
      text: `← ${wrapText(diagram.xAxis.low, 22, 1)[0] ?? ''}`,
      kind: 'axis',
      anchor: 'start',
    },
    {
      x: W - PAD,
      y: gridBottom + 20,
      text: `${wrapText(diagram.xAxis.high, 22, 1)[0] ?? ''} →`,
      kind: 'axis',
      anchor: 'end',
    },
    {
      x: midX,
      y: gridBottom + 40,
      text: wrapText(diagram.xAxis.label, 40, 1)[0] ?? '',
      kind: 'heading',
      anchor: 'middle',
    },
    {
      x: PAD,
      y: 18,
      text: wrapText(diagram.yAxis.label, 60, 1)[0] ?? '',
      kind: 'heading',
      anchor: 'start',
    },
    ...wrapText(`↑ ${diagram.yAxis.high}`, 9, 3).map(
      (text, i): TextLine => ({
        x: PAD,
        y: top + 18 + i * DETAIL_LH,
        text,
        kind: 'axis',
        anchor: 'start',
      }),
    ),
    ...wrapText(`↓ ${diagram.yAxis.low}`, 9, 3).map(
      (text, i): TextLine => ({
        x: PAD,
        y: top + rowH[0] + gap + 18 + i * DETAIL_LH,
        text,
        kind: 'axis',
        anchor: 'start',
      }),
    ),
  ];
  return { width: W, height: gridBottom + 52, boxes, arrows: [], free };
}

export function layoutDiagram(diagram: CoachDiagram): Layout {
  switch (diagram.type) {
    case 'linear_flow':
      return flow(diagram.steps);
    case 'before_after':
      return columns([diagram.before, diagram.after], true);
    case 'comparison':
      return columns(diagram.columns, false);
    case 'two_by_two':
      return grid(diagram);
  }
}

/**
 * A coach answer's diagram (linear flow, before/after, comparison or 2×2) as inline
 * SVG. The server's `alt` text is the accessible description and is also readable in
 * the "Text version" disclosure. Meaning never rests on colour: steps are numbered,
 * arrows show direction and the emphasised box has a heavier, dashed outline.
 */
@Component({
  selector: 'assurance-coach-diagram',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let d = diagram();
    @let l = layout();
    <figure class="cdg" [attr.data-type]="d.type">
      <figcaption class="cdg__title" [id]="id + '-t'">{{ d.title }}</figcaption>
      <svg
        class="cdg__svg"
        role="img"
        [attr.viewBox]="'0 0 ' + l.width + ' ' + l.height"
        [attr.aria-labelledby]="id + '-t'"
        [attr.aria-describedby]="id + '-d'"
        preserveAspectRatio="xMidYMin meet"
      >
        <desc [id]="id + '-d'">{{ d.alt }}</desc>
        @for (box of l.boxes; track $index) {
          <g class="cdg__in" [style.animation-delay.ms]="box.delay" aria-hidden="true">
            <rect
              class="cdg__box"
              [class.cdg__box--strong]="box.emphasis"
              [attr.x]="box.x"
              [attr.y]="box.y"
              [attr.width]="box.w"
              [attr.height]="box.h"
              rx="12"
            />
            @if (box.badge) {
              <circle class="cdg__badge" [attr.cx]="box.x + 26" [attr.cy]="box.y + 26" r="13" />
              <text class="cdg__badge-text" [attr.x]="box.x + 26" [attr.y]="box.y + 31">
                {{ box.badge }}
              </text>
            }
            @for (line of box.lines; track $index) {
              <text [attr.class]="'cdg__' + line.kind" [attr.x]="line.x" [attr.y]="line.y">
                {{ line.text }}
              </text>
            }
          </g>
        }
        @for (arrow of l.arrows; track $index) {
          <path
            class="cdg__arrow cdg__in"
            [style.animation-delay.ms]="arrow.delay"
            [attr.d]="arrow.d"
            aria-hidden="true"
          />
        }
        @for (line of l.free; track $index) {
          <text
            [attr.class]="'cdg__' + line.kind"
            [attr.x]="line.x"
            [attr.y]="line.y"
            [attr.text-anchor]="line.anchor"
            aria-hidden="true"
          >
            {{ line.text }}
          </text>
        }
      </svg>
      <details class="cdg__alt">
        <summary>Text version</summary>
        <p>{{ d.alt }}</p>
      </details>
    </figure>
  `,
  styles: [
    `
      :host {
        display: block;
      }
      .cdg {
        margin: 0.75rem 0 0;
        padding: 12px;
        background: var(--sf-surface, #fff);
        border: 1px solid var(--sf-line, #e6e1d8);
        border-radius: var(--sf-radius-md, 12px);
        color: var(--sf-ink, #1b1e23);
      }
      .cdg__title {
        font-weight: var(--sf-weight-bold, 700);
        margin-bottom: 8px;
      }
      .cdg__svg {
        display: block;
        width: 100%;
        height: auto;
        font-family: var(--sf-font, system-ui, sans-serif);
      }
      .cdg__box {
        fill: var(--sf-cream, #f6f3ec);
        stroke: var(--sf-line, #e6e1d8);
        stroke-width: 1.5;
      }
      .cdg__box--strong {
        fill: var(--sf-ember-soft, #fff1eb);
        stroke: var(--sf-ember, #dc481b);
        stroke-width: 2.5;
        stroke-dasharray: 6 3;
      }
      .cdg__badge {
        fill: var(--sf-charcoal, #1b1e23);
      }
      .cdg__badge-text {
        fill: #fff;
        font-size: 13px;
        font-weight: 700;
        text-anchor: middle;
      }
      .cdg__label,
      .cdg__heading {
        fill: var(--sf-ink, #1b1e23);
        font-size: 14px;
        font-weight: 700;
      }
      .cdg__detail {
        fill: var(--sf-ink-2, #4b5563);
        font-size: 12.5px;
      }
      .cdg__axis {
        fill: var(--sf-ink-2, #4b5563);
        font-size: 12px;
        font-weight: 600;
      }
      .cdg__arrow {
        fill: none;
        stroke: var(--sf-charcoal, #1b1e23);
        stroke-width: 2;
        stroke-linecap: round;
        stroke-linejoin: round;
      }
      .cdg__in {
        animation: cdg-in 320ms ease-out both;
      }
      @keyframes cdg-in {
        from {
          opacity: 0;
          transform: translateY(6px);
        }
        to {
          opacity: 1;
          transform: none;
        }
      }
      @media (prefers-reduced-motion: reduce) {
        .cdg__in {
          animation: none;
        }
      }
      .cdg__alt {
        margin-top: 8px;
        font-size: 0.875rem;
      }
      .cdg__alt summary {
        cursor: pointer;
        padding: 12px 0;
        color: var(--sf-ember-on-soft, #b33a12);
        font-weight: 600;
      }
      .cdg__alt p {
        margin: 0 0 4px;
        white-space: pre-line;
      }
    `,
  ],
})
export class CoachDiagramComponent {
  readonly diagram = input.required<CoachDiagram>();
  protected readonly id = `cdg-${nextId++}`;
  protected readonly layout = computed(() => layoutDiagram(this.diagram()));
}
