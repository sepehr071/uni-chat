import { MoreHorizontal, MessageSquare, Database, Clock, Star, Users } from 'lucide-react'
import Ptile from '@/components/teams/Ptile'
import AvatarStack from '@/components/teams/AvatarStack'
import { cn } from '@/lib/utils'

function formatRelative(date) {
  if (!date) return '—'
  const then = new Date(date)
  if (isNaN(then.getTime())) return '—'
  const diffMs = Date.now() - then.getTime()
  const sec = Math.max(0, Math.floor(diffMs / 1000))
  if (sec < 60) return `${sec}s ago`
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.floor(hr / 24)
  if (day < 7) return `${day}d ago`
  const wk = Math.floor(day / 7)
  if (wk < 5) return `${wk}w ago`
  const mo = Math.floor(day / 30)
  if (mo < 12) return `${mo}mo ago`
  const yr = Math.floor(day / 365)
  return `${yr}y ago`
}

/**
 * ProjectCard — refined-variant card matching design parts/projects-index.jsx:264.
 *
 * @param {object} p Project payload (name, color, icon, description, pinned, tags, last_activity_at,
 *                   member_count, chats_count, knowledge_count, group, workspace_name, _id).
 * @param {(p: object) => void} onPin Toggle pin handler. Receives project; should flip pinned.
 * @param {(p: object) => void} onClick Open handler; defaults to noop.
 * @param {(p: object) => void} onMenu Optional kebab handler.
 * @param {Array<{name?: string, hue?: number, avatar_url?: string}>} members
 */
export default function ProjectCard({ p, onPin, onClick, onMenu, members = [] }) {
  const memberCount = p.member_count ?? members.length ?? 0
  const chats = (p.chats_count ?? p.chats ?? 0)
  const knowledge = p.knowledge_count ?? p.knowledge ?? 0
  const groupLabel = p.group || p.workspace_name || ''

  return (
    <div
      onClick={() => onClick?.(p)}
      className={cn(
        'relative cursor-pointer rounded-xl border border-line bg-bg-1 p-4',
        'transition-colors hover:border-line-3 hover:bg-bg-2',
      )}
    >
      {/* Top row */}
      <div className="flex items-start gap-3 mb-3">
        <Ptile
          color={p.color || '#5c9aed'}
          icon={p.icon}
          letter={(p.name || '?').charAt(0).toUpperCase()}
          size="md"
        />
        <div className="flex-1 min-w-0 flex flex-col gap-0.5">
          <div className="flex items-center gap-1.5 min-w-0">
            <h3 className="m-0 truncate text-[14px] font-semibold text-fg-0 leading-tight">
              {p.name}
            </h3>
            {p.pinned && (
              <button
                type="button"
                aria-label="Unpin project"
                onClick={(e) => {
                  e.stopPropagation()
                  onPin?.(p)
                }}
                className="flex-shrink-0 inline-flex items-center justify-center rounded p-0.5 hover:bg-bg-3"
              >
                <Star className="h-3 w-3 text-warn fill-warn" />
              </button>
            )}
            {!p.pinned && onPin && (
              <button
                type="button"
                aria-label="Pin project"
                onClick={(e) => {
                  e.stopPropagation()
                  onPin?.(p)
                }}
                className="flex-shrink-0 inline-flex items-center justify-center rounded p-0.5 opacity-0 hover:bg-bg-3 group-hover:opacity-100 hover:opacity-100"
              >
                <Star className="h-3 w-3 text-fg-3" />
              </button>
            )}
          </div>
          {p.description && (
            <span className="truncate text-[11px] text-fg-3">{p.description}</span>
          )}
        </div>
        <button
          type="button"
          aria-label="Project actions"
          onClick={(e) => {
            e.stopPropagation()
            onMenu?.(p)
          }}
          className="flex-shrink-0 inline-flex items-center justify-center rounded p-1 text-fg-3 hover:bg-bg-3 hover:text-fg-1"
        >
          <MoreHorizontal className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Meta strip */}
      <div className="flex items-center gap-3 mb-3 text-[11px] text-fg-3">
        <span className="inline-flex items-center gap-1">
          <MessageSquare className="h-3 w-3" />
          {Number(chats).toLocaleString()}
        </span>
        <span className="inline-flex items-center gap-1">
          <Database className="h-3 w-3" />
          {Number(knowledge).toLocaleString()}
        </span>
        <span className="flex-1" />
        <span className="inline-flex items-center gap-1">
          <Clock className="h-3 w-3" />
          {formatRelative(p.last_activity_at)}
        </span>
      </div>

      {/* Tags */}
      {p.tags?.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-3">
          {p.tags.map((t) => (
            <span
              key={t}
              className="inline-flex items-center rounded-full border border-line-2 bg-bg-3 px-1.5 py-0.5 font-mono text-[9.5px] text-fg-2"
            >
              #{t}
            </span>
          ))}
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between pt-3 border-t border-line">
        <div className="flex items-center gap-2 min-w-0">
          <AvatarStack users={members} max={4} size="sm" />
          <span className="text-[11px] text-fg-3">{memberCount}</span>
        </div>
        {groupLabel && (
          <span className="inline-flex items-center gap-1 rounded-full border border-line-2 bg-transparent px-2 py-0.5 text-[10.5px] text-fg-2">
            <Users className="h-3 w-3" />
            <span className="truncate max-w-[120px]">{groupLabel}</span>
          </span>
        )}
      </div>
    </div>
  )
}
