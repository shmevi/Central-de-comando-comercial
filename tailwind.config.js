/** Tokens centralizados em src/styles/tokens.css (variáveis RGB). */
const v = (name) => `rgb(var(--${name}) / <alpha-value>)`;
export default {
  darkMode: ['class', '[data-theme="dark"]'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: v('bg'),
        surface: v('surface'),
        'surface-2': v('surface-2'),
        'surface-3': v('surface-3'),
        border: v('border'),
        fg: v('fg'),
        muted: v('muted'),
        gold: { 100: v('gold-100'), 300: v('gold-300'), 500: v('gold-500'), 700: v('gold-700'), text: v('gold-text') },
        orange: v('orange'),
        success: v('success'),
        warning: v('warning'),
        danger: v('danger'),
        info: v('info'),
        purple: v('purple'),
      },
      fontFamily: {
        // Fonte de identidade (Capture It) só em marca e títulos principais; cai para Barlow Condensed se ausente.
        brand: ['"Capture It"', '"Barlow Condensed"', '"Arial Narrow"', 'sans-serif'],
        display: ['"Barlow Condensed"', '"Arial Narrow"', 'sans-serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      borderRadius: { lg: '10px', xl: '14px', '2xl': '18px' },
      boxShadow: { 'elev-1': 'var(--elev-1)', 'elev-2': 'var(--elev-2)' },
      backgroundImage: {
        'gold-gradient': 'linear-gradient(135deg, rgb(var(--gold-100)) 0%, rgb(var(--gold-300)) 55%, rgb(var(--gold-700)) 120%)',
      },
      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'pop-in': { from: { opacity: '0', transform: 'translate(-50%, -48%) scale(.97)' }, to: { opacity: '1', transform: 'translate(-50%, -50%) scale(1)' } },
        'slide-up': { from: { opacity: '0', transform: 'translateY(8px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
      },
      animation: {
        'fade-in': 'fade-in 160ms ease-out',
        'pop-in': 'pop-in 180ms cubic-bezier(.2,.8,.2,1)',
        'slide-up': 'slide-up 200ms ease-out',
      },
    },
  },
  plugins: [],
};
