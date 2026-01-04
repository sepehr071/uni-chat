import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  MessageSquarePlus,
  Search,
  LayoutDashboard,
  History,
  Settings,
  Sparkles,
  FolderClosed,
  ChevronRight,
  ChevronDown,
  MoreHorizontal,
  X,
  PanelLeftClose,
  Compass,
  Bot,
  Shield,
} from 'lucide-react'
import { chatService, folderService } from '../../services/chatService'
import { useAuth } from '../../context/AuthContext'
import { cn } from '../../utils/cn'

export default function Sidebar({ isOpen, isMobileOpen, onClose, onToggle }) {
  const location = useLocation()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedFolders, setExpandedFolders] = useState(new Set())

  // Fetch conversations
  const { data: conversationsData } = useQuery({
    queryKey: ['conversations'],
    queryFn: () => chatService.getConversations({ limit: 50 }),
  })

  // Fetch folders
  const { data: foldersData } = useQuery({
    queryKey: ['folders'],
    queryFn: () => folderService.getFolders(),
  })

  const conversations = conversationsData?.conversations || []
  const folders = foldersData?.folders || []

  const handleNewChat = () => {
    navigate('/chat')
    onClose()
  }

  const toggleFolder = (folderId) => {
    setExpandedFolders(prev => {
      const next = new Set(prev)
      if (next.has(folderId)) {
        next.delete(folderId)
      } else {
        next.add(folderId)
      }
      return next
    })
  }

  const filteredConversations = conversations.filter(conv =>
    conv.title?.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const sidebarClasses = cn(
    'fixed lg:relative inset-y-0 left-0 z-50 flex flex-col bg-background-secondary border-r border-border transition-all duration-300',
    isOpen ? 'w-72' : 'w-0 lg:w-16',
    isMobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
  )

  return (
    <aside className={sidebarClasses}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border">
        {isOpen && (
          <Link to="/chat" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent">
              <Sparkles className="h-4 w-4 text-white" />
            </div>
            <span className="font-semibold text-foreground">Uni-Chat</span>
          </Link>
        )}
        <button
          onClick={onToggle}
          className="p-2 rounded-lg text-foreground-secondary hover:bg-background-tertiary hover:text-foreground hidden lg:flex"
        >
          <PanelLeftClose className={cn('h-5 w-5 transition-transform', !isOpen && 'rotate-180')} />
        </button>
        <button
          onClick={onClose}
          className="p-2 rounded-lg text-foreground-secondary hover:bg-background-tertiary lg:hidden"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {isOpen && (
        <>
          {/* New Chat Button */}
          <div className="p-3">
            <button
              onClick={handleNewChat}
              className="btn btn-primary w-full"
            >
              <MessageSquarePlus className="h-4 w-4" />
              New Chat
            </button>
          </div>

          {/* Search */}
          <div className="px-3 pb-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-foreground-tertiary" />
              <input
                type="text"
                placeholder="Search conversations..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="input pl-9 py-2 text-sm"
              />
            </div>
          </div>

          {/* Conversations List */}
          <div className="flex-1 overflow-y-auto px-2 pb-2">
            {/* Folders */}
            {folders.map(folder => (
              <FolderItem
                key={folder._id}
                folder={folder}
                conversations={filteredConversations.filter(c => c.folder_id === folder._id)}
                isExpanded={expandedFolders.has(folder._id)}
                onToggle={() => toggleFolder(folder._id)}
                currentPath={location.pathname}
                onClose={onClose}
              />
            ))}

            {/* Unfiled Conversations */}
            <div className="space-y-0.5 mt-2">
              {filteredConversations
                .filter(c => !c.folder_id)
                .map(conv => (
                  <ConversationItem
                    key={conv._id}
                    conversation={conv}
                    isActive={location.pathname === `/chat/${conv._id}`}
                    onClose={onClose}
                  />
                ))}
            </div>
          </div>

          {/* Navigation Links */}
          <div className="border-t border-border p-2 space-y-0.5">
            <NavLink to="/dashboard" icon={LayoutDashboard} label="Dashboard" onClose={onClose} />
            <NavLink to="/history" icon={History} label="History" onClose={onClose} />
            <NavLink to="/configs" icon={Bot} label="My Configs" onClose={onClose} />
            <NavLink to="/gallery" icon={Compass} label="Gallery" onClose={onClose} />
            <NavLink to="/settings" icon={Settings} label="Settings" onClose={onClose} />
            {user?.role === 'admin' && (
              <NavLink to="/admin" icon={Shield} label="Admin" onClose={onClose} />
            )}
          </div>
        </>
      )}

      {/* Collapsed state */}
      {!isOpen && (
        <div className="flex-col items-center py-4 space-y-2 hidden lg:flex">
          <button
            onClick={handleNewChat}
            className="p-3 rounded-lg text-foreground-secondary hover:bg-background-tertiary hover:text-foreground"
            title="New Chat"
          >
            <MessageSquarePlus className="h-5 w-5" />
          </button>
          <CollapsedNavLink to="/dashboard" icon={LayoutDashboard} title="Dashboard" />
          <CollapsedNavLink to="/configs" icon={Bot} title="My Configs" />
          <CollapsedNavLink to="/gallery" icon={Compass} title="Gallery" />
          <CollapsedNavLink to="/settings" icon={Settings} title="Settings" />
          {user?.role === 'admin' && (
            <CollapsedNavLink to="/admin" icon={Shield} title="Admin" />
          )}
        </div>
      )}
    </aside>
  )
}

