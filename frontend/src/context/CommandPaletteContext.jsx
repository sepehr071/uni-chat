import { createContext, useContext, useState, useCallback, useRef, lazy, Suspense } from 'react'

const CommandPaletteContext = createContext(null)

const CommandPalette = lazy(() => import('../components/command/CommandPalette'))

export function CommandPaletteProvider({ children }) {
  const [isOpen, setIsOpen] = useState(false)
  const [scopes, setScopes] = useState({})
  const scopeCounterRef = useRef({})

  const open = useCallback(() => setIsOpen(true), [])
  const close = useCallback(() => setIsOpen(false), [])
  const toggle = useCallback(() => setIsOpen(prev => !prev), [])

  const register = useCallback((scopeId, items) => {
    setScopes(prev => ({ ...prev, [scopeId]: items }))
    return () => {
      setScopes(prev => {
        const next = { ...prev }
        delete next[scopeId]
        return next
      })
    }
  }, [])

  const value = { isOpen, open, close, toggle, scopes, register }

  return (
    <CommandPaletteContext.Provider value={value}>
      {children}
      <Suspense fallback={null}>
        <CommandPalette />
      </Suspense>
    </CommandPaletteContext.Provider>
  )
}

export function useCommandPalette() {
  const context = useContext(CommandPaletteContext)
  if (!context) {
    throw new Error('useCommandPalette must be used within a CommandPaletteProvider')
  }
  return context
}
