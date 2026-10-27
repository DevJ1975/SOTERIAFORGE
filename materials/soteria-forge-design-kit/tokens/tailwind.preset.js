// Soteria Forge Tailwind preset. Usage in tailwind.config.js:
//   module.exports = { presets: [require('./soteria-forge-design-kit/tokens/tailwind.preset.js')], content: [...] }
module.exports = {
  theme: {
    extend: {
      colors: {
        charcoal: { DEFAULT: '#1B1E23', 2: '#242830', 3: '#2E333C' },
        ember: { DEFAULT: '#DC481B', dark: '#AE3A14', soft: '#FFF1EB', ink: '#B33A12' },
        flame: '#F69A3C',
        gold: '#FFC774',
        cream: '#F6F3EC',
        line: '#E6E1D8',
        muted: { DEFAULT: '#6B7280', bg: '#F1EEE7' },
        ink: { DEFAULT: '#1B1E23', 2: '#4B5563' },
        success: { DEFAULT: '#1E9E6A', soft: '#E6F6EF', ink: '#0F5E3C' },
        danger: { DEFAULT: '#C0392B', soft: '#FFF5F5' },
        engage: { bg: '#16181C', pane: '#1F2228', line: '#2B2F36', inset: '#15171B', text: '#C9CED6' },
        sfg: { navy: '#0B3D5C', 'navy-soft': '#E6EEF5', teal: '#128C9E', 'teal-light': '#5CC6D0', gold: '#F2A900' },
      },
      fontFamily: { sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'] },
      fontSize: {
        xs: ['12px', '1.4'], sm: ['13px', '1.45'], base: ['15px', '1.5'], md: ['16px', '1.5'],
        lg: ['20px', '1.3'], xl: ['30px', '1.2'], display: ['88px', '1'],
      },
      borderRadius: { sm: '8px', md: '12px', lg: '14px', xl: '16px' },
      boxShadow: {
        card: '0 1px 2px rgba(27,30,35,0.04)',
        panel: '-12px 0 40px rgba(27,30,35,0.12)',
        badge: '0 8px 24px rgba(220,72,27,0.35)',
      },
      backgroundImage: {
        'ember-grad': 'linear-gradient(90deg,#DC481B,#F69A3C)',
        'badge-grad': 'radial-gradient(circle at 40% 35%,#FFD9A8,#DC481B)',
        'credential-grad': 'radial-gradient(circle at 40% 35%,#FFF1C2,#F2A900)',
      },
      spacing: { rail: '88px', topbar: '64px', panel: '640px' },
      transitionTimingFunction: { forge: 'cubic-bezier(0.2,0.7,0.2,1)' },
    },
  },
};
