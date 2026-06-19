/**
 * PERIL! clue database — pure TypeScript, no Phaser imports.
 *
 * Clues are phrased as ANSWERS (Jeopardy-style); every response option is
 * phrased IN THE FORM OF A QUESTION. All content is real workplace-safety /
 * injury-prevention material with OSHA citations where natural.
 */

export type RoundId = 'round1' | 'round2' | 'final';

export interface PerilClue {
  /** The answer-form clue text read to contestants. */
  clue: string;
  /** The single correct question-form response. */
  correctResponse: string;
  /** Exactly three plausible question-form distractors. */
  distractors: [string, string, string];
  /** Dollar value; matches the round's tier ladder (0 for Final PERIL). */
  value: number;
  /** One-sentence explanation shown after the clue resolves. */
  explanation?: string;
}

export interface PerilCategory {
  name: string;
  clues: PerilClue[];
}

export interface FinalPeril {
  category: string;
  clue: PerilClue;
}

export const ROUND_ONE_VALUES: readonly number[] = [200, 400, 600, 800, 1000];
export const ROUND_TWO_VALUES: readonly number[] = [400, 800, 1200, 1600, 2000];

const r1 = ROUND_ONE_VALUES;
const r2 = ROUND_TWO_VALUES;

export const ROUND_ONE_CATEGORIES: PerilCategory[] = [
  {
    name: 'SLIPS, TRIPS & FALL GUYS',
    clues: [
      {
        value: r1[0],
        clue: 'Before mopping a walkway, post this bright yellow A-frame warning so coworkers know the floor is slick.',
        correctResponse: 'What is a wet floor sign?',
        distractors: [
          'What is a lockout tag?',
          'What is a fire blanket?',
          'What is a biohazard label?',
        ],
        explanation:
          'OSHA 1910.22 requires walking-working surfaces to be kept clean, orderly, and dry where feasible — warning signs alert workers until the hazard is cleared.',
      },
      {
        value: r1[1],
        clue: 'In general industry, OSHA requires fall protection at this height above a lower level — two feet lower than the construction trigger.',
        correctResponse: 'What is 4 feet?',
        distractors: ['What is 6 feet?', 'What is 10 feet?', 'What is 25 feet?'],
        explanation:
          'OSHA 1910.28 sets the general industry threshold at 4 feet; construction (1926.501) uses 6 feet.',
      },
      {
        value: r1[2],
        clue: 'This numbered rule of contact — two hands and a foot, or two feet and a hand — keeps you attached while climbing on or off equipment.',
        correctResponse: 'What is three points of contact?',
        distractors: [
          'What is the two-person rule?',
          'What is the four-corner rule?',
          'What is single point of failure?',
        ],
        explanation:
          'Maintaining three points of contact while mounting and dismounting vehicles and ladders dramatically reduces same-level and elevated falls.',
      },
      {
        value: r1[3],
        clue: 'A guardrail system must have its top rail at roughly this height above the walking surface — 42 inches, give or take 3.',
        correctResponse: 'What is 42 inches?',
        distractors: ['What is 24 inches?', 'What is 36 inches?', 'What is 60 inches?'],
        explanation:
          'OSHA 1910.29(b)(1) requires top rails 42 inches (plus or minus 3 inches) above the walking-working surface.',
      },
      {
        value: r1[4],
        clue: 'Slips happen when this measured property of a floor surface, abbreviated COF, drops too low underfoot.',
        correctResponse: 'What is the coefficient of friction?',
        distractors: [
          'What is the center of gravity?',
          'What is the permissible exposure limit?',
          'What is the factor of safety?',
        ],
        explanation:
          'A higher coefficient of friction between shoe and floor means better traction; flooring and footwear are often selected by COF rating.',
      },
    ],
  },
  {
    name: 'PPE OR NOT PPE',
    clues: [
      {
        value: r1[0],
        clue: 'Protect your noggin from falling objects with this Class G, E, or C rated piece of head protection.',
        correctResponse: 'What is a hard hat?',
        distractors: ['What is a welding hood?', 'What is a hairnet?', 'What is a face shield?'],
        explanation:
          'ANSI/ISEA Z89.1 classifies hard hats by impact type and electrical rating: Class G (general), E (electrical), and C (conductive).',
      },
      {
        value: r1[1],
        clue: '"Z87.1" stamped on the frame means this eye-protecting PPE meets the ANSI impact standard.',
        correctResponse: 'What are safety glasses?',
        distractors: [
          'What are reading glasses?',
          'What are blue-light filters?',
          'What are sunglasses?',
        ],
        explanation:
          'OSHA 1910.133 requires eye protection meeting ANSI Z87.1 wherever flying particles, chemicals, or radiation threaten the eyes.',
      },
      {
        value: r1[2],
        clue: 'Before a tight-fitting respirator is assigned, the wearer must pass this annual test proving the mask seals to their face.',
        correctResponse: 'What is a fit test?',
        distractors: [
          'What is a stress test?',
          'What is a pulmonary biopsy?',
          'What is a drug screen?',
        ],
        explanation:
          'OSHA 1910.134 requires fit testing before first use and at least annually for tight-fitting respirators.',
      },
      {
        value: r1[3],
        clue: 'Under OSHA 1910.132, this party must pay for most required PPE — and it is not the worker.',
        correctResponse: 'Who is the employer?',
        distractors: [
          'Who is the insurance carrier?',
          'Who is the union steward?',
          'Who is the equipment manufacturer?',
        ],
        explanation:
          'Since 2008, 1910.132(h) requires employers to provide most required PPE at no cost to employees.',
      },
      {
        value: r1[4],
        clue: 'Cut-resistant gloves are graded A1 through A9 under this ANSI/ISEA standard, number 105.',
        correctResponse: 'What is ANSI/ISEA 105?',
        distractors: ['What is NFPA 70E?', 'What is ANSI Z359?', 'What is ISO 9001?'],
        explanation:
          'ANSI/ISEA 105 rates glove cut resistance from A1 (light) to A9 (extreme); match the rating to the blade and material hazard.',
      },
    ],
  },
  {
    name: 'LOTO-RY TICKETS',
    clues: [
      {
        value: r1[0],
        clue: 'LOTO is shorthand for this two-word hazardous-energy control practice.',
        correctResponse: 'What is lockout/tagout?',
        distractors: [
          'What is load testing?',
          'What is log-on/time-out?',
          'What is low-torque operation?',
        ],
        explanation:
          'OSHA 1910.147, The Control of Hazardous Energy, is universally known as the lockout/tagout (LOTO) standard.',
      },
      {
        value: r1[1],
        clue: 'Locking out is not enough — you must also do this, operating the controls to confirm the machine truly cannot start.',
        correctResponse: 'What is verifying zero energy?',
        distractors: [
          'What is filing a permit?',
          'What is photographing the panel?',
          'What is calling the manufacturer?',
        ],
        explanation:
          '1910.147(d)(6) requires verifying isolation by attempting to operate the equipment before service begins — "lock, tag, verify."',
      },
      {
        value: r1[2],
        clue: 'Compressed springs, raised loads, and charged capacitors are classic examples of this kind of energy that lingers after shutdown.',
        correctResponse: 'What is stored energy?',
        distractors: [
          'What is renewable energy?',
          'What is thermal drift?',
          'What is static cling?',
        ],
        explanation:
          'Stored (residual) energy must be relieved, disconnected, restrained, or otherwise rendered safe during lockout.',
      },
      {
        value: r1[3],
        clue: 'Per 1910.147, this is normally the only person allowed to remove a lockout lock — the one who put it on.',
        correctResponse: 'Who is the authorized employee who applied it?',
        distractors: [
          'Who is the plant manager?',
          'Who is the night security guard?',
          'Who is the newest apprentice?',
        ],
        explanation:
          'Locks may only be removed by the employee who applied them, except under a strict documented procedure when that person is unavailable.',
      },
      {
        value: r1[4],
        clue: 'When a whole crew services one machine, each worker hangs a personal lock on this multi-hole clamp device.',
        correctResponse: 'What is a group lockout hasp?',
        distractors: ['What is a carabiner?', 'What is a turnbuckle?', 'What is a master link?'],
        explanation:
          'A group lockout hasp lets every authorized employee attach a personal lock, so the energy source stays isolated until the last lock comes off.',
      },
    ],
  },
  {
    name: 'FORKLIFT FOLLIES',
    clues: [
      {
        value: r1[0],
        clue: 'Before each shift, the operator must give the forklift this kind of look-over, usually with a checklist.',
        correctResponse: 'What is a pre-operation inspection?',
        distractors: [
          'What is a victory lap?',
          'What is an emissions test?',
          'What is a wheel alignment?',
        ],
        explanation:
          'OSHA 1910.178(q)(7) requires industrial trucks to be examined at least daily, or after each shift when used around the clock.',
      },
      {
        value: r1[1],
        clue: 'When traveling with a load, keep the forks in this position — about 4 to 6 inches off the floor, mast tilted back.',
        correctResponse: 'What is lowered?',
        distractors: ['What is fully raised?', 'What is at eye level?', 'What is tilted forward?'],
        explanation:
          'Carrying loads low and tilted back keeps the center of gravity stable and preserves visibility.',
      },
      {
        value: r1[2],
        clue: 'In nonagricultural work, federal law says forklift operators must be at least this old.',
        correctResponse: 'What is 18?',
        distractors: ['What is 16?', 'What is 21?', 'What is 25?'],
        explanation:
          'The Fair Labor Standards Act hazardous occupation orders bar workers under 18 from operating forklifts in nonagricultural jobs.',
      },
      {
        value: r1[3],
        clue: 'Keep the combined center of gravity inside this three-sided geometric zone and the forklift stays on its wheels.',
        correctResponse: 'What is the stability triangle?',
        distractors: [
          'What is the Bermuda triangle?',
          'What is the load rectangle?',
          'What is the pivot circle?',
        ],
        explanation:
          'The stability triangle runs between the two front wheels and the rear axle pivot; let the center of gravity leave it and the truck tips.',
      },
      {
        value: r1[4],
        clue: 'OSHA 1910.178 requires each forklift operator be re-evaluated at least once every this many years.',
        correctResponse: 'What is three?',
        distractors: ['What is one?', 'What is five?', 'What is ten?'],
        explanation:
          '1910.178(l)(4)(iii) mandates an evaluation of each operator at least once every three years, plus refresher training after incidents.',
      },
    ],
  },
  {
    name: 'SOUNDS HAZARDOUS',
    clues: [
      {
        value: r1[0],
        clue: 'Foam inserts and earmuffs both fall under this two-word category of PPE for your ears.',
        correctResponse: 'What is hearing protection?',
        distractors: [
          'What is noise cancellation?',
          'What is audio equipment?',
          'What is sound insulation?',
        ],
        explanation:
          'Hearing protection devices are rated by NRR (Noise Reduction Rating) to estimate how many decibels they block.',
      },
      {
        value: r1[1],
        clue: "OSHA's 8-hour action level for workplace noise is this decibel reading.",
        correctResponse: 'What is 85 decibels?',
        distractors: ['What is 60 decibels?', 'What is 100 decibels?', 'What is 120 decibels?'],
        explanation:
          'At an 85 dBA 8-hour time-weighted average, OSHA 1910.95 requires employers to act on noise exposure.',
      },
      {
        value: r1[2],
        clue: 'Hit that 85 dBA average and the employer must launch this program, complete with annual audiograms.',
        correctResponse: 'What is a hearing conservation program?',
        distractors: [
          'What is a wellness stipend?',
          'What is a quiet-quitting policy?',
          'What is a music appreciation course?',
        ],
        explanation:
          '1910.95(c) requires a hearing conservation program — monitoring, audiometric testing, protectors, and training — at the 85 dBA action level.',
      },
      {
        value: r1[3],
        clue: "OSHA's 8-hour permissible exposure limit for noise is this dBA figure — five louder than the action level.",
        correctResponse: 'What is 90 decibels?',
        distractors: ['What is 80 decibels?', 'What is 95 decibels?', 'What is 110 decibels?'],
        explanation:
          'The PEL in 1910.95 is 90 dBA as an 8-hour time-weighted average, with a 5-dB exchange rate halving allowed time.',
      },
      {
        value: r1[4],
        clue: 'An audiogram showing an average 10-dB loss at 2,000, 3,000 and 4,000 Hz from baseline is this recordable change, abbreviated STS.',
        correctResponse: 'What is a standard threshold shift?',
        distractors: [
          'What is a seismic transfer signal?',
          'What is a sound transmission score?',
          'What is short-term sensitivity?',
        ],
        explanation:
          'A standard threshold shift under 1910.95(g)(10) triggers follow-up action and may be recordable on the OSHA 300 log.',
      },
    ],
  },
  {
    name: 'FIRE AWAY',
    clues: [
      {
        value: r1[0],
        clue: 'Remember this four-letter acronym — Pull, Aim, Squeeze, Sweep — when grabbing an extinguisher.',
        correctResponse: 'What is PASS?',
        distractors: ['What is RACE?', 'What is STOP?', 'What is FIRE?'],
        explanation:
          'PASS: Pull the pin, Aim at the base of the fire, Squeeze the handle, Sweep side to side.',
      },
      {
        value: r1[1],
        clue: 'Grease and cooking-oil fires in the kitchen belong to this letter class of fire.',
        correctResponse: 'What is Class K?',
        distractors: ['What is Class A?', 'What is Class D?', 'What is Class Z?'],
        explanation:
          'Class K extinguishers use wet chemical agents that saponify hot cooking oils — water makes a grease fire explode outward.',
      },
      {
        value: r1[2],
        clue: 'Class C fires involve this hazard, which is why you never fight them with water.',
        correctResponse: 'What is energized electrical equipment?',
        distractors: [
          'What is dry timber?',
          'What is cooking grease?',
          'What is combustible metal?',
        ],
        explanation:
          'Water conducts electricity; de-energize the equipment or use a C-rated extinguisher such as CO2 or dry chemical.',
      },
      {
        value: r1[3],
        clue: 'Gasoline, solvents, and other flammable liquids fall into this fire class.',
        correctResponse: 'What is Class B?',
        distractors: ['What is Class A?', 'What is Class C?', 'What is Class K?'],
        explanation:
          'Class B covers flammable liquids and gases; smothering agents like foam, CO2, or dry chemical cut off the oxygen.',
      },
      {
        value: r1[4],
        clue: 'Heat, fuel, oxygen — and this fourth element that completes the modern "fire tetrahedron."',
        correctResponse: 'What is the chemical chain reaction?',
        distractors: [
          'What is carbon dioxide?',
          'What is atmospheric pressure?',
          'What is static electricity?',
        ],
        explanation:
          'The uninhibited chemical chain reaction sustains combustion, which is why agents like dry chemical interrupt it to kill a fire.',
      },
    ],
  },
];

