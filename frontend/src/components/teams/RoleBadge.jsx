import { Shield, ShieldCheck, CreditCard, Pencil, Eye, ExternalLink } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'

// Mirrors design source-of-truth: parts/shell.jsx ROLE_STYLES.
// Tones intentionally aligned with .badge-* classes from the design package.
const ROLE_STYLES = {
  owner: {
    labelKey: 'roles.owner',
    Icon: Shield,
    className:
      'bg-violet/15 text-violet border border-violet/30',
  },
  admin: {
    labelKey: 'roles.admin',
    Icon: ShieldCheck,
    className:
      'bg-blue-500/15 text-blue-300 border border-blue-500/30',
  },
  'billing-admin': {
    labelKey: 'roles.billingAdmin',
    Icon: CreditCard,
    className:
      'bg-amber-500/15 text-amber-300 border border-amber-500/30',
  },
  editor: {
    labelKey: 'roles.editor',
    Icon: Pencil,
    className:
      'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30',
  },
  viewer: {
    labelKey: 'roles.viewer',
    Icon: Eye,
    className:
      'bg-zinc-500/15 text-zinc-400 border border-zinc-500/30',
  },
  guest: {
    labelKey: 'roles.guest',
    Icon: ExternalLink,
    className:
      'bg-pink/15 text-pink border border-pink/30',
  },
}

export default function RoleBadge({ role, className }) {
  const { t } = useTranslation('projects')
  const style = ROLE_STYLES[role] || ROLE_STYLES.viewer
  const { Icon, labelKey } = style
  const label = t(labelKey)
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-medium leading-tight',
        style.className,
        className,
      )}
    >
      <Icon className="h-3 w-3" />
      {label}
    </span>
  )
}
