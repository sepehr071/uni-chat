import { GitBranch, MessageSquarePlus } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog'
import { Button } from '../ui/button'
import { Card, CardContent } from '../ui/card'
import { Avatar, AvatarFallback } from '../ui/avatar'

/**
 * Modal for choosing how to branch a conversation
 */
export default function BranchOptionsModal({
  isOpen,
  onClose,
  onBranchInPlace,
  onBranchToNew
}) {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create Branch</DialogTitle>
          <DialogDescription>
            Choose how you want to branch from this message:
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-4">
          {/* Option 1: Branch in place */}
          <Card
            className="cursor-pointer hover:border-accent hover:bg-accent/5 transition-all group"
            onClick={() => {
              onBranchInPlace()
              onClose()
            }}
          >
            <CardContent className="flex items-start gap-4 p-4">
              <Avatar shape="square" className="group-hover:scale-110 transition-transform">
                <AvatarFallback className="bg-accent/10 text-accent group-hover:bg-accent/20">
                  <GitBranch className="h-5 w-5" />
                </AvatarFallback>
              </Avatar>
              <div className="space-y-1">
                <p className="font-medium text-foreground group-hover:text-accent transition-colors">
                  Branch in this conversation
                </p>
                <p className="text-sm text-foreground-tertiary">
                  Create a parallel branch within the current conversation. You can switch between branches anytime.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Option 2: New conversation */}
          <Card
            className="cursor-pointer hover:border-accent hover:bg-accent/5 transition-all group"
            onClick={() => {
              onBranchToNew()
              onClose()
            }}
          >
            <CardContent className="flex items-start gap-4 p-4">
              <Avatar shape="square" className="group-hover:scale-110 transition-transform">
                <AvatarFallback className="bg-accent/10 text-accent group-hover:bg-accent/20">
                  <MessageSquarePlus className="h-5 w-5" />
                </AvatarFallback>
              </Avatar>
              <div className="space-y-1">
                <p className="font-medium text-foreground group-hover:text-accent transition-colors">
                  Start new conversation
                </p>
                <p className="text-sm text-foreground-tertiary">
                  Create a completely new conversation with messages up to this point. The original conversation remains unchanged.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} className="w-full sm:w-auto">
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
