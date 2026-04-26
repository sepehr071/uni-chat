import {
  MessageSquare,
  History,
  Settings,
  Sliders,
  LayoutDashboard,
  Sparkles,
  Users,
  FileText,
  Shield,
  LayoutGrid,
  Image,
  GitBranch,
  Code2,
  BookMarked,
  Scale,
  Bot,
} from 'lucide-react'

export const NAV_SECTIONS = [
  {
    id: 'pinned',
    label: 'Pinned',
    defaultExpanded: true,
    items: [
      { to: '/chat',     icon: MessageSquare, label: 'Chat' },
      { to: '/workflow', icon: GitBranch,     label: 'Workflow' },
      { to: '/arena',    icon: LayoutGrid,    label: 'Arena' },
    ],
  },
  {
    id: 'create',
    label: 'Create',
    defaultExpanded: true,
    items: [
      { to: '/image-studio',   icon: Image, label: 'Image Studio' },
      { to: '/debate',         icon: Scale, label: 'Debate' },
      { to: '/automate-agent', icon: Bot,   label: 'Automate Agent' },
    ],
  },
  {
    id: 'library',
    label: 'Library',
    defaultExpanded: false,
    items: [
      { to: '/configs',       icon: Sliders,    label: 'Assistants' },
      { to: '/gallery',       icon: Sparkles,   label: 'Gallery' },
      { to: '/chat-history',  icon: History,    label: 'Chat History' },
      { to: '/image-history', icon: Image,      label: 'Image History' },
      { to: '/my-canvases',   icon: Code2,      label: 'My Canvases' },
      { to: '/knowledge',     icon: BookMarked, label: 'Knowledge Vault' },
    ],
  },
  {
    id: 'home',
    label: 'Home',
    defaultExpanded: true,
    items: [
      { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    ],
  },
  {
    id: 'settings',
    label: 'Settings',
    defaultExpanded: true,
    items: [
      { to: '/settings', icon: Settings, label: 'Settings' },
    ],
  },
]

export const ADMIN_ITEMS = [
  { to: '/admin',           icon: LayoutDashboard, label: 'Admin' },
  { to: '/admin/users',     icon: Users,           label: 'Users' },
  { to: '/admin/templates', icon: FileText,        label: 'Templates' },
  { to: '/admin/audit',     icon: Shield,          label: 'Audit Log' },
]

// Flat list of every nav item — useful for command palette search.
export const ALL_NAV_ITEMS = [
  ...NAV_SECTIONS.flatMap((s) => s.items),
]
