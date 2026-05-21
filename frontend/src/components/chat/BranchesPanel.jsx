import { useTranslation } from 'react-i18next'
import { Plus } from 'lucide-react'
import { useRailData } from '../../context/RailDataContext'
import { RailSection, BranchRow, StatGrid } from './_rail-helpers'

/**
 * Branches tab body — branches list + stats.
 *
 * No props; reads from RailDataContext which ChatPage publishes into. When
 * used outside chat (or before a conversation exists), the context returns
 * empty defaults so the panel renders its empty state gracefully.
 */
export default function BranchesPanel() {
  const { t } = useTranslation('chat')
  const {
    conversation,
    branches,
    activeBranch,
    onSwitchBranch,
    onCreateBranch,
    stats,
    messages,
  } = useRailData()

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      {/* ── BRANCHES ── */}
      <RailSection title={t('contextRail.branches')} count={branches.length}>
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
            <p className="text-xs text-foreground-tertiary px-2 py-1">{t('contextRail.noBranches')}</p>
          )}
        </div>
        {onCreateBranch && (
          <button
            onClick={onCreateBranch}
            className="flex items-center gap-1.5 px-2 py-1.5 mt-1 text-xs text-accent hover:text-accent/80 transition-colors"
          >
            <Plus className="h-3 w-3" />
            {t('contextRail.newBranch')}
          </button>
        )}
      </RailSection>

      {/* ── STATS ── */}
      <RailSection title={t('contextRail.stats')} className="pb-4">
        <div className="px-2">
          <StatGrid stats={stats} messages={messages} conversation={conversation} />
        </div>
      </RailSection>
    </div>
  )
}
