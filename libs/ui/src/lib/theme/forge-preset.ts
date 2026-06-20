import { definePreset } from '@primeuix/themes';
import Aura from '@primeuix/themes/aura';

/**
 * PrimeNG theme preset: Adobe Spectrum component materials skinned with the
 * Soteria Forge brand. The primary ramp is built around brand Ember
 * (#E8551F) and the neutral ramp around the brand's warm gray/charcoal
 * scale; Spectrum's geometry (radii, focus ring, paddings) is retained.
 */
export const ForgePreset = definePreset(Aura, {
  semantic: {
    primary: {
      50: '#fdf1ec',
      100: '#fbe1d5',
      200: '#f7c4ab',
      300: '#f5a87d',
      400: '#f0814b',
      500: '#e8551f',
      600: '#d8451a',
      700: '#c33d15',
      800: '#a43412',
      900: '#862b10',
      950: '#5e1d0a',
    },
    colorScheme: {
      light: {
        surface: {
          0: '#ffffff',
          50: '#f6f5f6',
          100: '#f0eff1',
          200: '#e9e8ea',
          300: '#dddcde',
          400: '#c4c9cf',
          500: '#8a929c',
          600: '#6e747d',
          700: '#3a4048',
          800: '#2a2e35',
          900: '#1b1e23',
          950: '#15171b',
        },
      },
      dark: {
        surface: {
          0: '#ffffff',
          50: '#f6f5f6',
          100: '#dddcde',
          200: '#c4c9cf',
          300: '#8a929c',
          400: '#6e747d',
          500: '#565c64',
          600: '#3a4048',
          700: '#2a2e35',
          800: '#1b1e23',
          900: '#15171b',
          950: '#0e1013',
        },
      },
    },
    focusRing: {
      width: '2px',
      style: 'solid',
      color: '{primary.600}',
      offset: '2px',
    },
    formField: {
      borderRadius: '4px',
    },
  },
  components: {
    button: {
      root: {
        borderRadius: '12px',
        paddingX: '0.875rem',
        paddingY: '0.375rem',
      },
    },
    card: {
      root: {
        borderRadius: '18px',
      },
    },
  },
});