export const ROUND_TWO_CATEGORIES: PerilCategory[] = [
  {
    name: 'ERGO, THEREFORE I AM',
    clues: [
      {
        value: r2[0],
        clue: 'Every safety poster ever printed says to lift with these, not with your back.',
        correctResponse: 'What are your legs?',
        distractors: ['What are your arms?', 'What are your teeth?', 'What are your coworkers?'],
        explanation:
          'Bending the knees and keeping the load close lets the strong leg muscles do the work instead of the lumbar spine.',
      },
      {
        value: r2[1],
        clue: 'Carpal tunnel syndrome and tendinitis are classic examples of this injury category, abbreviated MSD.',
        correctResponse: 'What is a musculoskeletal disorder?',
        distractors: [
          'What is a mandatory safety drill?',
          'What is a material safety defect?',
          'What is a metabolic stress deficiency?',
        ],
        explanation:
          'Work-related musculoskeletal disorders develop from repetition, force, and awkward postures, and account for roughly a third of injury cases involving days away from work.',
      },
      {
        value: r2[2],
        clue: 'Keeping work between knee and shoulder height keeps it inside this aptly named prime lifting region.',
        correctResponse: 'What is the power zone?',
        distractors: [
          'What is the end zone?',
          'What is the strike zone?',
          'What is the comfort corridor?',
        ],
        explanation:
          'The power zone — close to the body, between mid-thigh and mid-chest — is where lifting strength is greatest and strain is lowest.',
      },
      {
        value: r2[3],
        clue: 'The NIOSH lifting equation starts from this recommended weight limit in pounds under ideal conditions.',
        correctResponse: 'What is 51 pounds?',
        distractors: ['What is 25 pounds?', 'What is 75 pounds?', 'What is 100 pounds?'],
        explanation:
          'The revised NIOSH lifting equation uses a 51-pound load constant, then discounts it for distance, height, twisting, and frequency.',
      },
      {
        value: r2[4],
        clue: 'Rapid Upper Limb Assessment, a posture-scoring tool for ergonomic risk, goes by this four-letter acronym.',
        correctResponse: 'What is RULA?',
        distractors: ['What is REBA?', 'What is ROSA?', 'What is RICE?'],
        explanation:
          'RULA scores neck, trunk, and upper-limb postures to flag jobs needing ergonomic redesign; REBA extends it to the whole body.',
      },
    ],
  },
  {
    name: 'CHEMICAL ROMANCE',
    clues: [
      {
        value: r2[0],
        clue: 'Every container of hazardous chemicals needs one of these — the sticker bearing the product identifier, signal word, and pictograms.',
        correctResponse: 'What is a label?',
        distractors: ['What is a receipt?', 'What is a warranty card?', 'What is a barcode?'],
        explanation:
          "OSHA's Hazard Communication standard, 1910.1200(f), requires labels with a product identifier, signal word, hazard statements, and pictograms.",
      },
      {
        value: r2[1],
        clue: 'Formerly called an MSDS, this standardized 16-section chemical document now goes by a three-letter name.',
        correctResponse: 'What is a safety data sheet?',
        distractors: [
          'What is a service delivery summary?',
          'What is a shipping declaration slip?',
          'What is a substance disposal schedule?',
        ],
        explanation:
          'The GHS-aligned safety data sheet (SDS) has 16 standardized sections, from identification through regulatory information.',
      },
      {
        value: r2[2],
        clue: 'GHS hazard pictograms sit inside this shape with a red border.',
        correctResponse: 'What is a diamond?',
        distractors: ['What is a circle?', 'What is a triangle?', 'What is an octagon?'],
        explanation:
          'GHS pictograms are black symbols on white inside a red-bordered diamond (a square set on its point).',
      },
      {
        value: r2[3],
        clue: 'The "flame over circle" pictogram warns of these chemicals that feed a fire with oxygen.',
        correctResponse: 'What are oxidizers?',
        distractors: [
          'What are corrosives?',
          'What are carcinogens?',
          'What are compressed gases?',
        ],
        explanation:
          'Oxidizers like pure oxygen, peroxides, and nitrates intensify fires; the flame-over-circle pictogram flags them.',
      },
      {
        value: r2[4],
        clue: 'The skull and crossbones marks severe acute toxicity; this punctuation-mark pictogram flags milder irritants and sensitizers.',
        correctResponse: 'What is the exclamation mark?',
        distractors: [
          'What is the question mark?',
          'What is the asterisk?',
          'What is the ampersand?',
        ],
        explanation:
          'The GHS exclamation mark covers skin and eye irritation, skin sensitization, and other less severe acute hazards.',
      },
    ],
  },
  {
    name: 'LADDER-DAY SAINTS',
    clues: [
      {
        value: r2[0],
        clue: 'Set a straight ladder using this ratio: one foot away from the wall for every this many feet of height to the support point.',
        correctResponse: 'What is four?',
        distractors: ['What is two?', 'What is six?', 'What is ten?'],
        explanation:
          'The 4-to-1 rule puts the ladder at about a 75-degree angle, the sweet spot between sliding out and tipping back.',
      },
      {
        value: r2[1],
        clue: 'An extension ladder used to reach a roof must extend this many feet above the landing surface.',
        correctResponse: 'What is 3 feet?',
        distractors: ['What is 1 foot?', 'What is 6 feet?', 'What is 10 feet?'],
        explanation:
          'OSHA requires side rails to extend at least 3 feet above the upper landing so climbers have a handhold while stepping off.',
      },
      {
        value: r2[2],
        clue: 'Never stand on this very highest part of a stepladder — it is not a step at all.',
        correctResponse: 'What is the top cap?',
        distractors: [
          'What is the spreader bar?',
          'What is the bottom rung?',
          'What is the rail shoe?',
        ],
        explanation:
          'The top cap and the step below it are off-limits for standing; the ladder loses all stability with your feet that high.',
      },
      {
        value: r2[3],
        clue: 'For work near energized lines, choose a ladder made of this non-conductive material instead of aluminum.',
        correctResponse: 'What is fiberglass?',
        distractors: ['What is stainless steel?', 'What is titanium?', 'What is carbon fiber?'],
        explanation:
          'Fiberglass (or dry wood) ladders are non-conductive; OSHA bans metal ladders where the climber or ladder could contact energized parts.',
      },
      {
        value: r2[4],
        clue: 'Self-supporting portable ladders must be able to hold at least this multiple of their maximum intended load.',
        correctResponse: 'What is four times?',
        distractors: ['What is one and a half times?', 'What is two times?', 'What is ten times?'],
        explanation:
          'OSHA 1926.1053(a)(1) requires self-supporting portable ladders to support at least 4 times the maximum intended load.',
      },
    ],
  },
  {
    name: 'SHOCKING DEVELOPMENTS',
    clues: [
      {
        value: r2[0],
        clue: 'Outlets near sinks and outdoors use this fast-tripping device — GFCI is short for it.',
        correctResponse: 'What is a ground-fault circuit interrupter?',
        distractors: [
          'What is a general fuse current indicator?',
          'What is a grounded filament charge inverter?',
          'What is a gradual fault correction inductor?',
        ],
        explanation:
          'A GFCI senses as little as 4-6 milliamps of leakage current and trips in a fraction of a second — fast enough to prevent electrocution.',
      },
      {
        value: r2[1],
        clue: 'The third prong on a plug provides this protective path that routes stray current safely to earth.',
        correctResponse: 'What is the ground?',
        distractors: ['What is the neutral?', 'What is the hot leg?', 'What is the antenna?'],
        explanation:
          'The equipment grounding conductor gives fault current a low-resistance path so breakers trip instead of energizing the tool casing.',
      },
      {
        value: r2[2],
        clue: 'This violent electrical explosion, reaching temperatures near 35,000 degrees Fahrenheit, gives NFPA 70E its famous "flash" boundary.',
        correctResponse: 'What is an arc flash?',
        distractors: [
          'What is a brownout?',
          'What is a static spark?',
          'What is a corona discharge?',
        ],
        explanation:
          'Arc flash temperatures can hit four times the surface of the sun; NFPA 70E requires boundaries and arc-rated clothing for exposed work.',
      },
      {
        value: r2[3],
        clue: 'Cranes, ladders, and dump trucks snag these elevated hazards — the leading cause of workplace electrocutions.',
        correctResponse: 'What are overhead power lines?',
        distractors: [
          'What are lightning rods?',
          'What are extension cords?',
          'What are buried cables?',
        ],
        explanation:
          'OSHA requires at least 10 feet of clearance from lines up to 50 kV; contact with overhead lines kills more workers than any other electrical hazard.',
      },
      {
        value: r2[4],
        clue: 'When justified live work proceeds on exposed parts at 50 volts or more, NFPA 70E calls for this signed document first.',
        correctResponse: 'What is an energized electrical work permit?',
        distractors: [
          'What is a hot work welding permit?',
          'What is a confined space permit?',
          'What is a building occupancy permit?',
        ],
        explanation:
          'NFPA 70E requires an energized electrical work permit documenting why de-energizing is infeasible and what protections apply.',
      },
    ],
  },
  {
    name: 'CONFINED TO QUARTERS',
    clues: [
      {
        value: r2[0],
        clue: 'Tanks, silos, and manholes — big enough to enter, limited ways in or out, not designed for continuous occupancy — share this two-word OSHA designation.',
        correctResponse: 'What is a confined space?',
        distractors: [
          'What is a clean room?',
          'What is a panic room?',
          'What is a storage locker?',
        ],
        explanation:
          'OSHA 1910.146 defines confined spaces and adds the "permit-required" label when serious hazards like bad air are present.',
      },
      {
        value: r2[1],
        clue: 'Before anyone enters a permit-required confined space, this signed document must be posted at the entrance.',
        correctResponse: 'What is an entry permit?',
        distractors: [
          'What is a parking pass?',
          'What is a liability waiver?',
          'What is a work visa?',
        ],
        explanation:
          'The entry permit under 1910.146(e) lists hazards, controls, testing results, and the personnel authorized for the entry.',
      },
      {
        value: r2[2],
        clue: 'Before and during entry, this instrumented check of the air — oxygen first, then flammables, then toxics — is mandatory.',
        correctResponse: 'What is atmospheric testing?',
        distractors: [
          'What is a smoke test?',
          'What is a sound check?',
          'What is barometric calibration?',
        ],
        explanation:
          '1910.146 requires testing in order — oxygen, combustible gases, then toxic contaminants — because most meters need adequate oxygen to read accurately.',
      },
      {
        value: r2[3],
        clue: 'Breathable air must contain at least 19.5 percent oxygen, but no more than this enriched upper limit.',
        correctResponse: 'What is 23.5 percent?',
        distractors: ['What is 21 percent?', 'What is 30 percent?', 'What is 50 percent?'],
        explanation:
          'Above 23.5 percent oxygen the atmosphere is oxygen-enriched, making materials ignite easily and burn ferociously.',
      },
      {
        value: r2[4],
        clue: 'Stationed outside the space, this person keeps count and contact with entrants — and must never go in to attempt a rescue.',
        correctResponse: 'Who is the attendant?',
        distractors: [
          'Who is the entry supervisor?',
          'Who is the safety director?',
          'Who is the shift janitor?',
        ],
        explanation:
          'Would-be rescuers account for the majority of confined space fatalities, so the attendant summons trained rescue instead of entering.',
      },
    ],
  },
  {
    name: 'FIRST AID & ABET',
    clues: [
      {
        value: r2[0],
        clue: 'For a conscious choking adult, deliver these abdominal thrusts named after the doctor who popularized them.',
        correctResponse: 'What is the Heimlich maneuver?',
        distractors: [
          'What is the Valsalva maneuver?',
          'What is the Epley maneuver?',
          'What is the Fosbury flop?',
        ],
        explanation:
          'Abdominal thrusts force air from the lungs to expel the obstruction; back blows are often alternated with them.',
      },
      {
        value: r2[1],
        clue: 'Hands-only CPR means pushing hard and fast in the center of the chest at 100 to 120 of these per minute.',
        correctResponse: 'What are compressions?',
        distractors: [
          'What are rescue breaths?',
          'What are pulse checks?',
          'What are defibrillations?',
        ],
        explanation:
          'The American Heart Association recommends 100-120 compressions per minute at least 2 inches deep for adult CPR.',
      },
      {
        value: r2[2],
        clue: 'This portable device reads the heart rhythm and talks you through delivering a shock — AED for short.',
        correctResponse: 'What is an automated external defibrillator?',
        distractors: [
          'What is an advanced emergency dispatcher?',
          'What is an automatic epinephrine dispenser?',
          'What is an arterial echo detector?',
        ],
        explanation:
          'AEDs analyze for shockable rhythms and will not deliver a shock unless one is detected, making them safe for lay rescuers.',
      },
      {
        value: r2[3],
        clue: 'After a chemical splash to the eyes, flush at the eyewash station for at least this many minutes.',
        correctResponse: 'What is 15 minutes?',
        distractors: ['What is 30 seconds?', 'What is 2 minutes?', 'What is 60 minutes?'],
        explanation:
          'ANSI Z358.1 calls for a full 15-minute flush, and OSHA 1910.151 requires suitable eyewash facilities where corrosives are used.',
      },
      {
        value: r2[4],
        clue: 'Once considered a last resort, this windlass-tightened limb device is now first-line care for severe arterial bleeding.',
        correctResponse: 'What is a tourniquet?',
        distractors: [
          'What is a butterfly bandage?',
          'What is a cold compress?',
          'What is a finger splint?',
        ],
        explanation:
          'Stop the Bleed training teaches early tourniquet use high and tight on the limb; modern data shows limb loss from proper use is rare.',
      },
    ],
  },
];

