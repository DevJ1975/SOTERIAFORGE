import type { CourseDraft } from '@forge/shared';
import { bid, SEED_TIMESTAMP } from './ids';

export const JET_BRIDGE_COURSE_ID = 'atl-jet-bridge-door-ops';

/**
 * Jet Bridge & Aircraft Door Operations — safe operation of the passenger
 * boarding bridge, crush/pinch and fall hazards, auto-leveling, and the heavy,
 * pressure-loaded aircraft cabin door. Aligned with OSHA 29 CFR 1910 walking-
 * working surfaces, machine-guarding, and ergonomics guidance.
 */
export function buildJetBridgeCourse(): CourseDraft {
  const id = JET_BRIDGE_COURSE_ID;
  return {
    id,
    title: 'Jet Bridge & Aircraft Door Operations',
    description:
      'Operating the passenger boarding bridge safely, managing crush and pinch points, fall protection at the cab, auto-leveling, and the heavy pressure-loaded cabin door. Aligned with OSHA 29 CFR 1910.',
    coverImageUrl: 'https://images.unsplash.com/photo-1542296332-2e4473faf563?w=1400&q=80',
    status: 'published',
    createdAt: SEED_TIMESTAMP,
    updatedAt: SEED_TIMESTAMP,
    lessons: [
      {
        id: bid(id, 'l1'),
        title: 'Anatomy of a Jet Bridge',
        blocks: [
          {
            id: bid(id, 'l1', 'b1'),
            kind: 'heading',
            text: 'The passenger boarding bridge',
            level: 1,
          },
          {
            id: bid(id, 'l1', 'b2'),
            kind: 'paragraph',
            html: 'A jet bridge (passenger boarding bridge) is a movable enclosed tunnel that connects the terminal gate to the aircraft door. It drives on powered wheels, rotates, and raises and lowers to meet the aircraft sill — and every one of those motions is a <strong>crush or pinch hazard</strong>.',
          },
          {
            id: bid(id, 'l1', 'b3'),
            kind: 'image',
            url: 'https://images.unsplash.com/photo-1559268950-2d7ceb2efa3a?w=1400&q=80',
            alt: 'A jet bridge connected to the forward door of a commercial aircraft',
            caption: 'The bridge cab docks to the aircraft door sill.',
            layout: 'full',
          },
          {
            id: bid(id, 'l1', 'b4'),
            kind: 'bulletList',
            items: [
              'Cab: the operator cabin that docks to the aircraft door',
              'Canopy / bellows: the soft hood that seals against the fuselage',
              'Drive column: the powered wheels that move and steer the bridge',
              'Auto-leveler: keeps the cab matched to the sill as the aircraft rises',
              'Service stairs: the apron-level access door and stairway',
            ],
          },
          {
            id: bid(id, 'l1', 'b5'),
            kind: 'callout',
            tone: 'info',
            title: 'Trained operators only',
            html: 'Only authorized, trained employees may drive the bridge. A mis-driven bridge that strikes the fuselage is one of the most common and expensive ramp incidents.',
          },
          {
            id: bid(id, 'l1', 'b6'),
            kind: 'knowledgeCheck',
            question:
              'Which jet bridge system keeps the cab matched to the aircraft door as it lightens during boarding?',
            type: 'mcq',
            options: [
              { id: bid(id, 'l1', 'b6', 'o1'), text: 'The auto-leveler', correct: true },
              { id: bid(id, 'l1', 'b6', 'o2'), text: 'The canopy', correct: false },
              { id: bid(id, 'l1', 'b6', 'o3'), text: 'The service stairs', correct: false },
              { id: bid(id, 'l1', 'b6', 'o4'), text: 'The wheel chock', correct: false },
            ],
            feedbackCorrect:
              'Correct — the auto-leveler senses the sill and adjusts the cab height as the aircraft rises with each departing passenger and bag.',
            feedbackIncorrect:
              'Not quite. The auto-leveler tracks the aircraft sill and keeps the cab level with it during boarding.',
          },
        ],
      },
      {
        id: bid(id, 'l2'),
        title: 'Crush, Pinch & Fall Hazards',
        blocks: [
          { id: bid(id, 'l2', 'b1'), kind: 'heading', text: 'Where people get hurt', level: 2 },
          {
            id: bid(id, 'l2', 'b2'),
            kind: 'paragraph',
            html: 'The serious injuries on a bridge come from <strong>pinch points</strong> between the moving cab and the fuselage, and from <strong>falls</strong> through an open cab when the bridge is not docked.',
          },
          {
            id: bid(id, 'l2', 'b3'),
            kind: 'callout',
            tone: 'danger',
            title: 'Close the safety gate',
            html: 'Whenever the bridge is away from the aircraft, the cab safety gate or barrier <b>must be closed</b>. An open cab is a fall-to-apron hazard.',
          },
          {
            id: bid(id, 'l2', 'b4'),
            kind: 'accordion',
            items: [
              {
                id: bid(id, 'l2', 'b4', 'i1'),
                title: 'Pinch points',
                html: 'Keep hands and body clear of the gap between the moving cab, canopy, and the aircraft skin. Drive slowly and watch your clearances.',
              },
              {
                id: bid(id, 'l2', 'b4', 'i2'),
                title: 'Fall protection',
                html: 'The cab opening is a fall hazard under <b>OSHA 1910.28</b>. Secure the gate and never lean out over the apron drop.',
              },
              {
                id: bid(id, 'l2', 'b4', 'i3'),
                title: 'Slips and trips',
                html: 'Bridge floors collect rain and de-ice fluid. Keep the deck clear and squeegee standing liquid — walking-working surfaces under 1910.22.',
              },
            ],
          },
          {
            id: bid(id, 'l2', 'b5'),
            kind: 'quote',
            text: 'Drive it like the aircraft is made of glass — because the repair bill says it is.',
            attribution: 'Gate operations lead',
          },
          {
            id: bid(id, 'l2', 'b6'),
            kind: 'knowledgeCheck',
            question:
              'When the bridge is parked away from an aircraft, the cab safety gate should be:',
            type: 'mcq',
            options: [
              { id: bid(id, 'l2', 'b6', 'o1'), text: 'Closed and secured', correct: true },
              { id: bid(id, 'l2', 'b6', 'o2'), text: 'Left open for ventilation', correct: false },
              { id: bid(id, 'l2', 'b6', 'o3'), text: 'Removed entirely', correct: false },
              { id: bid(id, 'l2', 'b6', 'o4'), text: 'Propped halfway', correct: false },
            ],
            feedbackCorrect:
              'Correct — an open cab is a fall-to-apron hazard, so the gate must be closed and secured whenever the bridge is undocked.',
            feedbackIncorrect:
              'Not quite. An undocked cab is an open fall hazard; the safety gate must be closed and secured.',
          },
        ],
      },
      {
        id: bid(id, 'l3'),
        title: 'The Aircraft Cabin Door',
        blocks: [
          {
            id: bid(id, 'l3', 'b1'),
            kind: 'heading',
            text: 'Heavy, awkward, and pressure-aware',
            level: 2,
          },
          {
            id: bid(id, 'l3', 'b2'),
            kind: 'paragraph',
            html: 'Aircraft cabin doors are heavy and can swing in the wind. Crews coordinate with the flight attendants, and <strong>never</strong> operate a door while the slide is armed. Repetitive heavy door and bag handling drives ramp <em>musculoskeletal disorders</em>.',
          },
          {
            id: bid(id, 'l3', 'b3'),
            kind: 'numberedList',
            items: [
              'Confirm the cabin crew has disarmed the slide before touching the door',
              'Knock and wait for acknowledgement before operating from outside',
              'Brace for wind load; use both hands and a stable stance',
              'Move the door smoothly through its arc — never force it',
              'Keep fingers clear of the hinge and frame pinch points',
            ],
          },
          {
            id: bid(id, 'l3', 'b4'),
            kind: 'callout',
            tone: 'warning',
            title: 'Slide-armed doors are deadly',
            html: 'An armed escape slide can deploy with enough force to throw a person off the bridge. Doors are operated only after the slide is confirmed <b>disarmed</b>.',
          },
          {
            id: bid(id, 'l3', 'b5'),
            kind: 'flashcards',
            cards: [
              {
                id: bid(id, 'l3', 'b5', 'c1'),
                front: 'Disarmed slide',
                back: 'The escape slide is disconnected from the door — required before opening from outside.',
              },
              {
                id: bid(id, 'l3', 'b5', 'c2'),
                front: 'Power zone',
                back: 'Knee-to-shoulder, close to the body — lift bags and brace doors here.',
              },
              {
                id: bid(id, 'l3', 'b5', 'c3'),
                front: 'MSD',
                back: 'Musculoskeletal disorder — strains from repetitive bending, twisting, and heavy lifts.',
              },
            ],
          },
          {
            id: bid(id, 'l3', 'b6'),
            kind: 'knowledgeCheck',
            question:
              'Which factors increase musculoskeletal injury risk during door and bag handling? Select all that apply.',
            type: 'multi_select',
            options: [
              { id: bid(id, 'l3', 'b6', 'o1'), text: 'Twisting while lifting', correct: true },
              { id: bid(id, 'l3', 'b6', 'o2'), text: 'Lifting away from the body', correct: true },
              { id: bid(id, 'l3', 'b6', 'o3'), text: 'Repetition without rotation', correct: true },
              {
                id: bid(id, 'l3', 'b6', 'o4'),
                text: 'Keeping the load in the power zone',
                correct: false,
              },
            ],
            feedbackCorrect:
              'Exactly — twisting, reaching, and repetition raise MSD risk; keeping loads in the power zone close to the body lowers it.',
            feedbackIncorrect:
              'Close — keeping the load in the power zone reduces risk. Twisting, reaching, and repetition increase it.',
          },
        ],
      },
      {
        id: bid(id, 'l4'),
        title: 'Procedures & Resources',
        blocks: [
          {
            id: bid(id, 'l4', 'b1'),
            kind: 'heading',
            text: 'Docking, undocking, references',
            level: 2,
          },
          {
            id: bid(id, 'l4', 'b2'),
            kind: 'tabs',
            items: [
              {
                id: bid(id, 'l4', 'b2', 'i1'),
                title: 'Docking',
                html: 'Approach slowly, line up on the door, extend, and let the auto-leveler set the sill. Confirm the canopy seals before passengers move.',
              },
              {
                id: bid(id, 'l4', 'b2', 'i2'),
                title: 'Undocking',
                html: 'Retract clear of the fuselage, close and secure the cab gate, and park the bridge in its stored position.',
              },
              {
                id: bid(id, 'l4', 'b2', 'i3'),
                title: 'High wind',
                html: 'In strong gusts the bridge is a wind-load hazard. Follow the ramp wind limits — secure or retract per local procedure.',
              },
            ],
          },
          {
            id: bid(id, 'l4', 'b3'),
            kind: 'video',
            url: 'https://www.youtube.com/watch?v=2f4lN1Q0pXg',
            caption: 'Walkthrough of safe jet bridge docking and undocking.',
          },
          {
            id: bid(id, 'l4', 'b4'),
            kind: 'button',
            label: 'Read OSHA 29 CFR 1910.28 (Fall Protection)',
            url: 'https://www.osha.gov/laws-regs/regulations/standardnumber/1910/1910.28',
            style: 'primary',
          },
          { id: bid(id, 'l4', 'b5'), kind: 'divider', style: 'line' },
          {
            id: bid(id, 'l4', 'b6'),
            kind: 'knowledgeCheck',
            question:
              'True or false: a cabin door may be opened from the outside before confirming the slide is disarmed.',
            type: 'true_false',
            options: [
              { id: bid(id, 'l4', 'b6', 'o1'), text: 'True', correct: false },
              { id: bid(id, 'l4', 'b6', 'o2'), text: 'False', correct: true },
            ],
            feedbackCorrect:
              'False — never operate a door until the cabin crew confirms the escape slide is disarmed; an armed slide can deploy violently.',
            feedbackIncorrect:
              'It is false. Confirm the slide is disarmed first — an armed slide can deploy with deadly force.',
          },
        ],
      },
    ],
  };
}
