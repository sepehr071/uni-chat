import { useEffect, useRef } from 'react';
import { Copy, Trash2, Play } from 'lucide-react';
import { cn } from '../../utils/cn';

/**
 * Context menu for workflow nodes
 * Shows on right-click with options: Duplicate, Delete, Run This Node
 */
export default function NodeContextMenu({
  x,
  y,
  nodeId,
  nodeType,
  onDuplicate,
  onDelete,
  onRunNode,
  onClose
}) {
  const menuRef = useRef(null);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        onClose();
      }
    };

    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  // Adjust position to keep menu in viewport
  const adjustedPosition = {
    left: x,
    top: y
  };

  // Check if menu would overflow right edge
  if (typeof window !== 'undefined') {
    const menuWidth = 180;
    const menuHeight = 140;

    if (x + menuWidth > window.innerWidth) {
      adjustedPosition.left = x - menuWidth;
    }
    if (y + menuHeight > window.innerHeight) {
      adjustedPosition.top = y - menuHeight;
    }
  }

  const menuItems = [
    {
      icon: Copy,
      label: 'Duplicate',
      shortcut: 'Ctrl+D',
      onClick: () => {
        onDuplicate(nodeId);
        onClose();
      }
    },
    {
      icon: Play,
      label: 'Run This Node',
      shortcut: null,
      onClick: () => {
        onRunNode(nodeId);
        onClose();
      },
      // Only show for imageGen nodes (imageUpload doesn't need execution)
      hidden: nodeType === 'imageUpload'
    },
    {
      icon: Trash2,
      label: 'Delete',
      shortcut: 'Del',
      onClick: () => {
        onDelete(nodeId);
        onClose();
      },
      danger: true
    }
  ];

  return (
    <div
      ref={menuRef}
      className="fixed z-50 min-w-[180px] bg-background border border-border rounded-lg shadow-lg py-1 overflow-hidden"
      style={{
        left: adjustedPosition.left,
        top: adjustedPosition.top
      }}
    >
      {menuItems
        .filter(item => !item.hidden)
        .map((item, index) => (
          <button
            key={item.label}
            onClick={item.onClick}
            className={cn(
              'w-full px-3 py-2 flex items-center gap-3 text-sm transition-colors',
              'hover:bg-accent/50',
              item.danger && 'text-red-500 hover:bg-red-500/10'
            )}
          >
            <item.icon className="w-4 h-4" />
            <span className="flex-1 text-left">{item.label}</span>
            {item.shortcut && (
              <span className="text-xs text-muted-foreground">{item.shortcut}</span>
            )}
          </button>
        ))}
    </div>
  );
}
