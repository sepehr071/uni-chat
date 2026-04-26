import { useState } from 'react'
import { X, ChevronRight, GitBranch, Paperclip, BarChart2, Plus, Check, Bot } from 'lucide-react'
import { cn } from '../../utils/cn'
import ConfigSelector from './ConfigSelector'
import { Popover, PopoverTrigger, PopoverContent } from '../ui/popover'

// ────────────────────────────────────────────────────────────
// Sub-components
// ────────────────────────────────────────────────────────────

function RailSection({ title, count, children, className }) {
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <div className="flex items-center gap-1.5 px-4 pt-3 pb-1">
        <span className="text-xs font-semibold text-foreground-tertiary tracking-wider">
          {title}
          {count != null && (
            <span className="ml-1 text-foreground-tertiary/60">({count})</span>
          )}
        </span>
      </div>
      <div className="px-3">{children}</div>
    </div>
  )
}

function BranchRow({ branch, isActive, onClick }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-2 w-full px-2 py-1.5 rounded-md text-xs transition-colors text-left',
        isActive
          ? 'bg-accent/15 text-accent'
          : 'text-foreground-secondary hover:bg-background-tertiary hover:text-foreground'
      )}
    >
      <GitBranch className="h-3 w-3 flex-shrink-0" />
      <span className="truncate flex-1">{branch.name}</span>
      {isActive && <Check className="h-3 w-3 flex-shrink-0" />}
    </button>
  )
}

function StatGrid({ stats, messages = [], conversation }) {
  const turnCount = messages.filter((m) => m.role === 'user').length
  const totalTokens = messages.reduce((sum, m) => sum + (m.token_count || m.tokens || 0), 0)

  const startedAt = conversation?.created_at
    ? new Date(conversation.created_at).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—'

  const items = [
    { label: 'Tokens', value: stats?.tokens ?? (totalTokens > 0 ? totalTokens.toLocaleString() : '—') },
    { label: 'Turns', value: stats?.turns ?? turnCount },
    { label: 'Cost', value: stats?.cost ?? '—' },
    { label: 'Started', value: stats?.started ?? startedAt },
  ]

  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-2">
      {items.map(({ label, value }) => (
        <div key={label} className="flex flex-col gap-0.5">
          <span className="text-[10px] text-foreground-tertiary uppercase tracking-wide">{label}</span>
          <span className="text-xs font-mono text-foreground">{value}</span>
        </div>
      ))}
    </div>
  )
}

// ────────────────────────────────────────────────────────────
// Main component
// ────────────────────────────────────────────────────────────

export default function ContextRail({
  conversation,
  configs = [],
  selectedConfig,
  onSelectConfig,
  branches = [],
  activeBranch,
  onSwitchBranch,
  onCreateBranch,
  attachments = [],
  stats,
  messages = [],
  onClose,
}) {
  const [showConfigSelector, setShowConfigSelector] = useState(false)

  return (
    <div className="relative flex flex-col w-[280px] min-w-[280px] border-l border-border bg-background-secondary overflow-y-auto">
      {/* Rail header */}
      <div className="flex items-center justify-between px-4 h-12 min-h-[48px] border-b border-border shrink-0">
        <span className="text-xs font-semibold text-foreground-tertiary tracking-widest">CONTEXT</span>
        <button
          onClick={onClose}
          className="p-1 rounded-md text-foreground-tertiary hover:bg-background-tertiary hover:text-foreground transition-colors"
          title="Close rail"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* ── ASSISTANT ── */}
      <RailSection title="ASSISTANT">
        <Popover open={showConfigSelector} onOpenChange={setShowConfigSelector}>
          <PopoverTrigger asChild>
            <button
              className="flex items-center gap-2 w-full px-2 py-2 rounded-md hover:bg-background-tertiary transition-colors text-left group"
            >
              <div
                className="h-7 w-7 rounded-lg flex items-center justify-center text-sm flex-shrink-0"
                style={{ backgroundColor: '#5c9aed20', color: '#5c9aed' }}
              >
                {selectedConfig?.avatar?.type === 'emoji'
                  ? selectedConfig.avatar.value
                  : <Bot className="h-4 w-4" />}
              </div>
              <div className="flex flex-col min-w-0 flex-1">
                <span className="text-xs font-medium text-foreground truncate">
                  {selectedConfig?.name || 'No assistant selected'}
                </span>
                {selectedConfig?.model_id && (
                  <span className="text-[10px] font-mono text-foreground-tertiary truncate">
                    {selectedConfig.model_id}
                  </span>
                )}
              </div>
              <ChevronRight className="h-3 w-3 text-foreground-tertiary group-hover:text-foreground flex-shrink-0" />
            </button>
          </PopoverTrigger>
          <PopoverContent
            side="bottom"
            align="start"
            sideOffset={4}
            className="p-0 w-auto border-0 bg-transparent shadow-none"
          >
            <ConfigSelector
              configs={configs}
              selectedConfigId={selectedConfig?._id}
              onSelect={(configId) => {
                onSelectConfig?.(configId)
                setShowConfigSelector(false)
              }}
              onClose={() => setShowConfigSelector(false)}
            />
          </PopoverContent>
        </Popover>
      </RailSection>

      {/* ── BRANCHES ── */}
      <RailSection title="BRANCHES" count={branches.length}>
        <div className="flex flex-col gap-0.5">
          {branches.map((branch) => (
            <BranchRow
              key={branch.id}
              branch={branch}
              isActive={branch.id === activeBranch?.id}
              onClick={() => onSwitchBranch?.(branch.id)}
            />
          ))}
          {branches.length === 0 && (
            <p className="text-xs text-foreground-tertiary px-2 py-1">No branches yet.</p>
          )}
        </div>
        <button
          onClick={onCreateBranch}
          className="flex items-center gap-1.5 px-2 py-1.5 mt-1 text-xs text-accent hover:text-accent/80 transition-colors"
        >
          <Plus className="h-3 w-3" />
          New branch
        </button>
      </RailSection>

      {/* ── ATTACHED ── */}
      <RailSection title="ATTACHED" count={attachments.length || undefined}>
        {attachments.length > 0 ? (
          <div className="flex flex-col gap-1">
            {attachments.map((file, i) => (
              <div
                key={i}
                className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-background-tertiary"
              >
                <Paperclip className="h-3 w-3 text-foreground-tertiary flex-shrink-0" />
                <span className="text-xs text-foreground-secondary truncate">
                  {file.name || file.filename || 'Attachment'}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-foreground-tertiary px-2 py-1">No files this conversation.</p>
        )}
      </RailSection>

      {/* ── STATS ── */}
      <RailSection title="STATS" className="pb-4">
        <div className="px-2">
          <StatGrid stats={stats} messages={messages} conversation={conversation} />
        </div>
      </RailSection>
    </div>
  )
}
