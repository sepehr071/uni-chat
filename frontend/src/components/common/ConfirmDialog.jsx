import { useState, useEffect, useRef } from 'react'
import { AlertTriangle, X, Loader2 } from 'lucide-react'
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
  const [isLoading, setIsLoading] = useState(false)
  const cancelRef = useRef(null)

  // Reset loading state when dialog closes
  useEffect(() => {
    if (!isOpen) setIsLoading(false)
  }, [isOpen])

  // Focus cancel button when dialog opens
  useEffect(() => {
    if (isOpen && cancelRef.current) {
      cancelRef.current.focus()
    }
  }, [isOpen])

  // Handle ESC key press (only if not loading)
  useEffect(() => {
    if (!isOpen) return

    const handleEscape = (e) => {
      if (e.key === 'Escape' && !isLoading) {
        onClose()
      }
    }

    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [isOpen, onClose, isLoading])

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
    if (e.target === e.currentTarget && !isLoading) {
      onClose()
    }
  }

  const handleConfirm = async () => {
    setIsLoading(true)
    try {
      await onConfirm()
      onClose()
    } catch (error) {
      // Stay open on error - parent handles toast
      setIsLoading(false)
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={handleBackdropClick}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-message"
        className="bg-background rounded-lg p-6 max-w-md w-full space-y-4 animate-slide-up"
      >
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
            <h3
              id="confirm-dialog-title"
              className="text-lg font-semibold text-foreground"
            >
              {title}
            </h3>
          </div>
          <button
            onClick={onClose}
            disabled={isLoading}
            className="p-1 hover:bg-background-tertiary rounded transition-colors disabled:opacity-50"
            aria-label="Close"
          >
            <X className="w-5 h-5 text-foreground-secondary" />
          </button>
        </div>

        {/* Message */}
        <div
          id="confirm-dialog-message"
          className="text-sm text-foreground-secondary pl-11"
        >
          {message}
        </div>

        {/* Actions */}
        <div className="flex gap-2 justify-end pt-2">
          <button
            ref={cancelRef}
            onClick={onClose}
            disabled={isLoading}
            className="px-4 py-2 rounded-lg border border-border text-foreground-secondary hover:text-foreground hover:border-foreground-secondary transition-colors disabled:opacity-50"
          >
            {cancelText}
          </button>
          <button
            onClick={handleConfirm}
            disabled={isLoading}
            className={cn(
              'px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50 flex items-center justify-center min-w-[80px]',
              variant === 'danger'
                ? 'bg-error text-white hover:bg-error/90'
                : 'bg-accent text-white hover:bg-accent-hover'
            )}
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              confirmText
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
