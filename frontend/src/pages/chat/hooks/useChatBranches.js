import { useState, useEffect, useCallback } from 'react'
import { chatService } from '../../../services/chatService'
import toast from 'react-hot-toast'

export function useChatBranches({ conversationId, queryClient, setMessages }) {
  const [branches, setBranches] = useState([])
  const [activeBranch, setActiveBranch] = useState(null)

  // Fetch branches when conversation is loaded
  useEffect(() => {
    const fetchBranches = async () => {
      if (!conversationId) {
        setBranches([])
        setActiveBranch(null)
        return
      }

      try {
        const data = await chatService.getBranches(conversationId)
        setBranches(data.branches || [])
        // Find and set active branch
        const active = data.branches?.find(b => b.id === data.active_branch)
        setActiveBranch(active || data.branches?.[0] || null)
      } catch (error) {
        console.error('Failed to fetch branches:', error)
        setBranches([])
        setActiveBranch(null)
      }
    }

    fetchBranches()
  }, [conversationId])

  const handleSwitchBranch = useCallback(async (branchId) => {
    if (!conversationId) return

    try {
      const data = await chatService.switchBranch(conversationId, branchId)

      // Update active branch
      const switched = branches.find(b => b.id === branchId)
      setActiveBranch(switched || null)

      // Update messages with branch messages
      setMessages(data.messages || [])

      toast.success(`Switched to branch: ${switched?.name || 'unknown'}`)
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to switch branch')
    }
  }, [conversationId, branches, setMessages])

  const handleCreateBranch = useCallback(async (messageId) => {
    if (!conversationId) {
      toast.error('Please save the conversation first')
      return
    }

    // Prevent branching from temp messages
    if (messageId.toString().startsWith('temp-')) {
      toast.error('Please wait for message to be saved')
      return
    }

    try {
      const branchName = `branch-${Date.now().toString(36)}`
      const data = await chatService.createBranch(conversationId, messageId, branchName)

      // Update branches list with full array from response
      const newBranch = data.branches?.find(b => b.id === data.branch_id)
      setBranches(data.branches || [])

      // Switch to new branch
      setActiveBranch(newBranch || null)
      setMessages(data.messages || [])

      toast.success(`Created branch: ${newBranch?.name || branchName}`)

      // Invalidate conversation query to refresh data
      queryClient.invalidateQueries({ queryKey: ['conversation', conversationId] })
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to create branch')
    }
  }, [conversationId, queryClient, setMessages])

  const handleDeleteBranch = useCallback(async (branchId) => {
    if (!conversationId) return

    try {
      await chatService.deleteBranch(conversationId, branchId)

      // Remove from branches list
      setBranches(prev => prev.filter(b => b.id !== branchId))

      // If deleted branch was active, switch to main
      if (activeBranch?.id === branchId) {
        const mainBranch = branches.find(b => b.name === 'main' || b.id === 'main')
        if (mainBranch) {
          handleSwitchBranch(mainBranch.id)
        }
      }

      toast.success('Branch deleted')
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to delete branch')
    }
  }, [conversationId, activeBranch, branches, handleSwitchBranch])

  const handleRenameBranch = useCallback(async (branchId, newName) => {
    if (!conversationId || !newName?.trim()) return

    try {
      await chatService.renameBranch(conversationId, branchId, newName.trim())

      // Update branch name in local state
      setBranches(prev => prev.map(b =>
        b.id === branchId ? { ...b, name: newName.trim() } : b
      ))

      // Update active branch if it's the one being renamed
      if (activeBranch?.id === branchId) {
        setActiveBranch(prev => ({ ...prev, name: newName.trim() }))
      }

      toast.success('Branch renamed')
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to rename branch')
    }
  }, [conversationId, activeBranch])

  return {
    branches,
    activeBranch,
    handleCreateBranch,
    handleSwitchBranch,
    handleDeleteBranch,
    handleRenameBranch
  }
}
