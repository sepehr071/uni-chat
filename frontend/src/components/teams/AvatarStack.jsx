import { cn } from '@/lib/utils'

const SIZE_CLASSES = {
  sm: 'w-5 h-5 text-[9px]',
  md: 'w-7 h-7 text-[11px]',
  lg: 'w-10 h-10 text-sm',
}

function getInitials(name) {
  if (!name) return '??'
  const parts = name.trim().split(/\s+/).slice(0, 2)
  return parts.map((p) => p[0] || '').join('').toUpperCase() || '??'
}

function avatarBg(hue) {
  if (hue == null) return 'hsl(220, 40%, 32%)'
  return `hsl(${hue}, 40%, 32%)`
}

/**
 * AvatarStack — overlapping circular avatars with overflow chip.
 * @param {Array<{name?: string, hue?: number, avatar_url?: string}>} users
 * @param {number} max
 * @param {'sm' | 'md' | 'lg'} size
 * @param {string} className
 */
export default function AvatarStack({ users = [], max = 4, size = 'sm', className }) {
  const sizeCls = SIZE_CLASSES[size] || SIZE_CLASSES.sm
  const shown = users.slice(0, max)
  const overflow = users.length - shown.length

  return (
    <div className={cn('inline-flex items-center', className)}>
      {shown.map((u, idx) => {
        const initials = getInitials(u.name)
        return (
          <span
            key={`${u.id || u.name || 'u'}-${idx}`}
            className={cn(
              'inline-flex items-center justify-center rounded-full font-semibold text-white ring-2 ring-bg-1 overflow-hidden',
              sizeCls,
              idx > 0 && '-ml-2',
            )}
            style={
              u.avatar_url
                ? undefined
                : { background: avatarBg(u.hue) }
            }
            title={u.name}
          >
            {u.avatar_url ? (
              <img
                src={u.avatar_url}
                alt={u.name || ''}
                className="w-full h-full object-cover"
              />
            ) : (
              initials
            )}
          </span>
        )
      })}
      {overflow > 0 && (
        <span
          className={cn(
            'inline-flex items-center justify-center rounded-full font-semibold ring-2 ring-bg-1 bg-bg-3 text-fg-2 -ml-2',
            sizeCls,
          )}
          title={`${overflow} more`}
        >
          +{overflow}
        </span>
      )}
    </div>
  )
}
