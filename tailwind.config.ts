import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        navy: {
          950: '#0a1628',
          900: '#0f2138',
          800: '#152c4a',
          700: '#1c3a5e',
          600: '#254a76',
        },
        amber: {
          500: '#f5a623',
          600: '#e0910f',
        },
        concrete: {
          50: '#f7f7f6',
          100: '#eeeeec',
          200: '#dcdcd8',
          300: '#c2c2bc',
          400: '#9c9c94',
          500: '#7a7a72',
          600: '#5c5c56',
          700: '#464642',
          800: '#33332f',
          900: '#222220',
        },
      },
      fontFamily: {
        sans: ['ui-sans-serif', 'system-ui', 'Segoe UI', 'Roboto', 'Helvetica', 'Arial', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

export default config;
