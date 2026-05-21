import { createContext, useContext, useMemo } from 'react'

/**
 * RailDataContext
 *
 * ChatPage (and any future page that wants to feed the right rail panels)
 * publishes its branches / attachments / stats / conversation / messages
 * data here. `BranchesPanel`, `AttachmentsPanel`, and `CodeCanvasPanel`
 * consume the context so they stay tab-body shaped (no props) and can be
 * mounted from `MainLayout` without prop drilling.
 *
 * Outside a `<RailDataProvider>`, `useRailData()` returns a sane empty
 * default — panels render their empty state rather than crashing.
 */

const EMPTY = {
  conversation: null,
  configs: [],
  selectedConfig: null,
  selectedConfigId: null,
  onSelectConfig: null,
  branches: [],
  activeBranch: null,
  onSwitchBranch: null,
  onCreateBranch: null,
  attachments: [],
  stats: null,
  messages: [],
  // Code Canvas — owned by ChatPage so a /chat-side `/canvas` slash or HTML
  // block "Run" press can push code into the rail's Canvas tab.
  codeCanvasOpen: false,
  codeCanvasCode: { html: '', css: '', js: '' },
  onCloseCanvas: null,
}

const RailDataContext = createContext(EMPTY)

export function RailDataProvider({ value, children }) {
  // Stabilise reference so panels using `useRailData()` don't re-render on
  // every parent re-render unless an underlying field actually changed.
  const merged = useMemo(() => ({ ...EMPTY, ...(value || {}) }), [value])
  return <RailDataContext.Provider value={merged}>{children}</RailDataContext.Provider>
}

export function useRailData() {
  return useContext(RailDataContext)
}

export default RailDataContext
