import { definePreset } from '@primeuix/themes';
import Aura from '@primeuix/themes/aura';

/**
 * PrimeNG theme preset built from Adobe Spectrum design tokens.
 * Color ramps are anchored on Spectrum's blue (accent), gray (neutrals),
 * red (negative), green (positive), and orange (notice) global colors so the
 * component library renders with Spectrum's visual language end to end.
 */
export const ForgePreset = definePreset(Aura, {
  semantic: {
    primary: {
      50: '#f5f9ff',
      100: '#e6f0fd',
      200: '#cce2fb',
      300: '#8ec1f5',
      400: '#4b9cf0',
      500: '#2680eb',
      600: '#1473e6',
      700: '#0d66d0',
      800: '#095aba',
      900: '#084f9e',
      950: '#063c78',
    },
    colorScheme: {
      light: {
        surface: {
          0: '#ffffff',
          50: '#fafafa',
          100: '#f5f5f5',
          200: '#eaeaea',
          300: '#e1e1e1',
          400: '#cacaca',
          500: '#b3b3b3',
          600: '#8e8e8e',
          700: '#6e6e6e',
          800: '#4b4b4b',
          900: '#2c2c2c',
          950: '#1b1b1b',
        },
      },
      dark: {
        surface: {
          0: '#ffffff',
          50: '#f5f5f5',
          100: '#e1e1e1',
          200: '#cacaca',
          300: '#b3b3b3',
          400: '#8e8e8e',
          500: '#6e6e6e',
          600: '#4b4b4b',
          700: '#3e3e3e',
          800: '#2c2c2c',
          900: '#1e1e1e',
          950: '#0f0f0f',
        },
      },
    },
    focusRing: {
      width: '2px',
      style: 'solid',
      color: '{primary.600}',
      offset: '1px',
    },
    formField: {
      borderRadius: '4px',
    },
  },
  components: {
    button: {
      root: {
        borderRadius: '16px',
        paddingX: '0.875rem',
        paddingY: '0.375rem',
      },
    },
    card: {
      root: {
        borderRadius: '8px',
      },
    },
  },
});