// ===========================================================================
// AIRPORT / AVIATION GROUND-SAFETY BOARD (selected via ?board=airport)
// Same shapes and tiers as the OSHA board; themed to ramp, fueling, de-icing,
// jet-bridge, wildlife, and the OSHA + FAA rules that govern apron operations.
// ===========================================================================

export const AIRPORT_ROUND_ONE_CATEGORIES: PerilCategory[] = [
  {
    name: 'FOD FIGHTERS',
    clues: [
      {
        value: r1[0],
        clue: 'On the ramp, this three-letter acronym for loose debris that can damage engines and tires is the enemy of every FOD walk.',
        correctResponse: 'What is FOD?',
        distractors: ['What is TSA?', 'What is GPU?', 'What is ILS?'],
        explanation:
          'FOD — foreign object debris — covers any loose item on the apron that can be ingested by an engine or cut a tire; it also means the damage that results.',
      },
      {
        value: r1[1],
        clue: 'The cheapest and most effective FOD control is this slow, eyes-down sweep of the gate area crews do before an aircraft arrives.',
        correctResponse: 'What is a FOD walk?',
        distractors: [
          'What is a victory lap?',
          'What is a runway incursion?',
          'What is a wing walk?',
        ],
        explanation:
          'A FOD walk is a line abreast visual sweep of the ramp and gate to pick up debris before it can be ingested or kicked into rotating equipment.',
      },
      {
        value: r1[2],
        clue: 'A single bolt sucked into a turbofan can shatter these spinning airfoils at the front of the engine.',
        correctResponse: 'What are fan blades?',
        distractors: ['What are flaps?', 'What are winglets?', 'What are spoilers?'],
        explanation:
          'Ingested FOD most often strikes the first-stage fan blades, and a single damaged blade can require a multimillion-dollar engine teardown.',
      },
      {
        value: r1[3],
        clue: 'Before connecting the tug, the ramp crew positions these rubber blocks against the main-gear tires so the aircraft cannot roll.',
        correctResponse: 'What are wheel chocks?',
        distractors: ['What are tie-downs?', 'What are bollards?', 'What are speed bumps?'],
        explanation:
          'Chocks are placed fore and aft of the main gear as soon as the aircraft stops; an unchocked aircraft on a sloped apron can creep into people and equipment.',
      },
      {
        value: r1[4],
        clue: 'This federal agency, not OSHA, writes Advisory Circular 150/5210-24 on airport FOD management programs.',
        correctResponse: 'What is the FAA?',
        distractors: ['What is the NTSB?', 'What is the EPA?', 'What is the FCC?'],
        explanation:
          'The Federal Aviation Administration publishes FOD-management guidance for airports; OSHA covers the worker-safety side of the same ramp.',
      },
    ],
  },
  {
    name: 'RAMP RULES',
    clues: [
      {
        value: r1[0],
        clue: 'On the apron this high-visibility garment, usually yellow or orange, makes the ramp agent visible to drivers and flight crews.',
        correctResponse: 'What is a safety vest?',
        distractors: ['What is a flight jacket?', 'What is a rain poncho?', 'What is a lab coat?'],
        explanation:
          'High-visibility apparel meeting ANSI/ISEA 107 is standard ramp PPE so workers stand out against aircraft, vehicles, and night operations.',
      },
      {
        value: r1[1],
        clue: 'Standing at the nose with illuminated wands, this person uses standard hand signals to guide an aircraft to its parking spot.',
        correctResponse: 'What is a marshaller?',
        distractors: ['What is a dispatcher?', 'What is a gate agent?', 'What is a loadmaster?'],
        explanation:
          'The marshaller (or signaler) directs the aircraft into the gate with standardized signals; the pilots follow the marshaller, not the other way around.',
      },
      {
        value: r1[2],
        clue: 'Moving an aircraft backward off the gate with a tug and tow bar is this two-word ramp maneuver.',
        correctResponse: 'What is a pushback?',
        distractors: ['What is a touch-and-go?', 'What is a flare?', 'What is a go-around?'],
        explanation:
          'During pushback a tug pushes the aircraft back from the gate; wing walkers and a clear, FOD-free path are essential to avoid struck-by injuries.',
      },
      {
        value: r1[3],
        clue: 'Walking near a taxiing aircraft, never pass within the danger zone in front of this running powerplant that can ingest a person.',
        correctResponse: 'What is the engine intake?',
        distractors: [
          'What is the cargo hold?',
          'What is the cockpit window?',
          'What is the tail cone?',
        ],
        explanation:
          'The intake ingestion hazard zone extends well in front of a running engine; crews must stay clear of both the intake suction and the exhaust blast.',
      },
      {
        value: r1[4],
        clue: 'Ramp noise from jet engines and APUs regularly exceeds OSHA’s 90-dBA limit, so crews must wear this kind of PPE.',
        correctResponse: 'What is hearing protection?',
        distractors: ['What is a respirator?', 'What is a face shield?', 'What is a knee pad?'],
        explanation:
          'Apron noise commonly tops 120 dBA near engines; OSHA 1910.95 requires hearing protection and a conservation program at sustained high exposures.',
      },
    ],
  },
  {
    name: 'FUEL FOR THOUGHT',
    clues: [
      {
        value: r1[0],
        clue: 'The kerosene-based jet fuel used by most commercial turbine aircraft carries this letter-and-letter designation.',
        correctResponse: 'What is Jet A?',
        distractors: ['What is 100LL?', 'What is diesel?', 'What is propane?'],
        explanation:
          'Jet A (and Jet A-1) is the standard commercial turbine fuel; 100LL avgas is for piston aircraft and is far more volatile.',
      },
      {
        value: r1[1],
        clue: 'Before fuel flows, the truck and aircraft are connected by this conductive wire to equalize charge and prevent a static spark.',
        correctResponse: 'What is a bonding cable?',
        distractors: ['What is a tow bar?', 'What is a headset cord?', 'What is a tie-down strap?'],
        explanation:
          'Bonding equalizes electrical potential between the fueler and aircraft so a static discharge cannot ignite fuel vapor during transfer.',
      },
      {
        value: r1[2],
        clue: 'During fueling no one may smoke or create a spark within this many feet of the operation — the classic 50-foot rule.',
        correctResponse: 'What is 50 feet?',
        distractors: ['What is 5 feet?', 'What is 500 feet?', 'What is 3 feet?'],
        explanation:
          'NFPA 407 and airport rules keep ignition sources at least 50 feet from fueling, venting, and spill areas around the aircraft.',
      },
      {
        value: r1[3],
        clue: 'A fuel spill larger than a set size means stop fueling and call these emergency responders stationed at the airport, known as ARFF.',
        correctResponse: 'What is aircraft rescue and firefighting?',
        distractors: [
          'What is air route flight following?',
          'What is automated radar flight feed?',
          'What is the airport ramp food fair?',
        ],
        explanation:
          'ARFF — aircraft rescue and firefighting — responds to fuel spills and fires; large spills require fueling to stop and ARFF to be notified.',
      },
      {
        value: r1[4],
        clue: 'This NFPA standard, number 407, specifically governs the safe practice of aircraft fuel servicing.',
        correctResponse: 'What is NFPA 407?',
        distractors: ['What is NFPA 70E?', 'What is NFPA 13?', 'What is NFPA 101?'],
        explanation:
          'NFPA 407, Standard for Aircraft Fuel Servicing, sets bonding, spill, and ignition-control rules; OSHA 1910.106 covers flammable liquids generally.',
      },
    ],
  },
  {
    name: 'WINGED THINGS',
    clues: [
      {
        value: r1[0],
        clue: 'Birds and deer near the runway create this two-word hazard that can bring down an aircraft, like the famous Hudson River landing.',
        correctResponse: 'What is wildlife strike?',
        distractors: [
          'What is wind shear?',
          'What is wake turbulence?',
          'What is a runway excursion?',
        ],
        explanation:
          'Wildlife (bird) strikes are a serious aviation hazard; the 2009 US Airways Hudson landing followed a double engine bird strike.',
      },
      {
        value: r1[1],
        clue: 'Airports disperse problem birds using these loud blank-cartridge devices fired into the air.',
        correctResponse: 'What are pyrotechnics?',
        distractors: ['What are flare guns?', 'What are sirens?', 'What are drones?'],
        explanation:
          'Wildlife-management crews use screamers and bangers (pyrotechnics), plus habitat control and trained dogs, to keep birds off the airfield.',
      },
      {
        value: r1[2],
        clue: 'Tall grass and standing water near the runway attract wildlife, so airports practice this kind of management of the surrounding land.',
        correctResponse: 'What is habitat management?',
        distractors: [
          'What is asset management?',
          'What is crew management?',
          'What is fuel management?',
        ],
        explanation:
          'Removing food, water, and cover through habitat management is the most durable way to reduce wildlife strikes on and around the airfield.',
      },
      {
        value: r1[3],
        clue: 'A bird ingested into a running engine on the ramp is a vivid example of this same debris category, abbreviated FOD.',
        correctResponse: 'What is foreign object debris?',
        distractors: [
          'What is fuel oxidation damage?',
          'What is flight operations data?',
          'What is final on-deck delivery?',
        ],
        explanation:
          'Organic FOD — birds and other animals — damages engines just like a bolt or bag would; ramp crews report wildlife near gates immediately.',
      },
      {
        value: r1[4],
        clue: 'This federal wildlife-services agency partners with the FAA to manage hazardous animals at U.S. airports — part of the USDA.',
        correctResponse: 'What is the Department of Agriculture?',
        distractors: [
          'What is the Department of Defense?',
          'What is the Department of the Interior?',
          'What is the Department of Transportation?',
        ],
        explanation:
          'USDA Wildlife Services provides biologists and strike-mitigation programs at airports under agreements with the FAA and airport operators.',
      },
    ],
  },
  {
    name: 'GROUND SUPPORT',
    clues: [
      {
        value: r1[0],
        clue: 'The catch-all three-letter term for tugs, belt loaders, GPUs, and the rest of the rolling stock on the ramp is this.',
        correctResponse: 'What is GSE?',
        distractors: ['What is APU?', 'What is GPS?', 'What is ELT?'],
        explanation:
          'GSE — ground support equipment — is the family of vehicles and gear used to service aircraft between flights.',
      },
      {
        value: r1[1],
        clue: 'Parked at the nose, this cart supplies 115-volt 400-hertz electricity to the aircraft so its engines can stay off, abbreviated GPU.',
        correctResponse: 'What is a ground power unit?',
        distractors: [
          'What is a general purpose undercarriage?',
          'What is a gate processing unit?',
          'What is a glycol pump unit?',
        ],
        explanation:
          'A ground power unit feeds the aircraft 400-Hz power at the gate; worn GPU cables are a shock and arc-flash hazard in wet weather.',
      },
      {
        value: r1[2],
        clue: 'Climbing on and off a baggage tug or belt loader, keep this numbered rule of contact to avoid a fall.',
        correctResponse: 'What is three points of contact?',
        distractors: [
          'What is the two-minute rule?',
          'What is the buddy system?',
          'What is the four-eyes rule?',
        ],
        explanation:
          'Maintaining three points of contact when mounting and dismounting GSE prevents the same-level and step-down falls common on the ramp.',
      },
      {
        value: r1[3],
        clue: 'Before a driver leaves any GSE on the apron, they must set this control so it cannot roll into people or aircraft.',
        correctResponse: 'What is the parking brake?',
        distractors: [
          'What is the windshield wiper?',
          'What is the turn signal?',
          'What is the radio?',
        ],
        explanation:
          'Unattended GSE left out of gear or without the brake set causes runaway struck-by incidents; secure and chock equipment before walking away.',
      },
      {
        value: r1[4],
        clue: 'The same OSHA standard that governs forklifts, 1910.178, also covers these motorized ramp tractors that tow carts and aircraft.',
        correctResponse: 'What are powered industrial trucks?',
        distractors: [
          'What are passenger boarding bridges?',
          'What are pneumatic torque wrenches?',
          'What are portable inspection terminals?',
        ],
        explanation:
          'Tugs and tractors are powered industrial trucks under OSHA 1910.178, requiring operator training, daily checks, and safe-operation rules.',
      },
    ],
  },
  {
    name: 'BRIDGE THE GAP',
    clues: [
      {
        value: r1[0],
        clue: 'Passengers board through this movable enclosed tunnel that connects the terminal gate to the aircraft door.',
        correctResponse: 'What is a jet bridge?',
        distractors: ['What is a catwalk?', 'What is a gangway?', 'What is a skybridge?'],
        explanation:
          'The jet bridge (passenger boarding bridge) extends from the gate to the aircraft; mis-driving it into the fuselage is a common, costly ramp incident.',
      },
      {
        value: r1[1],
        clue: 'A pinch point between the moving bridge cab and the fuselage can crush a hand, so operators keep clear of these danger areas.',
        correctResponse: 'What are pinch points?',
        distractors: ['What are blind spots?', 'What are hot zones?', 'What are choke points?'],
        explanation:
          'Moving the bridge creates crush and pinch hazards between the cab, canopy, and aircraft skin; only trained operators should drive it.',
      },
      {
        value: r1[2],
        clue: 'When the bridge is away from the aircraft, this safety barrier must be closed across the cab opening to prevent a fall.',
        correctResponse: 'What is the safety gate?',
        distractors: [
          'What is the jetway awning?',
          'What is the boarding ramp?',
          'What is the service door?',
        ],
        explanation:
          'An open bridge cab is a fall-to-apron hazard; the cab gate or barrier must be secured whenever the bridge is not docked to an aircraft.',
      },
      {
        value: r1[3],
        clue: 'Opening a heavy aircraft cabin door against air-pressure or wind, crews guard against this kind of strain to the back and shoulders.',
        correctResponse: 'What is a musculoskeletal injury?',
        distractors: ['What is a chemical burn?', 'What is frostbite?', 'What is hearing loss?'],
        explanation:
          'Door operation and baggage handling drive ramp musculoskeletal disorders; proper technique and team lifts reduce sprains and strains.',
      },
      {
        value: r1[4],
        clue: 'A jet bridge that is auto-leveling rides up and down on these to follow the aircraft as it lightens during boarding.',
        correctResponse: 'What are wheels?',
        distractors: ['What are pulleys?', 'What are pontoons?', 'What are rails?'],
        explanation:
          'The bridge drive wheels and auto-leveler keep the cab matched to the door sill as the aircraft rises with each departing passenger and bag.',
      },
    ],
  },
];

