import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import i18n from '../i18n'

const LanguageContext = createContext(null)

const SUPPORTED = ['en', 'fa']
const STORAGE_KEY = 'unichat-language'

function normalize(lang) {
  if (!lang) return 'fa'
  const base = String(lang).toLowerCase().split('-')[0]
  return SUPPORTED.includes(base) ? base : 'fa'
}

export function LanguageProvider({ children }) {
  const [language, setLanguageState] = useState(() => {
    if (typeof window === 'undefined') return 'fa'
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved && SUPPORTED.includes(saved)) return saved
    const detected = normalize(i18n.language)
    return detected
  })

  useEffect(() => {
    const root = document.documentElement
    const dir = language === 'fa' ? 'rtl' : 'ltr'
    root.lang = language
    root.dir = dir
    root.classList.toggle('font-persian', language === 'fa')
    if (i18n.language !== language) {
      i18n.changeLanguage(language)
    }
    localStorage.setItem(STORAGE_KEY, language)
  }, [language])

  const setLanguage = useCallback((next) => {
    const norm = normalize(next)
    setLanguageState(norm)
  }, [])

  const value = {
    language,
    setLanguage,
    isRTL: language === 'fa',
    dir: language === 'fa' ? 'rtl' : 'ltr',
  }

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
}

export function useLanguage() {
  const ctx = useContext(LanguageContext)
  if (!ctx) throw new Error('useLanguage must be used within a LanguageProvider')
  return ctx
}
