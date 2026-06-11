/**
 * Spec-compile shim: jest's tsconfig.spec uses moduleResolution "node10",
 * which cannot see the exports-map-only subpath '@primeuix/themes/aura'
 * imported by @forge/ui's theme preset. The app builds use "bundler"
 * resolution and never need this.
 */
declare module '@primeuix/themes/aura' {
  import type { Preset } from '@primeuix/themes/types';
  const Aura: Preset;
  export default Aura;
}