export const AIRPORT_ROUND_TWO_CATEGORIES: PerilCategory[] = [
  {
    name: 'ICE ICE BABY',
    clues: [
      {
        value: r2[0],
        clue: 'Removing snow and frost already on the wings before takeoff is this winter-ops process.',
        correctResponse: 'What is de-icing?',
        distractors: ['What is defrosting?', 'What is degreasing?', 'What is dewatering?'],
        explanation:
          'De-icing removes existing contamination from aircraft surfaces; clean wings are essential because frost destroys lift.',
      },
      {
        value: r2[1],
        clue: 'Sprayed on after de-icing, this fluid keeps new snow from sticking and is identified as Type IV.',
        correctResponse: 'What is anti-icing fluid?',
        distractors: [
          'What is hydraulic fluid?',
          'What is engine oil?',
          'What is windshield washer?',
        ],
        explanation:
          'Anti-icing (Type II/IV) fluid is a thickened glycol that clings to the wing and protects it during taxi and the takeoff roll.',
      },
      {
        value: r2[2],
        clue: 'The clock that starts when anti-ice fluid is applied and counts down its protection is called this two-word time.',
        correctResponse: 'What is holdover time?',
        distractors: ['What is block time?', 'What is turnaround time?', 'What is dwell time?'],
        explanation:
          'Holdover time estimates how long anti-ice fluid keeps the wing clean for the conditions; exceed it and the aircraft must be treated again.',
      },
      {
        value: r2[3],
        clue: 'De-icing fluid is mostly this sweet-smelling but toxic alcohol that must be captured, not washed to the storm drain.',
        correctResponse: 'What is glycol?',
        distractors: ['What is acetone?', 'What is ammonia?', 'What is benzene?'],
        explanation:
          'Propylene or ethylene glycol is the active de-icer; spent fluid is an environmental hazard and is collected for treatment or recycling.',
      },
      {
        value: r2[4],
        clue: 'Spraying from an elevated bucket, the de-ice operator wears a harness tied to an anchor to protect against this.',
        correctResponse: 'What is a fall?',
        distractors: [
          'What is a chemical splash?',
          'What is an electric shock?',
          'What is a noise exposure?',
        ],
        explanation:
          'De-ice rigs put workers at height in cold, slick conditions; OSHA fall protection plus chemical-splash PPE are both required.',
      },
    ],
  },
  {
    name: 'BAGGAGE CLAIM',
    clues: [
      {
        value: r2[0],
        clue: 'The inclined conveyor that carries bags up to the cargo hold door is this piece of GSE.',
        correctResponse: 'What is a belt loader?',
        distractors: ['What is a forklift?', 'What is a cherry picker?', 'What is a pallet jack?'],
        explanation:
          'Belt loaders feed bags into the hold; their exposed belt-and-pulley drive is a serious nip-point hazard if the guard is missing.',
      },
      {
        value: r2[1],
        clue: 'Repeatedly bending and twisting to throw 50-pound bags causes this back-and-joint injury category, abbreviated MSD.',
        correctResponse: 'What is a musculoskeletal disorder?',
        distractors: [
          'What is a metabolic systemic disease?',
          'What is a mandatory safety drill?',
          'What is a minor skin defect?',
        ],
        explanation:
          'Baggage handling is a top source of ramp MSDs; the power zone, team lifts, and rotating tasks all cut the strain.',
      },
      {
        value: r2[2],
        clue: 'To stay inside the safe power zone, keep the bag close and lift between knee and this upper body landmark.',
        correctResponse: 'What are the shoulders?',
        distractors: ['What are the knees?', 'What are the ankles?', 'What is the head?'],
        explanation:
          'The power zone — between mid-thigh and the shoulders, close to the body — is where lifting is strongest and lumbar strain is lowest.',
      },
      {
        value: r2[3],
        clue: 'Wheeled metal boxes that hold luggage in the belly of a wide-body, these go by the three-letter name ULD.',
        correctResponse: 'What are unit load devices?',
        distractors: [
          'What are universal lifting docks?',
          'What are upper level decks?',
          'What are unloading dollies?',
        ],
        explanation:
          'Unit load devices (containers and pallets) speed loading but can shift or topple; locks and proper restraint prevent crush injuries.',
      },
      {
        value: r2[4],
        clue: 'Crushed or pinched hands at the belt and door are why ramp crews wear this hand PPE rated under ANSI/ISEA 105.',
        correctResponse: 'What are gloves?',
        distractors: ['What are goggles?', 'What are gaiters?', 'What are gauntlets only?'],
        explanation:
          'Cut- and impact-resistant gloves protect against pinch points, sharp bag hardware, and cold; ANSI/ISEA 105 rates their cut resistance.',
      },
    ],
  },
  {
    name: 'CLEARED FOR PPE',
    clues: [
      {
        value: r2[0],
        clue: 'Beyond a vest, ramp crews protect their hearing against engine noise with foam plugs or these over-the-ear devices.',
        correctResponse: 'What are earmuffs?',
        distractors: ['What are headsets only?', 'What are earrings?', 'What are hairnets?'],
        explanation:
          'Earmuffs and plugs are rated by Noise Reduction Rating; on the ramp the headset that carries communications also helps attenuate noise.',
      },
      {
        value: r2[1],
        clue: 'The 8-hour permissible noise exposure limit set by OSHA 1910.95 is this dBA figure.',
        correctResponse: 'What is 90 decibels?',
        distractors: ['What is 70 decibels?', 'What is 110 decibels?', 'What is 140 decibels?'],
        explanation:
          'OSHA’s noise PEL is 90 dBA as an 8-hour average, with a hearing-conservation program required at the 85-dBA action level.',
      },
      {
        value: r2[2],
        clue: 'Steel- or composite-toe versions of these protect against rolling tug wheels and dropped cargo on the ramp.',
        correctResponse: 'What are safety boots?',
        distractors: ['What are sandals?', 'What are slippers?', 'What are cleats?'],
        explanation:
          'OSHA 1910.136 requires protective footwear where foot injuries from impact, compression, or rolling equipment are likely.',
      },
      {
        value: r2[3],
        clue: 'For night and low-visibility ramp work, high-visibility apparel must meet this ANSI/ISEA standard, number 107.',
        correctResponse: 'What is ANSI/ISEA 107?',
        distractors: ['What is ANSI Z87.1?', 'What is NFPA 70E?', 'What is ISO 9001?'],
        explanation:
          'ANSI/ISEA 107 classifies high-visibility safety apparel; Class 2 or 3 garments are typical for the apron’s vehicle and aircraft traffic.',
      },
      {
        value: r2[4],
        clue: 'Under OSHA 1910.132, this party must provide and pay for most required ramp PPE.',
        correctResponse: 'Who is the employer?',
        distractors: [
          'Who is the passenger?',
          'Who is the airport authority?',
          'Who is the union?',
        ],
        explanation:
          'OSHA 1910.132(h) requires employers to provide most required PPE at no cost to employees, on the ramp as anywhere else.',
      },
    ],
  },
  {
    name: 'WEATHER OR NOT',
    clues: [
      {
        value: r2[0],
        clue: 'When this electrical-storm hazard is detected nearby, most ramps suspend operations and crews shelter indoors.',
        correctResponse: 'What is lightning?',
        distractors: ['What is fog?', 'What is drizzle?', 'What is haze?'],
        explanation:
          'Lightning within a set distance triggers a ramp-closure (red alert); fuelers and open-apron crews are especially exposed and must take shelter.',
      },
      {
        value: r2[1],
        clue: 'Working a summer ramp on black asphalt near jet exhaust, crews guard against this rising-core-temperature illness.',
        correctResponse: 'What is heat stress?',
        distractors: ['What is hypothermia?', 'What is altitude sickness?', 'What is the bends?'],
        explanation:
          'Radiant heat from pavement and exhaust drives heat illness; water, rest, shade, and acclimatization are the core controls.',
      },
      {
        value: r2[2],
        clue: 'In winter ramp ops, exposed skin and slick surfaces bring the twin risks of frostbite and this whole-body cold emergency.',
        correctResponse: 'What is hypothermia?',
        distractors: ['What is heat stroke?', 'What is dehydration?', 'What is sunburn?'],
        explanation:
          'Cold de-ice work risks frostbite and hypothermia; insulated, water-resistant PPE and rotation limits keep crews safe.',
      },
      {
        value: r2[3],
        clue: 'High crosswinds make this connected jet-bridge structure a wind-load hazard that may have to be retracted.',
        correctResponse: 'What is the jet bridge?',
        distractors: [
          'What is the windsock?',
          'What is the control tower?',
          'What is the fuel farm?',
        ],
        explanation:
          'Strong winds load the bridge and parked GSE; operations secure or retract equipment and may halt the ramp in severe gusts.',
      },
      {
        value: r2[4],
        clue: 'The hot blast of air and gases behind a running engine, which can hurl loose gear and people, is called this.',
        correctResponse: 'What is jet blast?',
        distractors: ['What is wake turbulence?', 'What is wind shear?', 'What is a microburst?'],
        explanation:
          'Jet blast behind a powered-up engine can exceed hurricane force at break-away thrust; the danger area must be kept clear of crew and equipment.',
      },
    ],
  },
  {
    name: 'TOWER TALK',
    clues: [
      {
        value: r2[0],
        clue: 'When a vehicle or aircraft strays onto a runway without clearance, it causes this dangerous two-word event.',
        correctResponse: 'What is a runway incursion?',
        distractors: [
          'What is a ground stop?',
          'What is a missed approach?',
          'What is a holding pattern?',
        ],
        explanation:
          'Runway incursions are a top aviation-safety concern; vehicle drivers airside need training, radios, and clearances to cross movement areas.',
      },
      {
        value: r2[1],
        clue: 'Drivers on the airfield use this pilots’ alphabet — Alpha, Bravo, Charlie — to read out taxiway and gate letters clearly.',
        correctResponse: 'What is the phonetic alphabet?',
        distractors: ['What is Morse code?', 'What is semaphore?', 'What is the Greek alphabet?'],
        explanation:
          'The ICAO phonetic alphabet prevents misheard letters over the radio when reading taxiways, gates, and aircraft registrations.',
      },
      {
        value: r2[2],
        clue: 'The marked paths aircraft use to move between the runway and the gates are these.',
        correctResponse: 'What are taxiways?',
        distractors: ['What are jetways?', 'What are catwalks?', 'What are fairways?'],
        explanation:
          'Taxiways connect runways to aprons; vehicle traffic on or near them is tightly controlled to prevent collisions and incursions.',
      },
      {
        value: r2[3],
        clue: 'A driver airside must hold this airport-issued credential proving training to operate in movement and non-movement areas.',
        correctResponse: 'What is an airside driving permit?',
        distractors: [
          'What is a TSA boarding pass?',
          'What is a pilot certificate?',
          'What is a passport?',
        ],
        explanation:
          'Airside or movement-area driving permits certify that a driver knows airfield rules, signage, and radio procedures.',
      },
      {
        value: r2[4],
        clue: 'Painted and lit, these red-and-white markings warn drivers and pilots not to cross onto an active runway without clearance.',
        correctResponse: 'What are hold-short markings?',
        distractors: [
          'What are crosswalk stripes?',
          'What are parking lines?',
          'What are centerline lights?',
        ],
        explanation:
          'Runway hold-short markings define where vehicles and aircraft must stop until cleared, the key defense against runway incursions.',
      },
    ],
  },
  {
    name: 'SPILL THE BEANS',
    clues: [
      {
        value: r2[0],
        clue: 'Every chemical drum on the ramp — glycol, hydraulic fluid, lav fluid — needs one of these GHS stickers with pictograms.',
        correctResponse: 'What is a label?',
        distractors: ['What is a manifest?', 'What is a placard only?', 'What is a barcode?'],
        explanation:
          'OSHA Hazard Communication (1910.1200) requires GHS labels with product identifier, signal word, hazard statements, and pictograms.',
      },
      {
        value: r2[1],
        clue: 'The 16-section document detailing a ramp chemical’s hazards, formerly the MSDS, now goes by this three-letter name.',
        correctResponse: 'What is a safety data sheet?',
        distractors: [
          'What is a shipping declaration slip?',
          'What is a service dispatch sheet?',
          'What is a spill diversion screen?',
        ],
        explanation:
          'The SDS gives 16 standardized sections of hazard, handling, and first-aid information; it must be accessible to ramp workers.',
      },
      {
        value: r2[2],
        clue: 'A fuel or glycol spill on the apron must be contained with absorbents and kept out of this drainage system to the environment.',
        correctResponse: 'What is the storm drain?',
        distractors: [
          'What is the jet bridge?',
          'What is the baggage chute?',
          'What is the air duct?',
        ],
        explanation:
          'Spills heading to storm drains become Clean Water Act violations; ramps stage spill kits and drain covers to contain releases.',
      },
      {
        value: r2[3],
        clue: 'The toilet-servicing truck handles this hazardous waste, requiring gloves and eye protection against splash exposure.',
        correctResponse: 'What is lavatory waste?',
        distractors: [
          'What is potable water?',
          'What is hydraulic fluid?',
          'What is cargo coolant?',
        ],
        explanation:
          'Lav (blue water) servicing is a biological and splash hazard; gloves, eye protection, and strict separation from potable-water gear are required.',
      },
      {
        value: r2[4],
        clue: 'After a chemical splash to the eyes from glycol or lav fluid, flush at the eyewash station for at least this many minutes.',
        correctResponse: 'What is 15 minutes?',
        distractors: ['What is 1 minute?', 'What is 3 minutes?', 'What is 45 minutes?'],
        explanation:
          'ANSI Z358.1 calls for a 15-minute flush, and OSHA 1910.151 requires suitable eyewash where corrosives or irritants are handled.',
      },
    ],
  },
];

