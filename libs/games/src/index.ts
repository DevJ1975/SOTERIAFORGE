export * from './lib/hazard-hunt/hazard-hunt.component';
export * from './lib/peril/peril.component';

// Hazard Hunter level/hazard data (incl. ATL RAMP level 3).
export {
  LEVELS,
  getLevel,
  type HazardKind,
  type HazardDef,
  type LevelDef,
} from './lib/hazard-hunt/hazard-data';

// PERIL! board data + selectable boards (OSHA default, aviation via ?board=airport).
export {
  AIRPORT_BOARD,
  AIRPORT_FINAL_PERIL,
  AIRPORT_ROUND_ONE_CATEGORIES,
  AIRPORT_ROUND_TWO_CATEGORIES,
  DEFAULT_BOARD,
  OSHA_BOARD,
  PERIL_BOARDS,
  resolveBoard,
  type PerilBoard,
  type PerilBoardId,
  type PerilCategory,
  type PerilClue,
  type FinalPeril,
} from './lib/peril/peril-data';
