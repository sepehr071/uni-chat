import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

/**
 * Per-route default open state for the helper rail.
 * Chat + Knowledge surfaces want guidance prominent.
 * Workflow / Arena / Debate are dense canvases — start collapsed.
 * Everything else defaults open.
 */
const ROUTE_DEFAULTS = {
  '/chat': true,
  '/knowledge': true,
  '/workflow': false,
  '/arena': false,
  '/debate': false,
}

function matchRouteDefault(pathname) {
  if (pathname in ROUTE_DEFAULTS) return ROUTE_DEFAULTS[pathname]
  for (const key of Object.keys(ROUTE_DEFAULTS)) {
    if (pathname.startsWith(`${key}/`)) return ROUTE_DEFAULTS[key]
  }
  return true
}

function storageKey(userId) {
  return userId ? `unichat:helper-rail:${userId}` : null
}

// ---------------------------------------------------------------------------
// Module-level shared store
// ---------------------------------------------------------------------------
// We need multiple consumers (HelperRail + pages that suppress it) to share
// the same `open` + `suppressed` state. A tiny external store with
// `useSyncExternalStore` keeps it lightweight and avoids pulling in zustand
// or a Context provider just for two booleans.
const listeners = new Set()
const state = {
  open: true,
  openInitialized: false,
  suppressed: false,
  userId: null,
  pathname: '/',
}

function emit() {
  listeners.forEach((l) => l())
}

function subscribe(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function getSnapshot() {
  return state
}

function persistOpen(value) {
  const key = storageKey(state.userId)
  if (!key) return
  try {
    localStorage.setItem(key, value ? '1' : '0')
  } catch {
    /* ignore quota / privacy */
  }
}

function hydrateForUser(userId, pathname) {
  state.userId = userId
  state.pathname = pathname
  const key = storageKey(userId)
  if (key) {
    try {
      const raw = localStorage.getItem(key)
      if (raw === '1') {
        state.open = true
        state.openInitialized = true
        emit()
        return
      }
      if (raw === '0') {
        state.open = false
        state.openInitialized = true
        emit()
        return
      }
    } catch {
      /* ignore */
    }
  }
  state.open = matchRouteDefault(pathname)
  state.openInitialized = true
  emit()
}

function setOpenInternal(next) {
  const value = typeof next === 'function' ? next(state.open) : !!next
  if (value === state.open) return
  state.open = value
  persistOpen(value)
  emit()
}

function setSuppressedInternal(next) {
  const value = typeof next === 'function' ? next(state.suppressed) : !!next
  if (value === state.suppressed) return
  state.suppressed = value
  emit()
}

/**
 * useHelperRail
 *
 * Shared, module-scoped store. Multiple call sites observe the same `open`
 * and `suppressed` values, so a page can `setSuppressed(true)` while the
 * rail's own copy of the hook sees the change.
 *
 * `open` is persisted per-user under `unichat:helper-rail:<userId>`. Default
 * is route-aware (see `ROUTE_DEFAULTS`). `suppressed` is in-memory only.
 */
export function useHelperRail() {
  const location = useLocation()
  const { user } = useAuth()
  const userId = user?.id || user?._id || null

  // (Re)hydrate when the user changes — fresh login should not inherit the
  // previous user's preference.
  useEffect(() => {
    if (userId !== state.userId || !state.openInitialized) {
      hydrateForUser(userId, location.pathname)
    }
    // intentionally not depending on pathname — route-driven default applies
    // only on first hydration, not on every navigation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])

  // Local snapshot reflects the shared store
  const snap = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)

  // Stable identity for setters keeps consumer effects from re-firing on every
  // store emission.
  const [setters] = useState(() => ({
    setOpen: (next) => setOpenInternal(next),
    setSuppressed: (next) => setSuppressedInternal(next),
    toggleOpen: () => setOpenInternal((v) => !v),
  }))

  const setOpen = useCallback(setters.setOpen, [setters])
  const setSuppressed = useCallback(setters.setSuppressed, [setters])
  const toggleOpen = useCallback(setters.toggleOpen, [setters])

  return {
    open: snap.open,
    suppressed: snap.suppressed,
    setOpen,
    setSuppressed,
    toggleOpen,
  }
}

export default useHelperRail