export const AIRPORT_FINAL_PERIL: FinalPeril = {
  category: 'AVIATION RULEMAKERS',
  clue: {
    value: 0,
    clue: 'This federal agency created by the Federal Aviation Act and now part of the Department of Transportation writes the rules that govern airport ramp and airfield operations.',
    correctResponse: 'What is the Federal Aviation Administration?',
    distractors: [
      'What is the Transportation Security Administration?',
      'What is the National Transportation Safety Board?',
      'What is the Occupational Safety and Health Administration?',
    ],
    explanation:
      'The FAA regulates airfield and airport operations; the NTSB investigates accidents, the TSA handles security, and OSHA covers worker safety on the same ramp.',
  },
};

export const FINAL_PERIL: FinalPeril = {
  category: 'REGULATION NATION',
  clue: {
    value: 0,
    clue: 'Signed by President Nixon in 1970, this law\'s Section 5(a)(1) — the "General Duty Clause" — requires employers to furnish work free from recognized hazards.',
    correctResponse: 'What is the Occupational Safety and Health Act?',
    distractors: [
      'What is the Fair Labor Standards Act?',
      'What is the National Labor Relations Act?',
      'What is the Federal Mine Safety and Health Act?',
    ],
    explanation:
      'The OSH Act of 1970 created OSHA and NIOSH; its General Duty Clause covers recognized hazards no specific standard addresses.',
  },
};

