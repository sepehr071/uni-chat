import { useState } from 'react'
import { X, Copy, Check, Link2, Globe, Lock } from 'lucide-react'
import { canvasService } from '../../../services/canvasService'
import toast from 'react-hot-toast'

/**
 * Dialog for sharing a canvas publicly
 */
export default function ShareDialog({ code, onClose }) {
  const [title, setTitle] = useState('My Canvas')
  const [visibility, setVisibility] = useState('public')
  const [isSharing, setIsSharing] = useState(false)
  const [shareUrl, setShareUrl] = useState(null)
  const [copied, setCopied] = useState(false)

  const handleShare = async () => {
    setIsSharing(true)
    try {
      const result = await canvasService.shareCanvas({
        title,
        html: code.html,
        css: code.css,
        js: code.js,
        visibility
      })
      const fullUrl = `${window.location.origin}${result.share_url}`
      setShareUrl(fullUrl)
      toast.success('Canvas shared successfully!')
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to share canvas')
    } finally {
      setIsSharing(false)
    }
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
      toast.success('Link copied to clipboard!')
    } catch {
      toast.error('Failed to copy link')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-background-elevated border border-border rounded-xl w-full max-w-md mx-4 shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h3 className="text-lg font-semibold text-foreground">Share Canvas</h3>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-background-tertiary rounded-lg text-foreground-secondary hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4">
          {!shareUrl ? (
            <>
              {/* Title input */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-foreground-secondary mb-1.5">
                  Canvas Title
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Enter a title for your canvas"
                  className="w-full px-3 py-2 bg-background-secondary border border-border rounded-lg text-foreground placeholder:text-foreground-tertiary focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent"
                />
              </div>

              {/* Visibility select */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-foreground-secondary mb-1.5">
                  Visibility
                </label>
                <div className="space-y-2">
                  <label className="flex items-center gap-3 p-3 bg-background-secondary border border-border rounded-lg cursor-pointer hover:bg-background-tertiary transition-colors">
                    <input
                      type="radio"
                      name="visibility"
                      value="public"
                      checked={visibility === 'public'}
                      onChange={(e) => setVisibility(e.target.value)}
                      className="w-4 h-4 text-accent bg-background border-border focus:ring-accent"
                    />
                    <Globe className="h-4 w-4 text-foreground-secondary" />
                    <div>
                      <div className="text-sm font-medium text-foreground">Public</div>
                      <div className="text-xs text-foreground-tertiary">Anyone with the link can view</div>
                    </div>
                  </label>
                  <label className="flex items-center gap-3 p-3 bg-background-secondary border border-border rounded-lg cursor-pointer hover:bg-background-tertiary transition-colors">
                    <input
                      type="radio"
                      name="visibility"
                      value="unlisted"
                      checked={visibility === 'unlisted'}
                      onChange={(e) => setVisibility(e.target.value)}
                      className="w-4 h-4 text-accent bg-background border-border focus:ring-accent"
                    />
                    <Lock className="h-4 w-4 text-foreground-secondary" />
                    <div>
                      <div className="text-sm font-medium text-foreground">Unlisted</div>
                      <div className="text-xs text-foreground-tertiary">Only people with the link can view</div>
                    </div>
                  </label>
                </div>
              </div>

              {/* Share button */}
              <button
                onClick={handleShare}
                disabled={isSharing || !title.trim()}
                className="w-full py-2.5 px-4 bg-accent hover:bg-accent-hover text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSharing ? (
                  <span className="flex items-center justify-center gap-2">
                    <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Sharing...
                  </span>
                ) : (
                  'Share Canvas'
                )}
              </button>
            </>
          ) : (
            <>
              {/* Success state */}
              <div className="text-center mb-4">
                <div className="inline-flex items-center justify-center h-12 w-12 bg-success/10 text-success rounded-full mb-3">
                  <Check className="h-6 w-6" />
                </div>
                <h4 className="text-lg font-medium text-foreground mb-1">Canvas Shared!</h4>
                <p className="text-sm text-foreground-secondary">Your canvas is now available at the link below</p>
              </div>

              {/* Share URL */}
              <div className="flex items-center gap-2 p-3 bg-background-tertiary rounded-lg mb-4">
                <Link2 className="h-4 w-4 text-accent flex-shrink-0" />
                <span className="text-sm text-foreground truncate flex-1 select-all">{shareUrl}</span>
                <button
                  onClick={handleCopy}
                  className="p-1.5 hover:bg-background-secondary rounded-lg transition-colors flex-shrink-0"
                  title="Copy link"
                >
                  {copied ? (
                    <Check className="h-4 w-4 text-success" />
                  ) : (
                    <Copy className="h-4 w-4 text-foreground-secondary hover:text-foreground" />
                  )}
                </button>
              </div>

              {/* Actions */}
              <div className="flex gap-2">
                <button
                  onClick={() => window.open(shareUrl, '_blank')}
                  className="flex-1 py-2 px-4 bg-background-secondary hover:bg-background-tertiary text-foreground font-medium rounded-lg transition-colors"
                >
                  Open Canvas
                </button>
                <button
                  onClick={onClose}
                  className="flex-1 py-2 px-4 bg-accent hover:bg-accent-hover text-white font-medium rounded-lg transition-colors"
                >
                  Done
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
