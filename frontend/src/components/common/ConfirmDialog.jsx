import { useEffect } from 'react'
import { AlertTriangle, X } from 'lucide-react'
import { cn } from '../../utils/cn'

export default function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title = 'Confirm Action',
  message = 'Are you sure you want to proceed?',
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'danger', // 'danger' or 'default'
}) {
  // Handle ESC key press
  useEffect(() => {
    if (!isOpen) return

    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }

    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [isOpen, onClose])

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = 'unset'
    }
    return () => {
      document.body.style.overflow = 'unset'
    }
  }, [isOpen])

  if (!isOpen) return null

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose()
    }
  }

  const handleConfirm = () => {
    onConfirm()
    onClose()
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={handleBackdropClick}
    >
      <div className="bg-background rounded-lg p-6 max-w-md w-full space-y-4 animate-slide-up">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div
              className={cn(
                'p-2 rounded-full',
                variant === 'danger' ? 'bg-error/10' : 'bg-accent/10'
              )}
            >
              <AlertTriangle
                className={cn(
                  'w-5 h-5',
                  variant === 'danger' ? 'text-error' : 'text-accent'
                )}
              />
            </div>
            <h3 className="text-lg font-semibold text-foreground">
              {title}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-background-tertiary rounded transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5 text-foreground-secondary" />
          </button>
        </div>

        {/* Message */}
        <div className="text-sm text-foreground-secondary pl-11">
          {message}
        </div>

        {/* Actions */}
        <div className="flex gap-2 justify-end pt-2">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-border text-foreground-secondary hover:text-foreground hover:border-foreground-secondary transition-colors"
          >
            {cancelText}
          </button>
          <button
            onClick={handleConfirm}
            className={cn(
              'px-4 py-2 rounded-lg font-medium transition-colors',
              variant === 'danger'
                ? 'bg-error text-white hover:bg-error/90'
                : 'bg-accent text-white hover:bg-accent-hover'
            )}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}
