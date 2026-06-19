import type { CourseDraft } from '@forge/shared';
import { bid, SEED_TIMESTAMP } from './ids';
import { placeholderImage } from './placeholder';

export const DEICING_COURSE_ID = 'atl-deicing-winter-ops';

/**
 * Aircraft De-Icing & Winter Ramp Ops — clean-aircraft concept, Type I-IV
 * fluids, holdover time, glycol/chemical and environmental hazards, fall
 * protection at the de-ice bucket, and cold-stress controls. Aligned with
 * OSHA 29 CFR 1910 PPE/fall and FAA holdover-time guidance.
 */
export function buildDeicingCourse(): CourseDraft {
  const id = DEICING_COURSE_ID;
  return {
    id,
    title: 'Aircraft De-Icing & Winter Ramp Ops',
    description:
      'The clean-aircraft concept, Type I-IV fluids, holdover time, glycol and environmental hazards, fall protection at the de-ice bucket, and cold-stress controls for winter ramp operations.',
    coverImageUrl: placeholderImage('De-Icing & Winter Ramp Ops'),
    status: 'published',
    createdAt: SEED_TIMESTAMP,
    updatedAt: SEED_TIMESTAMP,
    lessons: [
      {
        id: bid(id, 'l1'),
        title: 'Why We De-Ice',
        blocks: [
          {
            id: bid(id, 'l1', 'b1'),
            kind: 'heading',
            text: 'The clean-aircraft concept',
            level: 1,
          },
          {
            id: bid(id, 'l1', 'b2'),
            kind: 'paragraph',
            html: 'Even a thin layer of frost or snow disrupts airflow over the wing and can <strong>destroy the lift</strong> needed to fly. The clean-aircraft concept is simple: no aircraft takes off with contamination on its critical surfaces.',
          },
          {
            id: bid(id, 'l1', 'b3'),
            kind: 'callout',
            tone: 'danger',
            title: 'Frost kills lift',
            html: 'Contamination roughly the texture of <b>sandpaper</b> on a wing can cut lift by a third or more. Several fatal accidents trace directly to un-deiced wings.',
          },
          {
            id: bid(id, 'l1', 'b4'),
            kind: 'image',
            url: placeholderImage('Spraying de-icing fluid'),
            alt: 'A commercial aircraft being sprayed with de-icing fluid on a winter ramp',
            caption: 'De-icing fluid removes frozen contamination before departure.',
            layout: 'full',
          },
          {
            id: bid(id, 'l1', 'b5'),
            kind: 'bulletList',
            items: [
              'De-icing removes existing snow, ice, and frost',
              'Anti-icing protects clean surfaces from new accumulation',
              'Critical surfaces include wings, tail, control surfaces, and sensors',
              'A clean check confirms surfaces are clear before pushback',
            ],
          },
          {
            id: bid(id, 'l1', 'b6'),
            kind: 'knowledgeCheck',
            question: 'What is the difference between de-icing and anti-icing?',
            type: 'mcq',
            options: [
              {
                id: bid(id, 'l1', 'b6', 'o1'),
                text: 'De-icing removes existing contamination; anti-icing protects clean surfaces from new accumulation',
                correct: true,
              },
              {
                id: bid(id, 'l1', 'b6', 'o2'),
                text: 'They are two names for the same step',
                correct: false,
              },
              {
                id: bid(id, 'l1', 'b6', 'o3'),
                text: 'De-icing is for the fuselage; anti-icing is for the engines',
                correct: false,
              },
              {
                id: bid(id, 'l1', 'b6', 'o4'),
                text: 'Anti-icing happens after takeoff',
                correct: false,
              },
            ],
            feedbackCorrect:
              'Correct — de-icing strips off what is already there; anti-icing lays down a protective film so new snow does not stick during taxi.',
            feedbackIncorrect:
              'Not quite. De-icing removes existing ice/snow; anti-icing protects already-clean surfaces from new accumulation.',
          },
        ],
      },
      {
        id: bid(id, 'l2'),
        title: 'Fluids & Holdover Time',
        blocks: [
          { id: bid(id, 'l2', 'b1'), kind: 'heading', text: 'Types I through IV', level: 2 },
          {
            id: bid(id, 'l2', 'b2'),
            kind: 'paragraph',
            html: 'De-icing fluids are glycol-based and graded by type. <strong>Type I</strong> is a thin, heated de-icer; <strong>Type IV</strong> is a thick anti-icer that clings to the wing. Once anti-ice fluid is applied, the <em>holdover time</em> clock starts.',
          },
          {
            id: bid(id, 'l2', 'b3'),
            kind: 'tabs',
            items: [
              {
                id: bid(id, 'l2', 'b3', 'i1'),
                title: 'Type I',
                html: 'Heated, low-viscosity, usually orange-dyed. Removes ice and snow but offers little holdover protection.',
              },
              {
                id: bid(id, 'l2', 'b3', 'i2'),
                title: 'Type IV',
                html: 'Thickened, green-dyed anti-ice fluid that adheres to the wing and shears off during the takeoff roll, giving the longest holdover.',
              },
              {
                id: bid(id, 'l2', 'b3', 'i3'),
                title: 'Holdover time',
                html: 'The estimated window the fluid keeps the wing clean for the current weather. Exceed it and the aircraft must be treated again.',
              },
            ],
          },
          {
            id: bid(id, 'l2', 'b4'),
            kind: 'flashcards',
            cards: [
              {
                id: bid(id, 'l2', 'b4', 'c1'),
                front: 'Type I fluid',
                back: 'Heated, thin de-icer that removes existing contamination.',
              },
              {
                id: bid(id, 'l2', 'b4', 'c2'),
                front: 'Type IV fluid',
                back: 'Thick anti-ice fluid that protects the clean wing during taxi.',
              },
              {
                id: bid(id, 'l2', 'b4', 'c3'),
                front: 'Holdover time',
                back: 'The protection window after anti-ice fluid is applied.',
              },
              {
                id: bid(id, 'l2', 'b4', 'c4'),
                front: 'Glycol',
                back: 'The active alcohol in de-ice fluid — toxic and an environmental hazard.',
              },
            ],
          },
          {
            id: bid(id, 'l2', 'b5'),
            kind: 'callout',
            tone: 'info',
            title: 'Who sets holdover tables?',
            html: 'The FAA publishes holdover time guidelines each winter; operators build procedures from them. Holdover depends on fluid type, dilution, temperature, and precipitation rate.',
          },
          {
            id: bid(id, 'l2', 'b6'),
            kind: 'knowledgeCheck',
            question: 'Holdover time begins when:',
            type: 'mcq',
            options: [
              {
                id: bid(id, 'l2', 'b6', 'o1'),
                text: 'Anti-icing fluid application starts',
                correct: true,
              },
              { id: bid(id, 'l2', 'b6', 'o2'), text: 'The aircraft lands', correct: false },
              { id: bid(id, 'l2', 'b6', 'o3'), text: 'The cabin door closes', correct: false },
              { id: bid(id, 'l2', 'b6', 'o4'), text: 'The fuel truck disconnects', correct: false },
            ],
            feedbackCorrect:
              'Correct — the holdover clock starts at the beginning of the final anti-icing application and counts down the protection window.',
            feedbackIncorrect:
              'Not quite. Holdover time starts when the anti-icing fluid application begins.',
          },
        ],
      },
      {
        id: bid(id, 'l3'),
        title: 'Worker Hazards: Falls, Chemicals, Cold',
        blocks: [
          {
            id: bid(id, 'l3', 'b1'),
            kind: 'heading',
            text: 'Protecting the de-ice crew',
            level: 2,
          },
          {
            id: bid(id, 'l3', 'b2'),
            kind: 'paragraph',
            html: 'The operator sprays from an elevated bucket, often at night, in cold and slick conditions. The big three worker hazards are <strong>falls</strong>, <strong>chemical exposure</strong>, and <strong>cold stress</strong>.',
          },
          {
            id: bid(id, 'l3', 'b3'),
            kind: 'accordion',
            items: [
              {
                id: bid(id, 'l3', 'b3', 'i1'),
                title: 'Fall protection',
                html: 'A bucket puts the operator at height. Use the harness and anchor per <b>OSHA 1910.140</b>; keep the bucket floor clear of glycol slick.',
              },
              {
                id: bid(id, 'l3', 'b3', 'i2'),
                title: 'Chemical exposure',
                html: 'Glycol is toxic and can splash. Wear eye protection and gloves, read the <b>SDS</b>, and flush splashes for 15 minutes at the eyewash (1910.151).',
              },
              {
                id: bid(id, 'l3', 'b3', 'i3'),
                title: 'Cold stress',
                html: 'Frostbite and hypothermia are real. Wear insulated, water-resistant PPE, rotate crews, and warm up indoors on a schedule.',
              },
            ],
          },
          {
            id: bid(id, 'l3', 'b4'),
            kind: 'callout',
            tone: 'warning',
            title: 'Keep glycol out of the storm drain',
            html: 'Spent de-ice fluid is an environmental hazard under the Clean Water Act. It must be captured at the de-ice pad and treated or recycled, never washed to a drain.',
          },
          {
            id: bid(id, 'l3', 'b5'),
            kind: 'quote',
            text: 'A clean wing and a safe crew are the same job done right — neither one waits for the other.',
            attribution: 'Winter operations supervisor',
          },
          {
            id: bid(id, 'l3', 'b6'),
            kind: 'knowledgeCheck',
            question:
              'Which controls protect a de-ice operator in the elevated bucket? Select all that apply.',
            type: 'multi_select',
            options: [
              {
                id: bid(id, 'l3', 'b6', 'o1'),
                text: 'Fall-arrest harness and anchor',
                correct: true,
              },
              {
                id: bid(id, 'l3', 'b6', 'o2'),
                text: 'Chemical-splash eye protection',
                correct: true,
              },
              { id: bid(id, 'l3', 'b6', 'o3'), text: 'Insulated cold-weather PPE', correct: true },
              {
                id: bid(id, 'l3', 'b6', 'o4'),
                text: 'Spraying without gloves for better grip',
                correct: false,
              },
            ],
            feedbackCorrect:
              'Exactly — harness, splash protection, and cold-weather PPE. Bare hands on glycol in freezing weather is never acceptable.',
            feedbackIncorrect:
              'Close — gloves are required against glycol and cold. Harness, splash protection, and insulated PPE are all needed.',
          },
        ],
      },
      {
        id: bid(id, 'l4'),
        title: 'Procedures & References',
        blocks: [
          {
            id: bid(id, 'l4', 'b1'),
            kind: 'heading',
            text: 'Communication and resources',
            level: 2,
          },
          {
            id: bid(id, 'l4', 'b2'),
            kind: 'numberedList',
            items: [
              'Confirm the de-ice plan and fluid type with the flight crew',
              'Position the rig clear of engines and the blast zone',
              'Spray critical surfaces in sequence; avoid sensors and intakes',
              'Report fluid type, mix, and start time so holdover can be tracked',
              'Perform a post-treatment clean check before releasing the aircraft',
            ],
          },
          {
            id: bid(id, 'l4', 'b3'),
            kind: 'video',
            url: 'https://www.youtube.com/watch?v=q4iJL9j2Z2A',
            caption: 'How aircraft de-icing and anti-icing protect the wing.',
          },
          {
            id: bid(id, 'l4', 'b4'),
            kind: 'button',
            label: 'FAA Holdover Time Guidelines',
            url: 'https://www.faa.gov/about/office_org/headquarters_offices/ang/offices/tc/about/campus/faa_host/labs/aviation_research/winter/holdover/',
            style: 'primary',
          },
          {
            id: bid(id, 'l4', 'b5'),
            kind: 'embed',
            url: 'https://www.osha.gov/winter-weather',
            height: 460,
          },
          { id: bid(id, 'l4', 'b6'), kind: 'divider', style: 'space' },
          {
            id: bid(id, 'l4', 'b7'),
            kind: 'knowledgeCheck',
            question:
              'True or false: spent de-icing glycol can be washed into the nearest storm drain.',
            type: 'true_false',
            options: [
              { id: bid(id, 'l4', 'b7', 'o1'), text: 'True', correct: false },
              { id: bid(id, 'l4', 'b7', 'o2'), text: 'False', correct: true },
            ],
            feedbackCorrect:
              'False — glycol is an environmental hazard and must be captured and treated, not released to a storm drain.',
            feedbackIncorrect:
              'It is false. Spent glycol must be contained and treated; releasing it to a storm drain violates the Clean Water Act.',
          },
        ],
      },
    ],
  };
}