/** All 12 board categories in play order (round 1 then round 2). */
export const ALL_CATEGORIES: PerilCategory[] = [...ROUND_ONE_CATEGORIES, ...ROUND_TWO_CATEGORIES];

export interface ClueOptions {
  /** The four shuffled response options. */
  options: string[];
  /** Index of the correct response within {@link options}. */
  correctIndex: number;
}

/**
 * Builds the four shuffled multiple-choice options for a clue.
 * Pass a deterministic rng (returning [0,1)) for reproducible shuffles.
 */
export function buildClueOptions(clue: PerilClue, rng: () => number = Math.random): ClueOptions {
  const options = [clue.correctResponse, ...clue.distractors];
  // Fisher-Yates shuffle.
  for (let i = options.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [options[i], options[j]] = [options[j], options[i]];
  }
  return { options, correctIndex: options.indexOf(clue.correctResponse) };
}

// ===========================================================================
// Board registry — lets the engine and scenes swap between the OSHA and
// aviation boards based on the `?board=` route query parameter.
// ===========================================================================

/** Selectable board identifiers (the `?board=` route query value). */
export type PerilBoardId = 'osha' | 'airport';

/** A complete PERIL! board: two rounds of categories plus the Final clue. */
export interface PerilBoard {
  id: PerilBoardId;
  /** Human-readable board name for menus and analytics. */
  label: string;
  roundOne: PerilCategory[];
  roundTwo: PerilCategory[];
  final: FinalPeril;
}

