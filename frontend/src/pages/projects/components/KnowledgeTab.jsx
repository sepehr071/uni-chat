import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Database, Folder as FolderIcon, ExternalLink } from 'lucide-react'
import Section from '@/components/teams/Section'
import Ptile from '@/components/teams/Ptile'
import { Button } from '@/components/ui/button'
import { knowledgeFolderService } from '@/services/knowledgeFolderService'

/**
 * KnowledgeTab — read-only summary of folders scoped to this project.
 * Deep-links to the Knowledge Vault filtered by project.
 */
export default function KnowledgeTab({ project }) {
  const nav = useNavigate()
  const [folders, setFolders] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let alive = true
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const data = await knowledgeFolderService.list({
          project_id: project._id,
        })
        const list = Array.isArray(data) ? data : data?.folders || []
        if (alive) setFolders(list)
      } catch (err) {
        if (alive) setError(err.response?.data?.error || 'Failed to load folders')
      } finally {
        if (alive) setLoading(false)
      }
    }
    if (project?._id) load()
    return () => {
      alive = false
    }
  }, [project?._id])

  return (
    <div className="max-w-[920px] space-y-4">
      <Section
        title="Project knowledge"
        hint="Folders pinned to this project. Items inside are scoped to project members."
        action={
          <Button
            size="sm"
            variant="outline"
            className="h-7 gap-1.5 text-xs"
            onClick={() => nav(`/knowledge?project=${project._id}`)}
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Open Knowledge Vault
          </Button>
        }
      >
        {loading ? (
          <div className="px-2 py-6 text-sm text-fg-3">Loading folders...</div>
        ) : error ? (
          <div className="px-2 py-6 text-sm text-err">{error}</div>
        ) : folders.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
            <Database className="h-6 w-6 text-fg-3" />
            <p className="text-sm text-fg-2">No folders yet.</p>
            <p className="text-[11.5px] text-fg-3 max-w-md">
              Save AI responses from chats in this project to start building a
              knowledge base. Use the bookmark icon on any assistant message.
            </p>
          </div>
        ) : (
          <ul className="flex flex-col">
            {folders.map((f) => {
              const itemCount =
                typeof f.item_count === 'number'
                  ? f.item_count
                  : Array.isArray(f.items)
                    ? f.items.length
                    : null
              return (
                <li
                  key={f._id}
                  className="flex items-center gap-3 py-2 border-b border-line last:border-0"
                >
                  <Ptile
                    color={f.color || '#5c9aed'}
                    icon={FolderIcon}
                    size="sm"
                    gradient
                  />
                  <span className="grow truncate text-[13px] text-fg-1">
                    {f.name || 'Untitled folder'}
                  </span>
                  {itemCount != null && (
                    <span className="text-[11px] text-fg-3 font-mono">
                      {itemCount} {itemCount === 1 ? 'item' : 'items'}
                    </span>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </Section>
    </div>
  )
}
