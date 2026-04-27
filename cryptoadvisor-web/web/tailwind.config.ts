import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      // TODO: add custom design tokens
    },
  },
  plugins: [],
};

export default config;
