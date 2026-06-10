import type { Block, BlockKind } from '@forge/shared';
import { createId } from '@forge/lms-core';

/** Palette grouping for the insert popover. */
export type BlockGroup = 'Text' | 'Media' | 'Interactive' | 'Layout';

export interface BlockDef {
  kind: BlockKind;
  label: string;
  description: string;
  /** primeicons class, e.g. 'pi pi-image'. */
  icon: string;
  group: BlockGroup;
}

export const BLOCK_DEFS: readonly BlockDef[] = [
  // Text
  {
    kind: 'heading',
    label: 'Heading',
    description: 'Section title in display type (3 sizes)',
    icon: 'pi pi-pen-to-square',
    group: 'Text',
  },
  {
    kind: 'paragraph',
    label: 'Paragraph',
    description: 'Rich text with bold, italic, links',
    icon: 'pi pi-align-left',
    group: 'Text',
  },
  {
    kind: 'bulletList',
    label: 'Bullet list',
    description: 'Unordered list of short points',
    icon: 'pi pi-list',
    group: 'Text',
  },
  {
    kind: 'numberedList',
    label: 'Numbered list',
    description: 'Ordered steps or procedures',
    icon: 'pi pi-sort-numeric-down',
    group: 'Text',
  },
  {
    kind: 'quote',
    label: 'Quote',
    description: 'Pull quote with optional attribution',
    icon: 'pi pi-comment',
    group: 'Text',
  },
  // Media
  {
    kind: 'image',
    label: 'Image',
    description: 'Photo or diagram with caption and layout',
    icon: 'pi pi-image',
    group: 'Media',
  },
  {
    kind: 'video',
    label: 'Video',
    description: 'Direct file, YouTube, or Vimeo',
    icon: 'pi pi-video',
    group: 'Media',
  },
  {
    kind: 'embed',
    label: 'Embed',
    description: 'External page in a sandboxed frame',
    icon: 'pi pi-globe',
    group: 'Media',
  },
  // Interactive
  {
    kind: 'accordion',
    label: 'Accordion',
    description: 'Expandable sections, one per topic',
    icon: 'pi pi-bars',
    group: 'Interactive',
  },
  {
    kind: 'tabs',
    label: 'Tabs',
    description: 'Side-by-side panels learners switch between',
    icon: 'pi pi-folder',
    group: 'Interactive',
  },
  {
    kind: 'flashcards',
    label: 'Flashcards',
    description: 'Flip cards for terms and definitions',
    icon: 'pi pi-clone',
    group: 'Interactive',
  },
  {
    kind: 'knowledgeCheck',
    label: 'Knowledge check',
    description: 'Question with instant feedback',
    icon: 'pi pi-check-circle',
    group: 'Interactive',
  },
  // Layout
  {
    kind: 'callout',
    label: 'Callout',
    description: 'Toned note: info, success, warning, danger',
    icon: 'pi pi-exclamation-circle',
    group: 'Layout',
  },
  {
    kind: 'divider',
    label: 'Divider',
    description: 'A line or breathing space between ideas',
    icon: 'pi pi-minus',
    group: 'Layout',
  },
  {
    kind: 'button',
    label: 'Button',
    description: 'Call-to-action linking out',
    icon: 'pi pi-external-link',
    group: 'Layout',
  },
];

export const BLOCK_GROUPS: readonly BlockGroup[] = ['Text', 'Media', 'Interactive', 'Layout'];

export function blockDef(kind: BlockKind): BlockDef {
  const def = BLOCK_DEFS.find((d) => d.kind === kind);
  if (!def) throw new Error(`Unknown block kind: ${kind}`);
  return def;
}

/** Create a fresh block of the given kind with friendly starter content. */
export function createBlock(kind: BlockKind): Block {
  const id = createId('block');
  switch (kind) {
    case 'heading':
      return { id, kind, text: 'New section', level: 2 };
    case 'paragraph':
      return { id, kind, html: '' };
    case 'image':
      return { id, kind, url: '', alt: '', layout: 'full' };
    case 'video':
      return { id, kind, url: '' };
    case 'bulletList':
      return { id, kind, items: ['First point'] };
    case 'numberedList':
      return { id, kind, items: ['Step one'] };
    case 'quote':
      return { id, kind, text: 'Add a memorable line here.' };
    case 'callout':
      return { id, kind, tone: 'info', title: 'Good to know', html: '' };
    case 'divider':
      return { id, kind, style: 'line' };
    case 'button':
      return { id, kind, label: 'Learn more', url: '', style: 'primary' };
    case 'embed':
      return { id, kind, url: '', height: 480 };
    case 'accordion':
      return { id, kind, items: [{ id: createId('item'), title: 'Section title', html: '' }] };
    case 'tabs':
      return {
        id,
        kind,
        items: [
          { id: createId('item'), title: 'First tab', html: '' },
          { id: createId('item'), title: 'Second tab', html: '' },
        ],
      };
    case 'flashcards':
      return { id, kind, cards: [{ id: createId('card'), front: 'Term', back: 'Definition' }] };
    case 'knowledgeCheck':
      return {
        id,
        kind,
        question: 'Ask a question about this lesson…',
        type: 'mcq',
        options: [
          { id: createId('opt'), text: 'Correct answer', correct: true },
          { id: createId('opt'), text: 'Distractor', correct: false },
        ],
        feedbackCorrect: 'Correct!',
        feedbackIncorrect: 'Not quite — review the lesson and try again.',
      };
  }
}
