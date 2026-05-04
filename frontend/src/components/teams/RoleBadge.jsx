import { Shield, ShieldCheck, CreditCard, Pencil, Eye, ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils'

// Mirrors design source-of-truth: parts/shell.jsx ROLE_STYLES.
// Tones intentionally aligned with .badge-* classes from the design package.
const ROLE_STYLES = {
  owner: {
    label: 'Owner',
    Icon: Shield,
    className:
      'bg-violet/15 text-violet border border-violet/30',
  },
  admin: {
    label: 'Admin',
    Icon: ShieldCheck,
    className:
      'bg-blue-500/15 text-blue-300 border border-blue-500/30',
  },
  'billing-admin': {
    label: 'Billing admin',
    Icon: CreditCard,
    className:
      'bg-amber-500/15 text-amber-300 border border-amber-500/30',
  },
  editor: {
    label: 'Editor',
    Icon: Pencil,
    className:
      'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30',
  },
  viewer: {
    label: 'Viewer',
    Icon: Eye,
    className:
      'bg-zinc-500/15 text-zinc-400 border border-zinc-500/30',
  },
  guest: {
    label: 'Guest',
    Icon: ExternalLink,
    className:
      'bg-pink/15 text-pink border border-pink/30',
  },
}

export default function RoleBadge({ role, className }) {
  const style = ROLE_STYLES[role] || ROLE_STYLES.viewer
  const { Icon, label } = style
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
