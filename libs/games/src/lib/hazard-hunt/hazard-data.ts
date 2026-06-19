/**
 * Hazard Hunter — level & hazard definitions.
 * Pure data: NO imports of three/phaser/DOM so Jest (jsdom) can test it.
 */

/** World-builder archetype used by world.ts to construct the prop. */
export type HazardKind =
  | 'blocked-exit'
  | 'wet-floor'
  | 'unstable-stack'
  | 'forklift-raised'
  | 'blocked-extinguisher'
  | 'exposed-wiring'
  | 'unguarded-conveyor'
  | 'unlabeled-drum'
  | 'damaged-ladder'
  | 'missing-ppe'
  | 'broken-light'
  | 'grinder-no-guard'
  | 'no-eye-protection'
  | 'compressed-air'
  | 'flammables-out'
  | 'daisy-chain'
  | 'missing-loto'
  | 'unguarded-belt'
  | 'drill-press'
  | 'blocked-panel'
  | 'oily-rags'
  | 'unsecured-cylinder';

export interface HazardDef {
  /** Unique across ALL levels. */
  id: string;
  /** Short display name shown in reveals and reports. */
  name: string;
  /** Archetype for procedural prop construction. */
  kind: HazardKind;
  /** [x, y, z] placement in metres. */
  position: [number, number, number];
  /** Optional yaw in radians. */
  rotationY?: number;
  /** Vivid "what could have happened" narrative. */
  incident: string;
  /** e.g. "29 CFR 1910.37" — real OSHA citation. */
  oshaRef: string;
  /** Official-style regulation title. */
  oshaTitle: string;
}

export interface LevelDef {
  id: number;
  /** e.g. "WAREHOUSE" */
  name: string;
  /** HUD banner, e.g. "SHIFT 1 — WAREHOUSE" */
  shiftLabel: string;
  /** Inspection actions granted for the shift. */
  inspections: number;
  /** Interior half-extents of the room, metres. */
  roomHalfWidth: number;
  roomHalfDepth: number;
  /** Player spawn. */
  spawn: [number, number, number];
  hazards: HazardDef[];
}

