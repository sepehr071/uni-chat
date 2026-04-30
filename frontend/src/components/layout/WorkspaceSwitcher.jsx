import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronsUpDown, Check, Plus, Building2, Folder } from 'lucide-react'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command'
import { Button } from '@/components/ui/button'
import { useWorkspace } from '@/context/WorkspaceContext'
import { useProject } from '@/context/ProjectContext'

export default function WorkspaceSwitcher() {
  const { workspaces, currentWorkspace, setActiveWorkspace } = useWorkspace()
  const { projects, currentProject, setActiveProject, setUnfiledView } = useProject()
  const [open, setOpen] = useState(false)
  const nav = useNavigate()

  const display = currentWorkspace
    ? `${currentWorkspace.name}${currentProject ? ` › ${currentProject.name}` : ' › Unfiled'}`
    : 'No workspace'

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-between font-normal"
          role="combobox"
          aria-expanded={open}
        >
          <span className="truncate text-xs text-zinc-300">{display}</span>
          <ChevronsUpDown className="ml-1 h-3.5 w-3.5 opacity-50 flex-shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start">
        <Command>
          <CommandInput placeholder="Search…" />
          <CommandList>
            <CommandEmpty>None found.</CommandEmpty>

            <CommandGroup heading="Workspaces">
              {workspaces.map((ws) => (
                <CommandItem
                  key={ws._id}
                  value={`ws-${ws.name}`}
                  onSelect={() => {
                    setActiveWorkspace(ws)
                    setOpen(false)
                  }}
                >
                  <Building2 className="mr-2 h-4 w-4" />
                  <span className="flex-1 truncate">{ws.name}</span>
                  {currentWorkspace?._id === ws._id && (
                    <Check className="h-4 w-4" />
                  )}
                </CommandItem>
              ))}
            </CommandGroup>

            <CommandSeparator />

            <CommandGroup heading="Projects">
              <CommandItem
                value="proj-unfiled"
                onSelect={() => {
                  setUnfiledView()
                  setOpen(false)
                }}
              >
                <Folder className="mr-2 h-4 w-4 opacity-60" />
                <span className="flex-1 italic text-zinc-400">Unfiled</span>
                {!currentProject && <Check className="h-4 w-4" />}
              </CommandItem>
              {projects
                .filter((p) => !p.archived)
                .map((p) => (
                  <CommandItem
                    key={p._id}
                    value={`proj-${p.name}`}
                    onSelect={() => {
                      setActiveProject(p)
                      setOpen(false)
                    }}
                  >
                    <Folder
                      className="mr-2 h-4 w-4"
                      style={{ color: p.color || '#5c9aed' }}
                    />
                    <span className="flex-1 truncate">{p.name}</span>
                    {currentProject?._id === p._id && (
                      <Check className="h-4 w-4" />
                    )}
                  </CommandItem>
                ))}
            </CommandGroup>

            <CommandSeparator />

            <CommandGroup>
              <CommandItem
                value="action-newproject"
                onSelect={() => {
                  setOpen(false)
                  nav('/projects?new=1')
                }}
              >
                <Plus className="mr-2 h-4 w-4" />
                New project
              </CommandItem>
              <CommandItem
                value="action-newworkspace"
                onSelect={() => {
                  setOpen(false)
                  nav('/dashboard?new_workspace=1')
                }}
              >
                <Plus className="mr-2 h-4 w-4" />
                New workspace
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
