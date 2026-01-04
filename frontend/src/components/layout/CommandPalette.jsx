import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  Search,
  MessageSquare,
  Bot,
  Settings,
  LayoutDashboard,
  History,
  Compass,
  Shield,
  Plus,
  X,
} from 'lucide-react'
import { chatService, configService } from '../../services/chatService'
import { cn } from '../../utils/cn'
import { useAuth } from '../../context/AuthContext'

export default function CommandPalette({ isOpen, onClose }) {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef(null)

  // Fetch recent conversations for search
  const { data: conversationsData } = useQuery({
    queryKey: ['conversations-search', query],
    queryFn: () => query
      ? chatService.searchConversations(query)
      : chatService.getConversations({ limit: 5 }),
    enabled: isOpen,
  })

  // Fetch configs for search
  const { data: configsData } = useQuery({
    queryKey: ['configs-palette'],
    queryFn: () => configService.getConfigs(),
    enabled: isOpen,
  })

  const conversations = conversationsData?.conversations || []
  const configs = configsData?.configs || []

  // Build command list
  const commands = [
    // Navigation commands
    { id: 'new-chat', icon: Plus, label: 'New conversation', action: () => navigate('/chat') },
    { id: 'dashboard', icon: LayoutDashboard, label: 'Go to Dashboard', action: () => navigate('/dashboard') },
    { id: 'history', icon: History, label: 'Go to History', action: () => navigate('/history') },
    { id: 'configs', icon: Bot, label: 'Go to Configs', action: () => navigate('/configs') },
    { id: 'gallery', icon: Compass, label: 'Go to Gallery', action: () => navigate('/gallery') },
    { id: 'settings', icon: Settings, label: 'Go to Settings', action: () => navigate('/settings') },
    ...(user?.role === 'admin' ? [
      { id: 'admin', icon: Shield, label: 'Go to Admin', action: () => navigate('/admin') },
    ] : []),
  ]

  // Filter and combine results
  const filteredCommands = commands.filter(cmd =>
    cmd.label.toLowerCase().includes(query.toLowerCase())
  )

  const filteredConversations = conversations.slice(0, 5).map(conv => ({
    id: `conv-${conv._id}`,
    icon: MessageSquare,
    label: conv.title || 'Untitled conversation',
    sublabel: `${conv.message_count} messages`,
    action: () => navigate(`/chat/${conv._id}`),
  }))

  const filteredConfigs = configs
    .filter(cfg => cfg.name.toLowerCase().includes(query.toLowerCase()))
    .slice(0, 3)
    .map(cfg => ({
      id: `cfg-${cfg._id}`,
      icon: Bot,
      label: `Use ${cfg.name}`,
      sublabel: cfg.model_name,
      action: () => navigate(`/chat?config=${cfg._id}`),
    }))

  const allResults = [
    ...(query ? [] : filteredCommands),
    ...(query ? filteredCommands : []),
    ...filteredConversations,
    ...filteredConfigs,
  ]

  // Reset selection when results change
  useEffect(() => {
    setSelectedIndex(0)
  }, [query])

  // Focus input when opened
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus()
    }
  }, [isOpen])

  // Handle keyboard navigation
  const handleKeyDown = (e) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setSelectedIndex(i => Math.min(i + 1, allResults.length - 1))
        break
      case 'ArrowUp':
        e.preventDefault()
        setSelectedIndex(i => Math.max(i - 1, 0))
        break
      case 'Enter':
        e.preventDefault()
        if (allResults[selectedIndex]) {
          allResults[selectedIndex].action()
          handleClose()
        }
        break
      case 'Escape':
        e.preventDefault()
        handleClose()
        break
    }
  }

  const handleClose = () => {
    setQuery('')
    setSelectedIndex(0)
    onClose()
  }

  const handleSelect = (result) => {
    result.action()
    handleClose()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={handleClose}
      />

      {/* Palette */}
      <div className="relative w-full max-w-xl mx-4 bg-background-elevated border border-border rounded-xl shadow-dropdown overflow-hidden">
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
          <Search className="h-5 w-5 text-foreground-tertiary" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search conversations, commands..."
            className="flex-1 bg-transparent text-foreground placeholder-foreground-tertiary focus:outline-none"
          />
          <button
            onClick={handleClose}
            className="p-1 rounded text-foreground-tertiary hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Results */}
        <div className="max-h-[50vh] overflow-y-auto">
          {allResults.length === 0 ? (
            <div className="px-4 py-8 text-center text-foreground-secondary">
              No results found
            </div>
          ) : (
            <div className="py-2">
              {allResults.map((result, index) => (
                <button
                  key={result.id}
                  onClick={() => handleSelect(result)}
                  onMouseEnter={() => setSelectedIndex(index)}
                  className={cn(
                    'flex items-center gap-3 w-full px-4 py-2 text-left transition-colors',
                    index === selectedIndex
                      ? 'bg-accent/10 text-foreground'
                      : 'text-foreground-secondary hover:bg-background-tertiary'
                  )}
                >
                  <result.icon className={cn(
                    'h-4 w-4 flex-shrink-0',
                    index === selectedIndex ? 'text-accent' : ''
                  )} />
                  <div className="flex-1 min-w-0">
                    <p className="truncate">{result.label}</p>
                    {result.sublabel && (
                      <p className="text-xs text-foreground-tertiary truncate">
                        {result.sublabel}
                      </p>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-2 border-t border-border text-xs text-foreground-tertiary">
          <div className="flex items-center gap-4">
            <span>
              <kbd className="px-1.5 py-0.5 bg-background-tertiary border border-border rounded font-mono">↑</kbd>
              <kbd className="px-1.5 py-0.5 bg-background-tertiary border border-border rounded font-mono ml-1">↓</kbd>
              <span className="ml-1">navigate</span>
            </span>
            <span>
              <kbd className="px-1.5 py-0.5 bg-background-tertiary border border-border rounded font-mono">↵</kbd>
              <span className="ml-1">select</span>
            </span>
            <span>
              <kbd className="px-1.5 py-0.5 bg-background-tertiary border border-border rounded font-mono">esc</kbd>
              <span className="ml-1">close</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