const WAREHOUSE_HAZARDS: HazardDef[] = [
  {
    id: 'wh-blocked-exit',
    name: 'Blocked Emergency Exit',
    kind: 'blocked-exit',
    position: [-13.1, 0, 6],
    rotationY: Math.PI / 2,
    incident:
      'A pallet jack fire fills the aisle with smoke. Eleven workers reach the west exit and find it walled off by stacked cartons. In the crush to turn back, two pickers are trampled and one suffers smoke inhalation — 4 weeks lost time and an evacuation that took 9 minutes instead of 90 seconds.',
    oshaRef: '29 CFR 1910.37',
    oshaTitle: 'Maintenance, safeguards, and operational features for exit routes',
  },
  {
    id: 'wh-wet-floor',
    name: 'Wet Floor — No Signage',
    kind: 'wet-floor',
    position: [3, 0, -0.5],
    incident:
      'A picker rounds the rack corner at a jog, hits the unmarked slick, and goes down hard on the concrete. Fractured wrist and a concussion — 6 weeks lost time, and the order she was carrying lands on a coworker’s foot.',
    oshaRef: '29 CFR 1910.22',
    oshaTitle: 'Walking-working surfaces — general requirements',
  },
  {
    id: 'wh-unstable-stack',
    name: 'Unstable, Overhung Box Stacking',
    kind: 'unstable-stack',
    position: [-6, 0, 1.4],
    incident:
      'The overhung tier finally lets go as a forklift rumbles past. Two hundred pounds of stock avalanches onto the picker working the lower shelf — crush injuries to the shoulder and three cracked ribs. 3 weeks lost time and a destroyed pallet of product.',
    oshaRef: '29 CFR 1910.176(b)',
    oshaTitle: 'Handling materials — secure storage',
  },
  {
    id: 'wh-forklift-forks',
    name: 'Unattended Forklift, Forks Raised',
    kind: 'forklift-raised',
    position: [5.5, 0, -7.5],
    rotationY: -0.5,
    incident:
      'The operator left it idling with the forks chest-high. A temp worker cutting between the racks walks straight into the raised tines in the dim aisle — deep laceration to the abdomen, emergency surgery, 8 weeks lost time.',
    oshaRef: '29 CFR 1910.178',
    oshaTitle: 'Powered industrial trucks',
  },
  {
    id: 'wh-blocked-extinguisher',
    name: 'Blocked Fire Extinguisher',
    kind: 'blocked-extinguisher',
    position: [13.6, 0, 4],
    rotationY: -Math.PI / 2,
    incident:
      'A charger sparks and a cardboard bale catches. The nearest extinguisher is behind a staged pallet, and the 40 seconds spent dragging it clear is all the fire needs to reach the racking. $90,000 in stock lost and two workers treated for smoke inhalation.',
    oshaRef: '29 CFR 1910.157(c)',
    oshaTitle: 'Portable fire extinguishers — general requirements',
  },
  {
    id: 'wh-exposed-wiring',
    name: 'Exposed / Damaged Wiring',
    kind: 'exposed-wiring',
    position: [-14.55, 0, -3],
    rotationY: Math.PI / 2,
    incident:
      'The dangling conductors from the broken junction box brush a steel rack upright during restocking. The rack goes live; the next worker to grab it takes 120 volts hand-to-hand — cardiac screening, burns to both palms, 2 weeks lost time.',
    oshaRef: '29 CFR 1910.305',
    oshaTitle: 'Wiring methods, components, and equipment for general use',
  },
  {
    id: 'wh-missing-guard',
    name: 'Conveyor Chain Drive — Guard Removed',
    kind: 'unguarded-conveyor',
    position: [-4, 0, -9],
    incident:
      'Maintenance pulled the chain guard and never refit it. A loader steadying a tote lets his glove drift into the sprocket nip point — two fingers degloved before the e-stop is hit. Permanent partial disability and 12 weeks lost time.',
    oshaRef: '29 CFR 1910.212',
    oshaTitle: 'Machinery and machine guarding — general requirements',
  },
  {
    id: 'wh-unlabeled-drum',
    name: 'Unlabeled Chemical Drum',
    kind: 'unlabeled-drum',
    position: [10.5, 0, -9.5],
    incident:
      'Assuming the blank blue drum is the usual floor soap, a janitor decants it into a mop bucket with bleach already in it. It was an acid descaler. The chlorine gas cloud sends three people to the ER and forces a wing evacuation.',
    oshaRef: '29 CFR 1910.1200',
    oshaTitle: 'Hazard communication',
  },
  {
    id: 'wh-damaged-ladder',
    name: 'Damaged Ladder in Use',
    kind: 'damaged-ladder',
    position: [9, 0, 0.5],
    rotationY: 0.4,
    incident:
      'The cracked third rung — already split and flagged by nobody — shears under a stock checker reaching for the top shelf. He falls eight feet onto the concrete: fractured hip, 10 weeks lost time, and a workers’ comp claim that triples the site premium.',
    oshaRef: '29 CFR 1910.23',
    oshaTitle: 'Ladders',
  },
  {
    id: 'wh-missing-ppe',
    name: 'Worker Without Required PPE',
    kind: 'missing-ppe',
    position: [-2, 0, -5.5],
    rotationY: 0.8,
    incident:
      'Working the live racking aisle with no hard hat or hi-vis, the new hire is invisible to the reach-truck camera and unprotected when a carton corner clips his head from tier three. Scalp laceration, staples, and a near-miss report that should have been a non-event.',
    oshaRef: '29 CFR 1910.132',
    oshaTitle: 'Personal protective equipment — general requirements',
  },
  {
    id: 'wh-broken-light',
    name: 'Failing Light Fixture, Exposed Ballast Wiring',
    kind: 'broken-light',
    position: [0, 5.5, -2],
    incident:
      'The arcing ballast that has been strobing for weeks finally ignites the dust on the fixture housing. Burning plastic drips onto the pick line below — a sleeve catches fire and a packer suffers second-degree burns to the forearm. 5 weeks lost time.',
    oshaRef: '29 CFR 1910.303',
    oshaTitle: 'Electrical — general requirements',
  },
];

