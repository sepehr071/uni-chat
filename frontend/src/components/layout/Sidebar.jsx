import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  DndContext,
  DragOverlay,
  useSensor,
  useSensors,
  PointerSensor,
  closestCenter,
} from '@dnd-kit/core'
import { useDraggable, useDroppable } from '@dnd-kit/core'
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
  GripVertical,
} from 'lucide-react'
import { chatService, folderService } from '../../services/chatService'
import { useAuth } from '../../context/AuthContext'
import { cn } from '../../utils/cn'
import toast from 'react-hot-toast'

export default function Sidebar({ isOpen, isMobileOpen, onClose, onToggle }) {
  const location = useLocation()
  const navigate = useNavigate()
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedFolders, setExpandedFolders] = useState(new Set())
  const [activeConversation, setActiveConversation] = useState(null)

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  )

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

  // Move conversation to folder mutation
  const moveConversationMutation = useMutation({
    mutationFn: ({ conversationId, folderId }) =>
      chatService.updateConversation(conversationId, { folder_id: folderId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] })
      queryClient.invalidateQueries({ queryKey: ['folders'] })
      toast.success('Conversation moved')
    },
    onError: () => {
      toast.error('Failed to move conversation')
    },
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

  const handleDragStart = (event) => {
    const { active } = event
    const conversation = conversations.find(c => c._id === active.id)
    setActiveConversation(conversation)
  }

  const handleDragEnd = (event) => {
    const { active, over } = event
    setActiveConversation(null)

    if (!over) return

    const conversationId = active.id
    const targetId = over.id

    // Determine the target folder
    let folderId = null
    if (targetId === 'unfiled') {
      folderId = null
    } else if (targetId.startsWith('folder-')) {
      folderId = targetId.replace('folder-', '')
    } else {
      return
    }

    // Find the conversation
    const conversation = conversations.find(c => c._id === conversationId)
    if (!conversation) return

    // Skip if already in this folder
    if ((conversation.folder_id || null) === folderId) return

    moveConversationMutation.mutate({ conversationId, folderId })
  }

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

          {/* Conversations List with DnD */}
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <div className="flex-1 overflow-y-auto px-2 pb-2">
              {/* Folders */}
              {folders.map(folder => (
                <DroppableFolderItem
                  key={folder._id}
                  folder={folder}
                  conversations={filteredConversations.filter(c => c.folder_id === folder._id)}
                  isExpanded={expandedFolders.has(folder._id)}
                  onToggle={() => toggleFolder(folder._id)}
                  currentPath={location.pathname}
                  onClose={onClose}
                />
              ))}

              {/* Unfiled Conversations Drop Zone */}
              <DroppableUnfiledSection
                conversations={filteredConversations.filter(c => !c.folder_id)}
                currentPath={location.pathname}
                onClose={onClose}
              />
            </div>

            {/* Drag Overlay */}
            <DragOverlay>
              {activeConversation && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-background-elevated shadow-elevated text-sm text-foreground border border-border">
                  <GripVertical className="h-4 w-4 text-foreground-tertiary" />
                  <MessageSquarePlus className="h-4 w-4 flex-shrink-0" />
                  <span className="truncate">{activeConversation.title || 'New conversation'}</span>
                </div>
              )}
            </DragOverlay>
          </DndContext>

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

function DroppableFolderItem({ folder, conversations, isExpanded, onToggle, currentPath, onClose }) {
  const { isOver, setNodeRef } = useDroppable({
    id: `folder-${folder._id}`,
  })

  return (
    <div ref={setNodeRef}>
      <button
        onClick={onToggle}
        className={cn(
          'flex items-center gap-2 w-full px-2 py-1.5 rounded-lg text-sm transition-colors',
          isOver
            ? 'bg-accent/20 text-foreground ring-2 ring-accent/50'
            : 'text-foreground-secondary hover:bg-background-tertiary hover:text-foreground'
        )}
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
            <DraggableConversationItem
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

function DroppableUnfiledSection({ conversations, currentPath, onClose }) {
  const { isOver, setNodeRef } = useDroppable({
    id: 'unfiled',
  })

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'space-y-0.5 mt-2 p-1 rounded-lg transition-colors',
        isOver && 'bg-accent/10 ring-2 ring-accent/30'
      )}
    >
      {conversations.length > 0 && (
        <div className="px-2 py-1 text-xs text-foreground-tertiary font-medium">
          Conversations
        </div>
      )}
      {conversations.map(conv => (
        <DraggableConversationItem
          key={conv._id}
          conversation={conv}
          isActive={currentPath === `/chat/${conv._id}`}
          onClose={onClose}
        />
      ))}
    </div>
  )
}

function DraggableConversationItem({ conversation, isActive, onClose }) {
  const navigate = useNavigate()
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    isDragging,
  } = useDraggable({
    id: conversation._id,
  })

  const style = transform ? {
    transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
  } : undefined

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'flex items-center gap-1 w-full rounded-lg text-sm transition-colors group',
        isDragging && 'opacity-50',
        isActive
          ? 'bg-background-tertiary text-foreground'
          : 'text-foreground-secondary hover:bg-background-tertiary hover:text-foreground'
      )}
    >
      {/* Drag Handle */}
      <button
        {...listeners}
        {...attributes}
        className="p-1 cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 touch-none"
      >
        <GripVertical className="h-3 w-3" />
      </button>

      {/* Conversation Button */}
      <button
        onClick={() => {
          navigate(`/chat/${conversation._id}`)
          onClose()
        }}
        className="flex items-center gap-2 flex-1 px-1 py-1.5 min-w-0"
      >
        <MessageSquarePlus className="h-4 w-4 flex-shrink-0" />
        <span className="truncate flex-1 text-left">{conversation.title || 'New conversation'}</span>
      </button>

      {/* Options Menu */}
      <button
        onClick={(e) => {
          e.stopPropagation()
          // TODO: Show conversation options menu
        }}
        className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-background-elevated"
      >
        <MoreHorizontal className="h-3 w-3" />
      </button>
    </div>
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
