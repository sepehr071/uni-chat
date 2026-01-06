import { createContext, useContext, useState, useEffect } from 'react'

const ThemeContext = createContext(null)

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() => {
    // Initialize from localStorage or default to 'dark'
    if (typeof window !== 'undefined') {
      const savedTheme = localStorage.getItem('unichat-theme')
      return savedTheme || 'dark'
    }
    return 'dark'
  })

  useEffect(() => {
    // Apply theme class to document root
    const root = document.documentElement
    root.classList.remove('light', 'dark')
    root.classList.add(theme)

    // Save to localStorage
    localStorage.setItem('unichat-theme', theme)
  }, [theme])

  const setTheme = (newTheme) => {
    if (newTheme === 'light' || newTheme === 'dark') {
      setThemeState(newTheme)
    }
  }

  const toggleTheme = () => {
    setTheme(theme === 'dark' ? 'light' : 'dark')
  }

  const value = {
    theme,
    setTheme,
    toggleTheme,
    isDark: theme === 'dark',
    isLight: theme === 'light',
  }

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider')
  }
  return context
}