function FolderItem({ folder, conversations, isExpanded, onToggle, currentPath, onClose }) {
  return (
    <div>
      <button
        onClick={onToggle}
        className="flex items-center gap-2 w-full px-2 py-1.5 rounded-lg text-sm text-foreground-secondary hover:bg-background-tertiary hover:text-foreground"
      >
        {isExpanded ? (
          <ChevronDown className="h-4 w-4" />
        ) : (
          <ChevronRight className="h-4 w-4" />
        )}
        <FolderClosed className="h-4 w-4" style={{ color: folder.color }} />
        <span className="truncate flex-1 text-left">{folder.name}</span>
        <span className="text-xs text-foreground-tertiary">{conversations.length}</span>
      </button>
      {isExpanded && (
        <div className="ml-4 pl-2 border-l border-border space-y-0.5 mt-0.5">
          {conversations.map(conv => (
            <ConversationItem
              key={conv._id}
              conversation={conv}
              isActive={currentPath === `/chat/${conv._id}`}
              onClose={onClose}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function ConversationItem({ conversation, isActive, onClose }) {
  const navigate = useNavigate()

  return (
    <button
      onClick={() => {
        navigate(`/chat/${conversation._id}`)
        onClose()
      }}
      className={cn(
        'flex items-center gap-2 w-full px-2 py-1.5 rounded-lg text-sm transition-colors group',
        isActive
          ? 'bg-background-tertiary text-foreground'
          : 'text-foreground-secondary hover:bg-background-tertiary hover:text-foreground'
      )}
    >
      <MessageSquarePlus className="h-4 w-4 flex-shrink-0" />
      <span className="truncate flex-1 text-left">{conversation.title || 'New conversation'}</span>
      <button
        onClick={(e) => {
          e.stopPropagation()
          // TODO: Show conversation options menu
        }}
        className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-background-elevated"
      >
        <MoreHorizontal className="h-3 w-3" />
      </button>
    </button>
  )
}

function NavLink({ to, icon: Icon, label, onClose }) {
  const location = useLocation()
  const isActive = location.pathname === to || location.pathname.startsWith(to + '/')

  return (
    <Link
      to={to}
      onClick={onClose}
      className={cn(
        'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
        isActive
          ? 'bg-background-tertiary text-foreground'
          : 'text-foreground-secondary hover:bg-background-tertiary hover:text-foreground'
      )}
    >
      <Icon className="h-4 w-4" />
      {label}
    </Link>
  )
}

function CollapsedNavLink({ to, icon: Icon, title }) {
  const location = useLocation()
  const isActive = location.pathname === to || location.pathname.startsWith(to + '/')

  return (
    <Link
      to={to}
      title={title}
      className={cn(
        'p-3 rounded-lg transition-colors',
        isActive
          ? 'bg-background-tertiary text-foreground'
          : 'text-foreground-secondary hover:bg-background-tertiary hover:text-foreground'
      )}
    >
      <Icon className="h-5 w-5" />
    </Link>
  )
}
