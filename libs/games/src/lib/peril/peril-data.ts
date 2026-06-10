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
