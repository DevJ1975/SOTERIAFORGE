import type { CourseDraft } from '@forge/shared';
import { bid, SEED_TIMESTAMP } from './ids';
import { placeholderImage } from './placeholder';

export const FUELING_COURSE_ID = 'atl-fueling-fire-safety';

/**
 * Aviation Fueling Safety & Fire Prevention — Jet A properties, the fire
 * tetrahedron, bonding and static control, the 50-foot rule, spill response,
 * and ARFF coordination. Aligned with NFPA 407 and OSHA 29 CFR 1910.106.
 */
export function buildFuelingCourse(): CourseDraft {
  const id = FUELING_COURSE_ID;
  return {
    id,
    title: 'Aviation Fueling Safety & Fire Prevention',
    description:
      'Jet A properties, the fire tetrahedron, bonding and static control, the 50-foot ignition rule, spill response, and ARFF coordination. Aligned with NFPA 407 and OSHA 29 CFR 1910.106.',
    coverImageUrl: placeholderImage('Fueling Safety & Fire Prevention'),
    status: 'published',
    createdAt: SEED_TIMESTAMP,
    updatedAt: SEED_TIMESTAMP,
    lessons: [
      {
        id: bid(id, 'l1'),
        title: 'Jet Fuel & the Fire Tetrahedron',
        blocks: [
          { id: bid(id, 'l1', 'b1'), kind: 'heading', text: 'Know your fuel', level: 1 },
          {
            id: bid(id, 'l1', 'b2'),
            kind: 'paragraph',
            html: 'Most commercial turbine aircraft burn <strong>Jet A</strong>, a kerosene-based fuel. It is less volatile than gasoline but its vapors still burn fiercely. Fire needs four things — the <em>fire tetrahedron</em>: fuel, oxygen, heat, and an uninhibited chemical chain reaction.',
          },
          {
            id: bid(id, 'l1', 'b3'),
            kind: 'callout',
            tone: 'info',
            title: 'Jet A vs. avgas',
            html: 'Jet A is turbine fuel; <b>100LL</b> avgas is for piston aircraft and is far more volatile. Never confuse the two — misfueling is a serious safety event.',
          },
          {
            id: bid(id, 'l1', 'b4'),
            kind: 'bulletList',
            items: [
              'Remove a leg of the tetrahedron and the fire goes out',
              'Vapor, not liquid, is what ignites — control the vapor',
              'Static electricity is a hidden ignition source during transfer',
              'Bonding equalizes charge so a spark cannot jump',
            ],
          },
          {
            id: bid(id, 'l1', 'b5'),
            kind: 'image',
            url: placeholderImage('Fuel servicing at the gate'),
            alt: 'A fuel truck servicing a commercial aircraft at the gate',
            caption: 'Fuel servicing: bonding, spill kits, and a clear ignition zone.',
            layout: 'full',
          },
          {
            id: bid(id, 'l1', 'b6'),
            kind: 'knowledgeCheck',
            question: 'Which four elements make up the fire tetrahedron?',
            type: 'mcq',
            options: [
              {
                id: bid(id, 'l1', 'b6', 'o1'),
                text: 'Fuel, oxygen, heat, and a chemical chain reaction',
                correct: true,
              },
              {
                id: bid(id, 'l1', 'b6', 'o2'),
                text: 'Fuel, water, pressure, and friction',
                correct: false,
              },
              {
                id: bid(id, 'l1', 'b6', 'o3'),
                text: 'Spark, smoke, ash, and flame',
                correct: false,
              },
              {
                id: bid(id, 'l1', 'b6', 'o4'),
                text: 'Oxygen, nitrogen, carbon, and heat',
                correct: false,
              },
            ],
            feedbackCorrect:
              'Correct — fuel, oxygen, heat, and the uninhibited chemical chain reaction. Remove any one and combustion stops.',
            feedbackIncorrect:
              'Not quite. The fire tetrahedron is fuel, oxygen, heat, and the chemical chain reaction.',
          },
        ],
      },
      {
        id: bid(id, 'l2'),
        title: 'Bonding, Static & the 50-Foot Rule',
        blocks: [
          {
            id: bid(id, 'l2', 'b1'),
            kind: 'heading',
            text: 'Controlling ignition sources',
            level: 2,
          },
          {
            id: bid(id, 'l2', 'b2'),
            kind: 'paragraph',
            html: 'Before fuel flows, the fueler and aircraft are connected by a <strong>bonding cable</strong> to equalize electrical potential, so a static discharge cannot ignite vapor. And no ignition source — no smoking, no spark, no running engine — is allowed within <strong>50 feet</strong> of the operation.',
          },
          {
            id: bid(id, 'l2', 'b3'),
            kind: 'tabs',
            items: [
              {
                id: bid(id, 'l2', 'b3', 'i1'),
                title: 'Bonding',
                html: 'Connect the bond before the nozzle, disconnect it last. Bonding equalizes charge between the truck and aircraft so a static spark cannot jump.',
              },
              {
                id: bid(id, 'l2', 'b3', 'i2'),
                title: 'The 50-foot rule',
                html: 'Keep all ignition sources at least <b>50 feet</b> from fueling, venting, and spill areas, per NFPA 407 and airport rules.',
              },
              {
                id: bid(id, 'l2', 'b3', 'i3'),
                title: 'Overwing vents',
                html: 'Fuel vapor escapes from wing vents during fueling. Position equipment and people away from the vent discharge.',
              },
            ],
          },
          {
            id: bid(id, 'l2', 'b4'),
            kind: 'callout',
            tone: 'danger',
            title: 'No phones, no sparks',
            html: 'Cell phones, non-rated electronics, and any open flame are ignition sources. Keep them out of the fueling zone.',
          },
          {
            id: bid(id, 'l2', 'b5'),
            kind: 'flashcards',
            cards: [
              {
                id: bid(id, 'l2', 'b5', 'c1'),
                front: 'Bonding cable',
                back: 'Conductive wire that equalizes charge between fueler and aircraft.',
              },
              {
                id: bid(id, 'l2', 'b5', 'c2'),
                front: '50-foot rule',
                back: 'No ignition sources within 50 feet of fueling, venting, or a spill.',
              },
              {
                id: bid(id, 'l2', 'b5', 'c3'),
                front: 'NFPA 407',
                back: 'The standard for aircraft fuel servicing.',
              },
            ],
          },
          {
            id: bid(id, 'l2', 'b6'),
            kind: 'knowledgeCheck',
            question:
              'Within how many feet of a fueling operation must ignition sources be excluded?',
            type: 'mcq',
            options: [
              { id: bid(id, 'l2', 'b6', 'o1'), text: '50 feet', correct: true },
              { id: bid(id, 'l2', 'b6', 'o2'), text: '5 feet', correct: false },
              { id: bid(id, 'l2', 'b6', 'o3'), text: '10 feet', correct: false },
              { id: bid(id, 'l2', 'b6', 'o4'), text: '500 feet', correct: false },
            ],
            feedbackCorrect:
              'Correct — the 50-foot rule (NFPA 407) keeps smoking, sparks, and other ignition sources away from fueling, venting, and spill areas.',
            feedbackIncorrect:
              'Not quite. Ignition sources must stay at least 50 feet from the fueling operation.',
          },
        ],
      },
      {
        id: bid(id, 'l3'),
        title: 'Spill Response & ARFF',
        blocks: [
          { id: bid(id, 'l3', 'b1'), kind: 'heading', text: 'When fuel hits the ground', level: 2 },
          {
            id: bid(id, 'l3', 'b2'),
            kind: 'paragraph',
            html: 'A fuel spill is a fire waiting for an ignition source. Stop the flow, alert others, and for anything beyond a minor spill, call <strong>ARFF</strong> — aircraft rescue and firefighting.',
          },
          {
            id: bid(id, 'l3', 'b3'),
            kind: 'numberedList',
            items: [
              'Stop fueling immediately — release the deadman control',
              'Identify the spill size against your local threshold',
              'Notify ARFF and operations for anything over a minor spill',
              'Eliminate ignition sources and move people upwind',
              'Contain with the spill kit; keep fuel out of storm drains',
            ],
          },
          {
            id: bid(id, 'l3', 'b4'),
            kind: 'callout',
            tone: 'warning',
            title: 'Know your extinguisher classes',
            html: 'Jet fuel is a <b>Class B</b> flammable-liquid fire. A live GPU or electrical fire is <b>Class C</b>. Use the right agent — water spreads a fuel fire.',
          },
          {
            id: bid(id, 'l3', 'b5'),
            kind: 'accordion',
            items: [
              {
                id: bid(id, 'l3', 'b5', 'i1'),
                title: 'Class B fires',
                html: 'Flammable liquids like Jet A. Smother with foam, CO2, or dry chemical — never plain water.',
              },
              {
                id: bid(id, 'l3', 'b5', 'i2'),
                title: 'PASS technique',
                html: 'Pull the pin, Aim at the base of the fire, Squeeze the handle, Sweep side to side.',
              },
              {
                id: bid(id, 'l3', 'b5', 'i3'),
                title: 'When to run',
                html: 'Extinguishers fight only small, incipient fires. If a fuel fire is growing, evacuate and let ARFF handle it.',
              },
            ],
          },
          {
            id: bid(id, 'l3', 'b6'),
            kind: 'knowledgeCheck',
            question: 'Which actions belong in a fuel-spill response? Select all that apply.',
            type: 'multi_select',
            options: [
              { id: bid(id, 'l3', 'b6', 'o1'), text: 'Stop fueling immediately', correct: true },
              {
                id: bid(id, 'l3', 'b6', 'o2'),
                text: 'Notify ARFF for a large spill',
                correct: true,
              },
              { id: bid(id, 'l3', 'b6', 'o3'), text: 'Eliminate ignition sources', correct: true },
              {
                id: bid(id, 'l3', 'b6', 'o4'),
                text: 'Hose the fuel into the storm drain',
                correct: false,
              },
            ],
            feedbackCorrect:
              'Exactly — stop the flow, notify ARFF, and remove ignition sources. Fuel must be contained, never washed to a drain.',
            feedbackIncorrect:
              'Close — never wash fuel into a storm drain. Stop fueling, notify ARFF, and eliminate ignition sources.',
          },
        ],
      },
      {
        id: bid(id, 'l4'),
        title: 'Standards & References',
        blocks: [
          { id: bid(id, 'l4', 'b1'), kind: 'heading', text: 'The rules behind the ramp', level: 2 },
          {
            id: bid(id, 'l4', 'b2'),
            kind: 'paragraph',
            html: 'Two bodies of rules govern fueling: <strong>NFPA 407</strong> for the fuel-servicing practice itself, and <strong>OSHA 29 CFR 1910.106</strong> for flammable liquids in the workplace. Know where to find both.',
          },
          {
            id: bid(id, 'l4', 'b3'),
            kind: 'quote',
            text: 'Bond it, ground your assumptions, and keep the spark fifty feet away.',
            attribution: 'Fueling operations trainer',
          },
          {
            id: bid(id, 'l4', 'b4'),
            kind: 'button',
            label: 'Read OSHA 29 CFR 1910.106 (Flammable Liquids)',
            url: 'https://www.osha.gov/laws-regs/regulations/standardnumber/1910/1910.106',
            style: 'primary',
          },
          {
            id: bid(id, 'l4', 'b5'),
            kind: 'embed',
            url: 'https://www.nfpa.org/codes-and-standards/nfpa-407-standard-development/407',
            height: 460,
          },
          { id: bid(id, 'l4', 'b6'), kind: 'divider', style: 'line' },
          {
            id: bid(id, 'l4', 'b7'),
            kind: 'knowledgeCheck',
            question: 'Jet A fuel fires are classified as which fire class?',
            type: 'mcq',
            options: [
              { id: bid(id, 'l4', 'b7', 'o1'), text: 'Class B (flammable liquids)', correct: true },
              {
                id: bid(id, 'l4', 'b7', 'o2'),
                text: 'Class A (ordinary combustibles)',
                correct: false,
              },
              {
                id: bid(id, 'l4', 'b7', 'o3'),
                text: 'Class D (combustible metals)',
                correct: false,
              },
              { id: bid(id, 'l4', 'b7', 'o4'), text: 'Class K (cooking media)', correct: false },
            ],
            feedbackCorrect:
              'Correct — Jet A is a flammable liquid, so its fires are Class B. Smother them with foam, CO2, or dry chemical; never water.',
            feedbackIncorrect: 'Not quite. Jet A is a flammable liquid, making it a Class B fire.',
          },
        ],
      },
    ],
  };
}
