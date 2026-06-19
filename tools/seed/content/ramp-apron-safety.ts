import type { CourseDraft } from '@forge/shared';
import { bid, SEED_TIMESTAMP } from './ids';
import { placeholderImage } from './placeholder';

/** Course id — MUST equal the parent courseId in Firestore. */
export const RAMP_APRON_COURSE_ID = 'atl-ramp-apron-safety';

/**
 * Ramp & Apron Safety — the foundational ATL ramp course. Covers FOD control,
 * the aircraft danger zones (intake/jet blast), GSE operation, pushback, and
 * hi-vis/hearing PPE. Aligned with OSHA 29 CFR 1910 and FAA AC 150/5210-24.
 *
 * Exercises every authoring block kind across four lessons.
 */
export function buildRampApronCourse(): CourseDraft {
  const id = RAMP_APRON_COURSE_ID;
  return {
    id,
    title: 'Ramp & Apron Safety',
    description:
      'Foreign object debris control, aircraft danger zones, ground support equipment, and pushback safety for ramp agents at a major hub. Aligned with OSHA 29 CFR 1910 and FAA AC 150/5210-24.',
    coverImageUrl: placeholderImage('Ramp & Apron Safety'),
    status: 'published',
    createdAt: SEED_TIMESTAMP,
    updatedAt: SEED_TIMESTAMP,
    lessons: [
      {
        id: bid(id, 'l1'),
        title: 'The Ramp Environment & FOD',
        blocks: [
          { id: bid(id, 'l1', 'b1'), kind: 'heading', text: 'Welcome to the ramp', level: 1 },
          {
            id: bid(id, 'l1', 'b2'),
            kind: 'paragraph',
            html: 'The apron is one of the most hazardous workplaces in transportation: jet engines, fast-moving vehicles, fuel, and tight turn times all in motion at once. Your first job every shift is to make the area <strong>safe and clean</strong> before an aircraft arrives.',
          },
          {
            id: bid(id, 'l1', 'b3'),
            kind: 'callout',
            tone: 'danger',
            title: 'Why FOD matters',
            html: 'A single bolt or torn strap ingested into a turbofan can shatter the <b>fan blades</b> and cost millions in engine damage — or worse, cause an aborted takeoff. FOD is the enemy.',
          },
          {
            id: bid(id, 'l1', 'b4'),
            kind: 'image',
            url: placeholderImage('The gate environment'),
            alt: 'Wide-body aircraft parked at a terminal gate with ground support equipment around it',
            caption: 'A typical gate: engines, GSE, fuel, and people sharing one apron.',
            layout: 'full',
          },
          {
            id: bid(id, 'l1', 'b5'),
            kind: 'bulletList',
            items: [
              'Walk the gate area before every arrival, eyes down (a FOD walk)',
              'Pick up loose bag straps, zip-ties, luggage tags, and hardware',
              'Report and remove any spill, debris, or dropped tool immediately',
              'Use covered FOD bins — never leave debris on the apron edge',
              'Treat a bird or animal on the ramp as organic FOD: report it',
            ],
          },
          {
            id: bid(id, 'l1', 'b6'),
            kind: 'numberedList',
            items: [
              'Line up abreast with your crew across the gate box',
              'Walk slowly, scanning the pavement from your feet outward',
              'Bag every loose item; do not kick debris aside',
              'Check under the jet bridge and behind GSE',
              'Signal "clear" only when the box is FOD-free',
            ],
          },
          {
            id: bid(id, 'l1', 'b7'),
            kind: 'quote',
            text: 'If it is not bolted to the aircraft or the apron, it does not belong on the ramp.',
            attribution: 'ATL ramp safety briefing',
          },
          { id: bid(id, 'l1', 'b8'), kind: 'divider', style: 'line' },
          {
            id: bid(id, 'l1', 'b9'),
            kind: 'knowledgeCheck',
            question: 'What does FOD stand for on the ramp?',
            type: 'mcq',
            options: [
              { id: bid(id, 'l1', 'b9', 'o1'), text: 'Foreign object debris', correct: true },
              { id: bid(id, 'l1', 'b9', 'o2'), text: 'Fuel oxidation damage', correct: false },
              { id: bid(id, 'l1', 'b9', 'o3'), text: 'Flight operations data', correct: false },
              { id: bid(id, 'l1', 'b9', 'o4'), text: 'Final on-deck delivery', correct: false },
            ],
            feedbackCorrect:
              'Correct — FOD is foreign object debris, and the damage it causes. A pre-arrival FOD walk is the cheapest defense there is.',
            feedbackIncorrect:
              'Not quite. FOD is foreign object debris — any loose item that can be ingested by an engine or cut a tire.',
          },
        ],
      },
      {
        id: bid(id, 'l2'),
        title: 'Aircraft Danger Zones',
        blocks: [
          {
            id: bid(id, 'l2', 'b1'),
            kind: 'heading',
            text: 'Intake, exhaust, and props',
            level: 2,
          },
          {
            id: bid(id, 'l2', 'b2'),
            kind: 'paragraph',
            html: 'A running engine creates two lethal zones: the <strong>intake</strong> in front, which can pull a person off their feet and ingest them, and the <strong>exhaust / jet blast</strong> behind, which can hurl a person or loose GSE dozens of feet.',
          },
          {
            id: bid(id, 'l2', 'b3'),
            kind: 'callout',
            tone: 'warning',
            title: 'Stay clear of running engines',
            html: 'Never walk in front of or behind an engine that is running or spooling. Jet blast at break-away thrust can exceed <b>hurricane-force winds</b>.',
          },
          {
            id: bid(id, 'l2', 'b4'),
            kind: 'tabs',
            items: [
              {
                id: bid(id, 'l2', 'b4', 'i1'),
                title: 'Intake zone',
                html: 'The suction in front of a running engine extends many feet. Approach the aircraft only when the engines are off and the anti-collision beacon is dark.',
              },
              {
                id: bid(id, 'l2', 'b4', 'i2'),
                title: 'Exhaust / blast zone',
                html: 'Behind the engine, jet blast can throw cones, carts, and people. Keep the blast danger area clear and never cut behind a taxiing aircraft.',
              },
              {
                id: bid(id, 'l2', 'b4', 'i3'),
                title: 'Beacon rule',
                html: 'A lit red anti-collision <b>beacon</b> means engines are running or about to start. No one approaches the aircraft until the beacon is off.',
              },
            ],
          },
          {
            id: bid(id, 'l2', 'b5'),
            kind: 'flashcards',
            cards: [
              {
                id: bid(id, 'l2', 'b5', 'c1'),
                front: 'Red beacon lit',
                back: 'Engines running or starting — stay clear of the aircraft.',
              },
              {
                id: bid(id, 'l2', 'b5', 'c2'),
                front: 'Jet blast',
                back: 'The hot, high-velocity exhaust behind an engine — can throw people and gear.',
              },
              {
                id: bid(id, 'l2', 'b5', 'c3'),
                front: 'Chocks',
                back: 'Rubber blocks placed at the main gear so the aircraft cannot roll.',
              },
              {
                id: bid(id, 'l2', 'b5', 'c4'),
                front: 'Cones',
                back: 'Placed around wingtips and engines to mark the safety perimeter at the gate.',
              },
            ],
          },
          {
            id: bid(id, 'l2', 'b6'),
            kind: 'video',
            url: 'https://www.youtube.com/watch?v=Dtl9I4Z9j_o',
            caption: 'Jet blast and engine ingestion: why the danger zones exist.',
          },
          {
            id: bid(id, 'l2', 'b7'),
            kind: 'knowledgeCheck',
            question:
              'True or false: it is safe to walk behind an aircraft as long as you stay several feet back.',
            type: 'true_false',
            options: [
              { id: bid(id, 'l2', 'b7', 'o1'), text: 'True', correct: false },
              { id: bid(id, 'l2', 'b7', 'o2'), text: 'False', correct: true },
            ],
            feedbackCorrect:
              'False — jet blast behind a running engine reaches far beyond a few feet and can hurl you into equipment. Keep clear of the entire blast danger area.',
            feedbackIncorrect:
              'It is false. The blast danger area extends well behind the aircraft; a few feet is nowhere near enough.',
          },
        ],
      },
      {
        id: bid(id, 'l3'),
        title: 'Ground Support Equipment',
        blocks: [
          { id: bid(id, 'l3', 'b1'), kind: 'heading', text: 'Driving and parking GSE', level: 2 },
          {
            id: bid(id, 'l3', 'b2'),
            kind: 'paragraph',
            html: 'Tugs, belt loaders, ground power units, and cargo carts are <strong>ground support equipment (GSE)</strong>. Tugs and tractors are powered industrial trucks under <em>OSHA 29 CFR 1910.178</em> — the same rule that governs forklifts.',
          },
          {
            id: bid(id, 'l3', 'b3'),
            kind: 'accordion',
            items: [
              {
                id: bid(id, 'l3', 'b3', 'i1'),
                title: 'Pre-use check',
                html: 'Before driving, check brakes, steering, horn, lights, and the tow hitch. Tag out and report any defective GSE — do not "make do."',
              },
              {
                id: bid(id, 'l3', 'b3', 'i2'),
                title: 'Mount and dismount',
                html: 'Use <b>three points of contact</b> getting on and off. Most GSE injuries are falls and slips at the step, not collisions.',
              },
              {
                id: bid(id, 'l3', 'b3', 'i3'),
                title: 'Parking',
                html: 'Set the parking brake, lower attachments, and chock the equipment before walking away. Never leave GSE running and unattended on a slope.',
              },
            ],
          },
          {
            id: bid(id, 'l3', 'b4'),
            kind: 'callout',
            tone: 'info',
            title: 'Ground power cables',
            html: 'A 400-Hz ground power unit (GPU) feeds the aircraft 115-volt electricity. Inspect cables for cuts; a worn GPU cable in a puddle is a serious shock and arc-flash hazard.',
          },
          {
            id: bid(id, 'l3', 'b5'),
            kind: 'knowledgeCheck',
            question:
              'Which of the following must you do before walking away from a parked tug? Select all that apply.',
            type: 'multi_select',
            options: [
              { id: bid(id, 'l3', 'b5', 'o1'), text: 'Set the parking brake', correct: true },
              {
                id: bid(id, 'l3', 'b5', 'o2'),
                text: 'Chock the equipment if required',
                correct: true,
              },
              {
                id: bid(id, 'l3', 'b5', 'o3'),
                text: 'Leave it running so it stays warm',
                correct: false,
              },
              { id: bid(id, 'l3', 'b5', 'o4'), text: 'Lower any raised attachment', correct: true },
            ],
            feedbackCorrect:
              'Exactly — brake set, attachments down, chocked as required. Unattended running GSE is a leading cause of ramp struck-by injuries.',
            feedbackIncorrect:
              'Close — never leave GSE running and unattended. Set the brake, lower attachments, and chock it.',
          },
        ],
      },
      {
        id: bid(id, 'l4'),
        title: 'Pushback, PPE & Resources',
        blocks: [
          { id: bid(id, 'l4', 'b1'), kind: 'heading', text: 'The departure push', level: 2 },
          {
            id: bid(id, 'l4', 'b2'),
            kind: 'paragraph',
            html: 'Pushback moves the aircraft backward off the gate with a tug and tow bar. It demands a clear, FOD-free path, <strong>wing walkers</strong> watching the tips, and constant communication on the headset.',
          },
          {
            id: bid(id, 'l4', 'b3'),
            kind: 'callout',
            tone: 'success',
            title: 'Dress to be seen and heard',
            html: 'Wear high-visibility apparel (ANSI/ISEA 107) and hearing protection on every shift. Apron noise routinely exceeds OSHA&rsquo;s 90-dBA limit (29 CFR 1910.95).',
          },
          {
            id: bid(id, 'l4', 'b4'),
            kind: 'button',
            label: 'Read OSHA 29 CFR 1910.178 (Powered Industrial Trucks)',
            url: 'https://www.osha.gov/laws-regs/regulations/standardnumber/1910/1910.178',
            style: 'primary',
          },
          {
            id: bid(id, 'l4', 'b5'),
            kind: 'embed',
            url: 'https://www.faa.gov/airports/resources/advisory_circulars/index.cfm/go/document.current/documentnumber/150_5210-24',
            height: 460,
          },
          {
            id: bid(id, 'l4', 'b6'),
            kind: 'divider',
            style: 'space',
          },
          {
            id: bid(id, 'l4', 'b7'),
            kind: 'knowledgeCheck',
            question: 'During pushback, what is the primary job of a wing walker?',
            type: 'mcq',
            options: [
              {
                id: bid(id, 'l4', 'b7', 'o1'),
                text: 'Watch the wingtips for obstacles and signal the tug driver',
                correct: true,
              },
              {
                id: bid(id, 'l4', 'b7', 'o2'),
                text: 'Drive the tug',
                correct: false,
              },
              {
                id: bid(id, 'l4', 'b7', 'o3'),
                text: 'Fuel the aircraft',
                correct: false,
              },
              {
                id: bid(id, 'l4', 'b7', 'o4'),
                text: 'Load the bags',
                correct: false,
              },
            ],
            feedbackCorrect:
              'Correct — wing walkers protect the wingtips and tail, watching for obstacles and other aircraft, and signal an immediate stop if anything enters the path.',
            feedbackIncorrect:
              'Not quite. A wing walker watches the wingtips/tail for clearance and signals the tug driver to stop if needed.',
          },
        ],
      },
    ],
  };
}