/** The original general workplace-safety / OSHA board (the default). */
export const OSHA_BOARD: PerilBoard = {
  id: 'osha',
  label: 'Workplace Safety',
  roundOne: ROUND_ONE_CATEGORIES,
  roundTwo: ROUND_TWO_CATEGORIES,
  final: FINAL_PERIL,
};

/** The aviation ground-safety board (selected via `?board=airport`). */
export const AIRPORT_BOARD: PerilBoard = {
  id: 'airport',
  label: 'Aviation Ground Safety',
  roundOne: AIRPORT_ROUND_ONE_CATEGORIES,
  roundTwo: AIRPORT_ROUND_TWO_CATEGORIES,
  final: AIRPORT_FINAL_PERIL,
};

/** All selectable boards, keyed by id. */
export const PERIL_BOARDS: Record<PerilBoardId, PerilBoard> = {
  osha: OSHA_BOARD,
  airport: AIRPORT_BOARD,
};

/** The board used when no (or an unknown) `?board=` value is supplied. */
export const DEFAULT_BOARD: PerilBoard = OSHA_BOARD;

/**
 * Resolve a board from a raw `?board=` query value. Unknown / missing values
 * fall back to the default OSHA board so existing routes keep working.
 */
export function resolveBoard(boardId: string | null | undefined): PerilBoard {
  if (boardId === 'airport') return AIRPORT_BOARD;
  return DEFAULT_BOARD;
}
