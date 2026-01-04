/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Notion-inspired dark theme
        background: {
          DEFAULT: '#191919',
          secondary: '#202020',
          tertiary: '#252525',
          elevated: '#2d2d2d',
        },
        foreground: {
          DEFAULT: '#e6e6e6',
          secondary: '#9b9b9b',
          tertiary: '#6b6b6b',
        },
        border: {
          DEFAULT: '#333333',
          light: '#404040',
        },
        accent: {
          DEFAULT: '#5c9aed',
          hover: '#4a8bdf',
          muted: '#3d4f6f',
        },
        success: '#4ade80',
        warning: '#fbbf24',
        error: '#f87171',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      boxShadow: {
        'elevated': '0 4px 12px rgba(0, 0, 0, 0.4)',
        'dropdown': '0 8px 24px rgba(0, 0, 0, 0.5)',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'fade-in': 'fadeIn 0.2s ease-out',
        'slide-up': 'slideUp 0.3s ease-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
}
