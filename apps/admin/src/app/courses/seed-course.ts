import type { CourseDraft } from '@forge/shared';
import { createId } from '@forge/lms-core';

/**
 * Demo course seeded on first run so Forge Studio opens with something real
 * to explore. Genuine workplace-safety content (OSHA 29 CFR 1910.178 themes)
 * exercising every block type across three lessons.
 */
export function buildSeedCourse(): CourseDraft {
  const now = new Date().toISOString();
  return {
    id: createId('course'),
    title: 'Forklift Safety Fundamentals',
    description:
      'Daily inspections, load handling, and pedestrian awareness for powered industrial truck operators. Aligned with OSHA 29 CFR 1910.178.',
    status: 'draft',
    createdAt: now,
    updatedAt: now,
    lessons: [
      {
        id: createId('lesson'),
        title: 'Pre-Operation Inspection',
        blocks: [
          { id: createId('block'), kind: 'heading', text: 'Before you turn the key', level: 1 },
          {
            id: createId('block'),
            kind: 'paragraph',
            html: 'OSHA requires powered industrial trucks to be examined <strong>before being placed in service each day</strong>. Trucks used around the clock must be examined after each shift. A five-minute walkaround catches the leaking hose or cracked fork <em>before</em> it becomes an incident.',
          },
          {
            id: createId('block'),
            kind: 'callout',
            tone: 'info',
            title: 'Why it matters',
            html: 'Roughly <b>one in ten</b> forklifts in the U.S. is involved in an incident each year. Most trace back to skipped inspections, bad habits, or rushed loads.',
          },
          {
            id: createId('block'),
            kind: 'image',
            url: 'https://images.unsplash.com/photo-1565891741441-64926e441838?w=1400&q=80',
            alt: 'Operator performing a walkaround inspection of a counterbalance forklift in a warehouse',
            caption: 'The daily walkaround: same route, same checklist, every shift.',
            layout: 'full',
          },
          {
            id: createId('block'),
            kind: 'bulletList',
            items: [
              'Forks: no cracks, bends, or uneven heels; locking pins seated',
              'Mast chains and hoses: even tension, no kinks or leaks',
              'Tires: proper inflation or polyurethane wear within limits',
              'Horn, lights, and backup alarm all working',
              'Seat belt latches and retracts correctly',
              'Data plate present and legible — never exceed the rated capacity',
            ],
          },
          {
            id: createId('block'),
            kind: 'accordion',
            items: [
              {
                id: createId('item'),
                title: 'Engine-off checks (visual)',
                html: 'Walk the truck looking for fluid puddles, damaged guards, and debris in the operating area. Check fork wear with a caliper if heel wear looks past <b>10%</b> — that alone cuts capacity roughly in half.',
              },
              {
                id: createId('item'),
                title: 'Engine-on checks (operational)',
                html: 'With the area clear, test steering, service and parking brakes, tilt and lift through full range, and the deadman seat switch. Listen for new noises — they are the first symptom of a failing component.',
              },
              {
                id: createId('item'),
                title: 'Found a defect?',
                html: 'Tag the truck <b>Out of Service</b>, pull the key, and report it to your supervisor. Operating a defective truck is never an acceptable shortcut — repairs are made only by authorized technicians.',
              },
            ],
          },
          { id: createId('block'), kind: 'divider', style: 'line' },
          {
            id: createId('block'),
            kind: 'knowledgeCheck',
            question: 'How often must a forklift in single-shift service be inspected?',
            type: 'mcq',
            options: [
              {
                id: createId('opt'),
                text: 'Before being placed in service each day',
                correct: true,
              },
              { id: createId('opt'), text: 'Once a week, on Mondays', correct: false },
              { id: createId('opt'), text: 'Only after a repair', correct: false },
              { id: createId('opt'), text: 'Whenever the operator has spare time', correct: false },
            ],
            feedbackCorrect:
              'Correct — 29 CFR 1910.178(q)(7) requires a daily pre-service examination, and after each shift for round-the-clock trucks.',
            feedbackIncorrect:
              'Not quite. OSHA requires an examination before the truck is placed in service each day — more often for multi-shift operations.',
          },
        ],
      },
      {
        id: createId('lesson'),
        title: 'Load Handling & the Stability Triangle',
        blocks: [
          { id: createId('block'), kind: 'heading', text: 'The stability triangle', level: 2 },
          {
            id: createId('block'),
            kind: 'paragraph',
            html: 'A counterbalance forklift balances on <strong>three points</strong>: the two front wheels and the pivot of the rear axle. The combined center of gravity of truck and load must stay inside that triangle — drift outside it and the truck tips, <em>faster than you can react</em>.',
          },
          {
            id: createId('block'),
            kind: 'image',
            url: 'https://images.unsplash.com/photo-1553413077-190dd305871c?w=1100&q=80',
            alt: 'Forklift lifting a palletized load in a racking aisle',
            caption: 'Load low, mast tilted back, travel speed matched to the corner.',
            layout: 'side',
          },
          {
            id: createId('block'),
            kind: 'numberedList',
            items: [
              'Square up to the pallet and level the forks before entry',
              'Insert forks fully under the load — at least two-thirds of load length',
              'Tilt the mast back slightly to cradle the load',
              'Lift just enough to clear, then travel with forks 4–6 inches off the floor',
              'Slow before turning — speed plus a raised load is how tip-overs happen',
            ],
          },
          {
            id: createId('block'),
            kind: 'tabs',
            items: [
              {
                id: createId('item'),
                title: 'Stable load',
                html: 'Load centered on both forks, weight within the data-plate capacity at its load center, mast tilted back, load carried low. The combined center of gravity sits deep inside the triangle.',
              },
              {
                id: createId('item'),
                title: 'Risky load',
                html: 'Off-center weight, shrink-wrap bulging, or a load center beyond <b>24 inches</b>. The truck may still lift it — but the margin inside the triangle is nearly gone. Re-stack or split the load.',
              },
              {
                id: createId('item'),
                title: 'On a grade',
                html: 'Drive with the load <b>upgrade</b> on ramps steeper than 10%. Never turn on a grade; keep forks pointed downhill only when traveling empty.',
              },
            ],
          },
          {
            id: createId('block'),
            kind: 'quote',
            text: 'The data plate is a contract, not a suggestion. The truck will lift more than it can hold.',
            attribution: 'Soteria Forge safety engineering team',
          },
          {
            id: createId('block'),
            kind: 'video',
            url: 'https://www.youtube.com/watch?v=tBOTGtfNMHs',
            caption: 'Stability triangle demonstration: why raised, tilted loads tip trucks.',
          },
          {
            id: createId('block'),
            kind: 'callout',
            tone: 'warning',
            title: 'If a tip-over starts',
            html: 'Do <b>not</b> jump. Stay in the seat, brace your feet, grip the wheel, and lean away from the fall. Operators who jump are usually caught by the overhead guard.',
          },
          {
            id: createId('block'),
            kind: 'knowledgeCheck',
            question:
              'True or false: with a load raised high and tilted forward, the combined center of gravity moves toward the front edge of the stability triangle.',
            type: 'true_false',
            options: [
              { id: createId('opt'), text: 'True', correct: true },
              { id: createId('opt'), text: 'False', correct: false },
            ],
            feedbackCorrect:
              'True — raising and tilting forward shifts the combined center of gravity forward and up, shrinking your stability margin.',
            feedbackIncorrect:
              'It is true: height plus forward tilt pushes the center of gravity toward the front axle line — the edge of the triangle.',
          },
        ],
      },
      {
        id: createId('lesson'),
        title: 'Pedestrian Safety Zones',
        blocks: [
          { id: createId('block'), kind: 'heading', text: 'Sharing the floor', level: 2 },
          {
            id: createId('block'),
            kind: 'paragraph',
            html: 'Pedestrians are involved in a large share of serious forklift incidents — and the pedestrian almost always loses. Separation is the strategy: <strong>marked walkways, protected crossings, and eye contact</strong> before a truck ever moves near a person.',
          },
          {
            id: createId('block'),
            kind: 'flashcards',
            cards: [
              {
                id: createId('card'),
                front: 'Safe distance behind a moving truck',
                back: 'At least three truck lengths — or about 20 feet.',
              },
              {
                id: createId('card'),
                front: 'Blue safety light',
                back: 'A floor spot projected ahead/behind the truck warning pedestrians at blind corners.',
              },
              {
                id: createId('card'),
                front: 'Eye contact rule',
                back: 'Never cross in front of a truck until the operator sees you and signals you through.',
              },
              {
                id: createId('card'),
                front: 'Under raised forks',
                back: 'Never — loaded or empty. No person may stand or walk under elevated forks.',
              },
            ],
          },
          {
            id: createId('block'),
            kind: 'bulletList',
            items: [
              'Keep to marked pedestrian lanes; cross aisles only at designated points',
              'Sound the horn at intersections, doorways, and blind corners',
              'Stop and yield when a pedestrian enters your travel path',
              'Park with forks flat on the floor, controls neutral, brake set, key off',
            ],
          },
          { id: createId('block'), kind: 'divider', style: 'space' },
          {
            id: createId('block'),
            kind: 'button',
            label: 'Read OSHA 29 CFR 1910.178',
            url: 'https://www.osha.gov/laws-regs/regulations/standardnumber/1910/1910.178',
            style: 'primary',
          },
          {
            id: createId('block'),
            kind: 'embed',
            url: 'https://www.osha.gov/etools/powered-industrial-trucks',
            height: 480,
          },
          {
            id: createId('block'),
            kind: 'callout',
            tone: 'danger',
            title: 'Struck-by is the #1 pedestrian hazard',
            html: 'A 5,000 lb truck at walking speed still carries fatal momentum. Treat every aisle crossing like a road crossing: <b>stop, look, make eye contact</b>.',
          },
          {
            id: createId('block'),
            kind: 'knowledgeCheck',
            question:
              'Which of the following are required before a pedestrian crosses a forklift travel lane? Select all that apply.',
            type: 'multi_select',
            options: [
              { id: createId('opt'), text: 'Make eye contact with the operator', correct: true },
              {
                id: createId('opt'),
                text: 'Wait for the operator to signal you through',
                correct: true,
              },
              {
                id: createId('opt'),
                text: 'Assume the operator will stop for you',
                correct: false,
              },
              { id: createId('opt'), text: 'Use the designated crossing point', correct: true },
            ],
            feedbackCorrect:
              'Exactly — designated crossing, eye contact, and an explicit signal. Never assume the operator has seen you.',
            feedbackIncorrect:
              'Close, but remember: never assume the operator will stop. Cross only at designated points, with eye contact and a signal.',
          },
        ],
      },
    ],
  };
}