const TOOLSHOP_HAZARDS: HazardDef[] = [
  {
    id: 'ts-grinder-guard',
    name: 'Bench Grinder — No Tool Rest or Wheel Guard',
    kind: 'grinder-no-guard',
    position: [-7.5, 0, -6.2],
    incident:
      'With no tool rest, a machinist freehands a chisel against the wheel. It snags, jams, and the unguarded wheel explodes at 3,600 RPM — shrapnel opens his cheek to the bone and embeds in the wall behind him. Forty stitches and 6 weeks lost time.',
    oshaRef: '29 CFR 1910.215',
    oshaTitle: 'Abrasive wheel machinery',
  },
  {
    id: 'ts-no-eye-protection',
    name: 'No Eye Protection at Grinding Station',
    kind: 'no-eye-protection',
    position: [-9.8, 0, -6.2],
    rotationY: Math.PI / 2,
    incident:
      'The safety-glasses dispenser at the grinding station has been empty for a month, so the apprentice works without them. A white-hot burr ricochets off the wheel into his left eye — corneal burn, emergency ophthalmology, and permanently reduced vision.',
    oshaRef: '29 CFR 1910.133',
    oshaTitle: 'Eye and face protection',
  },
  {
    id: 'ts-compressed-air',
    name: 'Compressed Air at 90 PSI Used for Cleaning',
    kind: 'compressed-air',
    position: [6.5, 0, -6.4],
    incident:
      'Blowing chips off his coveralls with the full-pressure 90 PSI nozzle, a fabricator passes the jet over a cut on his wrist. Air forced under the skin causes an embolism scare and a night in the ICU. Cleaning air must be regulated below 30 PSI with chip guarding.',
    oshaRef: '29 CFR 1910.242(b)',
    oshaTitle: 'Hand and portable powered tools — compressed air for cleaning',
  },
  {
    id: 'ts-flammables-out',
    name: 'Open Flammables Beside Ignition Source',
    kind: 'flammables-out',
    position: [-5.4, 0, -6.3],
    incident:
      'An open can of acetone sits eighteen inches from the grinder’s spark stream. One ember lands in it and the bench is sheeted in flame in under three seconds — the machinist’s gloves and sleeves ignite. Second-degree burns to both hands, 9 weeks lost time.',
    oshaRef: '29 CFR 1910.106',
    oshaTitle: 'Flammable liquids',
  },
  {
    id: 'ts-daisy-chain',
    name: 'Frayed Extension-Cord Daisy Chain',
    kind: 'daisy-chain',
    position: [1.5, 0, -1.5],
    incident:
      'Three daisy-chained cords — one with the jacket worn through to copper — feed the whole back bench. The overloaded junction cooks all afternoon, then flashes over against the wooden bench leg. The shop fills with smoke before anyone smells it.',
    oshaRef: '29 CFR 1910.334',
    oshaTitle: 'Use of equipment — electrical safety-related work practices',
  },
  {
    id: 'ts-missing-loto',
    name: 'Machine Under Service — No Lockout/Tagout',
    kind: 'missing-loto',
    position: [7, 0, 1.5],
    rotationY: -0.6,
    incident:
      'The table saw’s access panel is off and a mechanic’s hands are in the arbor — but nothing is locked or tagged. A coworker, seeing the saw “free,” hits the start switch. The blade spins up around the mechanic’s fingers: two amputated at the first knuckle.',
    oshaRef: '29 CFR 1910.147',
    oshaTitle: 'The control of hazardous energy (lockout/tagout)',
  },
  {
    id: 'ts-unguarded-belt',
    name: 'Compressor Belt Drive — Guard Missing',
    kind: 'unguarded-belt',
    position: [8.8, 0, -6.4],
    rotationY: -Math.PI / 2,
    incident:
      'The compressor kicks on as a worker leans across it to reach a fitting. His shop coat tail whips into the exposed belt-and-pulley nip and drags him against the frame — dislocated shoulder and friction burns before the belt finally throws him clear.',
    oshaRef: '29 CFR 1910.219',
    oshaTitle: 'Mechanical power-transmission apparatus',
  },
  {
    id: 'ts-drill-press',
    name: 'Drill Press — Chuck Key Left In, No Guard',
    kind: 'drill-press',
    position: [-1.5, 0, -6.3],
    incident:
      'The chuck key was left seated in the chuck. On startup it becomes a steel projectile at head height, missing the operator’s eye by an inch and shattering a fluorescent tube. The unguarded chuck then snags her glove and sprains two fingers.',
    oshaRef: '29 CFR 1910.212',
    oshaTitle: 'Machinery and machine guarding — general requirements',
  },
  {
    id: 'ts-blocked-panel',
    name: 'Electrical Panel Blocked by Storage',
    kind: 'blocked-panel',
    position: [10.55, 0, 3.5],
    rotationY: -Math.PI / 2,
    incident:
      'When the daisy-chained bench circuit starts arcing, the breaker panel is barricaded behind a loaded parts cart. The ninety seconds spent heaving it aside is the difference between a tripped breaker and an electrical fire inside the wall cavity.',
    oshaRef: '29 CFR 1910.303(g)',
    oshaTitle: 'Electrical — working space about electric equipment',
  },
  {
    id: 'ts-oily-rags',
    name: 'Oily Rags Piled in Open Bin',
    kind: 'oily-rags',
    position: [4, 0, 4.5],
    incident:
      'Linseed-soaked rags heaped in an open cardboard box self-heat overnight. At 2 a.m. they reach autoignition; by the time the alarm company calls, the finishing corner is fully involved. $250,000 in tooling lost — for the cost of a covered metal safety can.',
    oshaRef: '29 CFR 1910.106(e)',
    oshaTitle: 'Flammable liquids — industrial plants, handling and storage',
  },
  {
    id: 'ts-unsecured-cylinder',
    name: 'Compressed-Gas Cylinder Unsecured',
    kind: 'unsecured-cylinder',
    position: [-9.5, 0, 3.5],
    rotationY: Math.PI / 2,
    incident:
      'The free-standing oxygen cylinder gets clipped by a cart and topples. The valve snaps off on the bench edge and 2,200 PSI turns the bottle into a torpedo — it punches through a block wall before coming to rest. Pure luck that nobody was in line with it.',
    oshaRef: '29 CFR 1910.101',
    oshaTitle: 'Compressed gases — general requirements',
  },
];

