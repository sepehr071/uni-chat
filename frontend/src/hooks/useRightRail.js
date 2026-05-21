import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

/**
 * useRightRail — shared module-level store for the dockable right rail.
 *
 * Replaces the older helper-only rail hook. Adds `activeTab` on top of the
 * original {open, suppressed, setOpen, toggleOpen, setSuppressed} surface.
 *
 * Persistence (per-user):
 *   - `unichat:right-rail:<userId>:open`  → '1' | '0'
 *   - `unichat:right-rail:<userId>:tab`   → tab id (e.g. 'helper', 'branches')
 *
 * IMPORTANT — `useSyncExternalStore` snapshot ref swap rule
 * --------------------------------------------------------
 * Every mutator MUST produce a NEW state object (`state = { ...state, x }`)
 * — never mutate in place. React's `useSyncExternalStore` bails out via
 * `Object.is(prev, next)` on the snapshot result, so an in-place mutation
 * makes consumers silently miss updates even though listeners fire. Bit the
 * helper rail collapse button previously; see CLAUDE.md Known Issue #7.
 */

// Default open state per route. Chat + Knowledge surfaces want the rail
// prominent; Workflow / Arena / Debate are dense canvases — start collapsed.
const ROUTE_DEFAULTS = {
  '/chat': true,
  '/knowledge': true,
  '/workflow': false,
  '/arena': false,
  '/debate': false,
}

// Tabs that are clickable on each route. Routes not listed get Helper only —
// other tabs render disabled-grey to advertise their existence but block clicks.
const ROUTE_ENABLED_TABS = {
  '/chat': ['helper', 'branches', 'attachments', 'canvas'],
}

export const RAIL_TABS = ['helper', 'branches', 'attachments', 'canvas']
const DEFAULT_TAB = 'helper'

function matchRouteDefault(pathname) {
  if (pathname in ROUTE_DEFAULTS) return ROUTE_DEFAULTS[pathname]
  for (const key of Object.keys(ROUTE_DEFAULTS)) {
    if (pathname.startsWith(`${key}/`)) return ROUTE_DEFAULTS[key]
  }
  return true
}

export function getEnabledTabsForRoute(pathname) {
  if (pathname in ROUTE_ENABLED_TABS) return ROUTE_ENABLED_TABS[pathname]
  for (const key of Object.keys(ROUTE_ENABLED_TABS)) {
    if (pathname.startsWith(`${key}/`)) return ROUTE_ENABLED_TABS[key]
  }
  return ['helper']
}

function openKey(userId) {
  return userId ? `unichat:right-rail:${userId}:open` : null
}

function tabKey(userId) {
  return userId ? `unichat:right-rail:${userId}:tab` : null
}

// ---------------------------------------------------------------------------
// Module-level shared store
// ---------------------------------------------------------------------------
const listeners = new Set()
let state = {
  open: true,
  openInitialized: false,
  activeTab: DEFAULT_TAB,
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
  const key = openKey(state.userId)
  if (!key) return
  try {
    localStorage.setItem(key, value ? '1' : '0')
  } catch {
    /* ignore quota / privacy */
  }
}

function persistTab(value) {
  const key = tabKey(state.userId)
  if (!key) return
  try {
    localStorage.setItem(key, value)
  } catch {
    /* ignore */
  }
}

function hydrateForUser(userId, pathname) {
  let open = state.open
  let activeTab = state.activeTab
  const openK = openKey(userId)
  const tabK = tabKey(userId)
  if (openK) {
    try {
      const raw = localStorage.getItem(openK)
      if (raw === '1') open = true
      else if (raw === '0') open = false
      else open = matchRouteDefault(pathname)
    } catch {
      open = matchRouteDefault(pathname)
    }
  } else {
    open = matchRouteDefault(pathname)
  }
  if (tabK) {
    try {
      const raw = localStorage.getItem(tabK)
      if (raw && RAIL_TABS.includes(raw)) activeTab = raw
      else activeTab = DEFAULT_TAB
    } catch {
      activeTab = DEFAULT_TAB
    }
  } else {
    activeTab = DEFAULT_TAB
  }
  state = { ...state, userId, pathname, open, activeTab, openInitialized: true }
  emit()
}

function setOpenInternal(next) {
  const value = typeof next === 'function' ? next(state.open) : !!next
  if (value === state.open) return
  state = { ...state, open: value }
  persistOpen(value)
  emit()
}

function setActiveTabInternal(next) {
  const value = typeof next === 'function' ? next(state.activeTab) : next
  if (!value || !RAIL_TABS.includes(value)) return
  if (value === state.activeTab) return
  state = { ...state, activeTab: value }
  persistTab(value)
  emit()
}

function setSuppressedInternal(next) {
  const value = typeof next === 'function' ? next(state.suppressed) : !!next
  if (value === state.suppressed) return
  state = { ...state, suppressed: value }
  emit()
}

/**
 * useRightRail
 *
 * Shared, module-scoped store. Multiple call sites observe the same `open`,
 * `activeTab`, and `suppressed` values, so a page can `setSuppressed(true)`
 * while the rail's own copy of the hook sees the change.
 */
export function useRightRail() {
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

  const snap = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)

  // Stable setter identity so consumer effects don't refire on every emit.
  const [setters] = useState(() => ({
    setOpen: (next) => setOpenInternal(next),
    setActiveTab: (next) => setActiveTabInternal(next),
    setSuppressed: (next) => setSuppressedInternal(next),
    toggleOpen: () => setOpenInternal((v) => !v),
  }))

  const setOpen = useCallback(setters.setOpen, [setters])
  const setActiveTab = useCallback(setters.setActiveTab, [setters])
  const setSuppressed = useCallback(setters.setSuppressed, [setters])
  const toggleOpen = useCallback(setters.toggleOpen, [setters])

  return {
    open: snap.open,
    activeTab: snap.activeTab,
    suppressed: snap.suppressed,
    setOpen,
    setActiveTab,
    setSuppressed,
    toggleOpen,
  }
}

export default useRightRail
