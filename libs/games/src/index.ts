// Card-game configuration model
export * from './lib/card-game.model';

// Accessible (keyboard + screen-reader) DOM game renderer — the default.
export * from './lib/accessible-card-game.component';

// Game engine components
// These components are designed to be @defer-loaded by host apps.
// See libs/games/src/lib/README.md for usage guidance.
export * from './lib/phaser-host.component';
export * from './lib/rive-character.component';
export * from './lib/unity-embed.component';
