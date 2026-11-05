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
        border: v('border'),
        fg: v('fg'),
        muted: v('muted'),
        gold: { 100: v('gold-100'), 300: v('gold-300'), 500: v('gold-500'), 700: v('gold-700'), text: v('gold-text') },
        orange: v('orange'),
        success: v('success'),
        warning: v('warning'),
        danger: v('danger'),
        info: v('info'),
      },
      fontFamily: {
        display: ['"Barlow Condensed"', '"Arial Narrow"', 'sans-serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      borderRadius: { lg: '12px', xl: '16px' },
      backgroundImage: {
        'gold-gradient': 'linear-gradient(135deg, rgb(var(--gold-100)) 0%, rgb(var(--gold-300)) 50%, rgb(var(--gold-700)) 100%)',
      },
    },
  },
  plugins: [],
};
