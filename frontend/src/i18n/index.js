import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'

const localeFiles = import.meta.glob('./locales/**/*.json', { eager: true })

const resources = {}
for (const path in localeFiles) {
  const match = path.match(/\.\/locales\/([^/]+)\/([^/]+)\.json$/)
  if (!match) continue
  const [, lng, ns] = match
  if (!resources[lng]) resources[lng] = {}
  const mod = localeFiles[path]
  resources[lng][ns] = mod && mod.default ? mod.default : mod
}

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'fa',
    supportedLngs: ['en', 'fa'],
    nonExplicitSupportedLngs: true,
    defaultNS: 'common',
    fallbackNS: 'common',
    interpolation: { escapeValue: false },
    detection: {
      order: ['localStorage', 'htmlTag'],
      lookupLocalStorage: 'unichat-language',
      caches: ['localStorage'],
    },
    returnEmptyString: false,
  })

export default i18n
