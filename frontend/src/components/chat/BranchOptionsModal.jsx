import { GitBranch, MessageSquarePlus, X } from 'lucide-react'

/**
 * Modal for choosing how to branch a conversation
 */
export default function BranchOptionsModal({
  isOpen,
  onClose,
  onBranchInPlace,
  onBranchToNew
}) {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal content */}
      <div className="relative w-full max-w-md bg-background border border-border rounded-xl shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h3 className="font-semibold text-foreground">Create Branch</h3>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-background-tertiary text-foreground-secondary hover:text-foreground transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Options */}
        <div className="p-4 space-y-3">
          <p className="text-sm text-foreground-secondary mb-4">
            Choose how you want to branch from this message:
          </p>

          {/* Option 1: Branch in place */}
          <button
            onClick={() => {
              onBranchInPlace()
              onClose()
            }}
            className="w-full flex items-start gap-3 p-4 rounded-lg border border-border hover:border-accent hover:bg-accent/5 transition-colors text-left group"
          >
            <div className="p-2 rounded-lg bg-accent/10 text-accent group-hover:bg-accent/20 transition-colors">
              <GitBranch className="h-5 w-5" />
            </div>
            <div>
              <div className="font-medium text-foreground">Branch in this conversation</div>
              <p className="text-sm text-foreground-tertiary mt-0.5">
                Create a parallel branch within the current conversation. You can switch between branches anytime.
              </p>
            </div>
          </button>

          {/* Option 2: New conversation */}
          <button
            onClick={() => {
              onBranchToNew()
              onClose()
            }}
            className="w-full flex items-start gap-3 p-4 rounded-lg border border-border hover:border-accent hover:bg-accent/5 transition-colors text-left group"
          >
            <div className="p-2 rounded-lg bg-accent/10 text-accent group-hover:bg-accent/20 transition-colors">
              <MessageSquarePlus className="h-5 w-5" />
            </div>
            <div>
              <div className="font-medium text-foreground">Start new conversation</div>
              <p className="text-sm text-foreground-tertiary mt-0.5">
                Create a completely new conversation with messages up to this point. The original conversation remains unchanged.
              </p>
            </div>
          </button>
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-border">
          <button
            onClick={onClose}
            className="w-full px-4 py-2 text-sm text-foreground-secondary hover:text-foreground hover:bg-background-tertiary rounded-lg transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