const ATL_RAMP_HAZARDS: HazardDef[] = [
  {
    id: 'atl-fod-debris',
    name: 'FOD — Loose Debris on the Apron',
    kind: 'unstable-stack',
    position: [4.5, 0, 2],
    incident:
      'A torn baggage strap, a snapped zip-tie, and a stray lavatory cap litter the gate area before the inbound 757 arrives. The strap is sucked into the No. 2 engine on spool-up — foreign object damage shreds three fan blades, the aircraft is grounded for an engine swap, and a $2.1M repair bill lands on the carrier. A pre-arrival FOD walk would have taken ninety seconds.',
    oshaRef: '29 CFR 1910.22',
    oshaTitle: 'Walking-working surfaces — general requirements',
  },
  {
    id: 'atl-jet-blast',
    name: 'Crew in the Jet Blast Zone',
    kind: 'compressed-air',
    position: [-8, 0, -7],
    rotationY: 0.6,
    incident:
      'A ramp agent cuts behind a departing regional jet as it advances power to taxi out. The jet blast — well over 100 mph at break-away thrust — picks him off his feet and slams him into a baggage cart twenty feet away. Fractured collarbone, concussion, 7 weeks lost time. No OSHA standard names jet blast specifically, so this struck-by/thrown-by hazard falls under the General Duty Clause: blast danger areas behind running engines must be kept clear and marked.',
    oshaRef: 'OSHA Sec. 5(a)(1)',
    oshaTitle: 'General Duty Clause — recognized struck-by/thrown-by hazards',
  },
  {
    id: 'atl-fuel-spill',
    name: 'Fueling Operation — Open Flammable Spill',
    kind: 'flammables-out',
    position: [9.5, 0, -4],
    incident:
      'A hydrant fueler overfills the wing tank and a sheet of Jet A spreads under the aircraft, vapors rolling across the hot apron toward a running GPU. One ignition source from the spill zone and the whole gate goes up. The fueling was never bonded and no spill kit was staged — a 50-foot fuel-fire radius for the price of a missed shutoff.',
    oshaRef: '29 CFR 1910.106',
    oshaTitle: 'Flammable liquids',
  },
  {
    id: 'atl-gpu-cable',
    name: 'Damaged Ground-Power Cable',
    kind: 'exposed-wiring',
    position: [-12.6, 0, 3],
    rotationY: Math.PI / 2,
    incident:
      'The 400-Hz ground-power cable has been dragged over the apron edge so often the jacket is worn through to the conductor. In a rain shower the puddle around the GPU head goes live; the agent unplugging it takes a shock hand-to-hand across 115 volts at high current. Cardiac monitoring, deep palm burns, 3 weeks lost time.',
    oshaRef: '29 CFR 1910.305',
    oshaTitle: 'Wiring methods, components, and equipment for general use',
  },
  {
    id: 'atl-tug-unattended',
    name: 'Unattended Baggage Tug, Engine Running',
    kind: 'forklift-raised',
    position: [6, 0, 7.5],
    rotationY: -0.4,
    incident:
      'A driver hops off the tug to grab a dropped bag and leaves it idling, out of gear, on the gentle apron slope. It creeps forward, pins a fueler against the cargo-cart train, and crushes his leg before anyone can reach the brake. Powered tugs left running and unattended are a leading cause of ramp struck-by injuries.',
    oshaRef: '29 CFR 1910.178',
    oshaTitle: 'Powered industrial trucks',
  },
  {
    id: 'atl-blocked-exit',
    name: 'Blocked Jet Bridge Emergency Exit',
    kind: 'blocked-exit',
    position: [-14.6, 0, 7],
    rotationY: Math.PI / 2,
    incident:
      'Stacked gate-checked strollers and a broken wheelchair wall off the emergency egress door at the base of the jet bridge. When a fuel-vapor alarm sounds during boarding, the only fast way off the apron level is jammed shut — agents and passengers funnel back up a single stair as the evacuation drags from seconds into minutes.',
    oshaRef: '29 CFR 1910.37',
    oshaTitle: 'Maintenance, safeguards, and operational features for exit routes',
  },
  {
    id: 'atl-no-hivis',
    name: 'Ramp Agent Without Hi-Vis & Hearing PPE',
    kind: 'missing-ppe',
    position: [1.5, 0, -6.5],
    rotationY: 0.8,
    incident:
      "In a faded gray hoodie with no high-visibility vest, the new agent is invisible to the pushback driver's mirrors at dusk. He drifts into the pushback path and is clipped by the tow bar — a struck-by injury the required hi-vis PPE exists to prevent. (Working that same wash of 130-decibel engine noise with no muffs, his audiogram has also begun to show a standard threshold shift.)",
    oshaRef: '29 CFR 1910.132',
    oshaTitle: 'Personal protective equipment — general requirements',
  },
  {
    id: 'atl-o2-cylinder',
    name: 'Unsecured Aviation Oxygen Cylinder',
    kind: 'unsecured-cylinder',
    position: [12.6, 0, 5],
    rotationY: -Math.PI / 2,
    incident:
      'A high-pressure oxygen cylinder for the cabin servicing cart stands free against the gate column, no chain, no cap. A loaded belt loader clips it and the valve shears on the concrete — 1,800 PSI of pure oxygen turns the bottle into a missile and feeds any nearby spark into a flash fire. Oxygen cylinders must be capped, secured upright, and kept clear of grease and fuel.',
    oshaRef: '29 CFR 1910.101',
    oshaTitle: 'Compressed gases — general requirements',
  },
  {
    id: 'atl-belt-loader',
    name: 'Belt Loader — Drive Guard Removed',
    kind: 'unguarded-belt',
    position: [-5, 0, 8],
    incident:
      "Maintenance pulled the belt loader's chain-and-pulley guard to chase a jam and never refit it. A loader feeding bags up the incline lets a glove cuff drift into the exposed nip point; it drags his hand into the drive before he can pull back. Two fingers crushed, surgery, 10 weeks lost time — the guard was sitting on the bench the whole time.",
    oshaRef: '29 CFR 1910.219',
    oshaTitle: 'Mechanical power-transmission apparatus',
  },
  {
    id: 'atl-deice-glycol',
    name: 'Unlabeled De-Icing Glycol Drum',
    kind: 'unlabeled-drum',
    position: [10, 0, 9.5],
    incident:
      'A blank amber drum by the de-ice pad is assumed to be spent Type I glycol and poured into the recovery sump. It was concentrated Type IV anti-ice fluid with a different additive package; the reaction in the warm sump throws off fumes that drive two crew members back coughing. Every chemical container on the ramp needs a compliant hazard label.',
    oshaRef: '29 CFR 1910.1200',
    oshaTitle: 'Hazard communication',
  },
  {
    id: 'atl-blocked-extinguisher',
    name: 'Blocked Apron Fire Extinguisher',
    kind: 'blocked-extinguisher',
    position: [13.6, 0, -8],
    rotationY: -Math.PI / 2,
    incident:
      'The gate fire extinguisher cabinet — staged for exactly the fuel and electrical fires that happen here — is barricaded behind a train of loaded cargo carts. When a GPU overheats and a wiring fire starts under the aircraft, the forty seconds spent dragging carts clear is all the fire needs to climb the fuselage skin.',
    oshaRef: '29 CFR 1910.157(c)',
    oshaTitle: 'Portable fire extinguishers — general requirements',
  },
  {
    id: 'atl-apron-slip',
    name: 'Slip Hazard — Glycol & Fuel Sheen on the Apron',
    kind: 'wet-floor',
    position: [-3, 0, -2],
    incident:
      'A film of spent de-icing glycol mixed with a fuel sheen glazes the gate area, unmarked and unsqueegeed. A marshaller backing up to guide the aircraft in loses his footing on the slick concrete, goes down on his tailbone, and rolls toward the nosewheel path. Fractured coccyx, 4 weeks lost time, and a near-miss with the moving aircraft.',
    oshaRef: '29 CFR 1910.22',
    oshaTitle: 'Walking-working surfaces — general requirements',
  },
];

export const LEVELS: LevelDef[] = [
  {
    id: 1,
    name: 'WAREHOUSE',
    shiftLabel: 'SHIFT 1 — WAREHOUSE',
    inspections: 13,
    roomHalfWidth: 15,
    roomHalfDepth: 12,
    spawn: [0, 1.7, 9.5],
    hazards: WAREHOUSE_HAZARDS,
  },
  {
    id: 2,
    name: 'TOOL SHOP',
    shiftLabel: 'SHIFT 2 — TOOL SHOP',
    inspections: 13,
    roomHalfWidth: 11,
    roomHalfDepth: 8,
    spawn: [0, 1.7, 6],
    hazards: TOOLSHOP_HAZARDS,
  },
  {
    id: 3,
    name: 'ATL RAMP',
    shiftLabel: 'SHIFT 3 — HARTSFIELD RAMP',
    inspections: 13,
    roomHalfWidth: 16,
    roomHalfDepth: 13,
    spawn: [0, 1.7, 10.5],
    hazards: ATL_RAMP_HAZARDS,
  },
];

export function getLevel(id: number): LevelDef | undefined {
  return LEVELS.find((l) => l.id === id);
}
