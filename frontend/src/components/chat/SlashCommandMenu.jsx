import * as icons from 'lucide-react'
import { cn } from '../../utils/cn'
import { Popover, PopoverTrigger, PopoverContent } from '../ui/popover'
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from '../ui/command'
import { SLASH_COMMANDS } from '../../constants/slashCommands'

export default function SlashCommandMenu({ open, onOpenChange, onSelect }) {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      {/* Trigger is a zero-size anchor so the popover still has a root element */}
      <PopoverTrigger asChild>
        <span className="sr-only" aria-hidden="true" />
      </PopoverTrigger>

      <PopoverContent
        side="top"
        align="start"
        sideOffset={8}
        className={cn(
          'p-0 border-0 bg-transparent shadow-none',
          'w-[min(22rem,calc(100vw-1rem))]'
        )}
      >
        <div className="bg-background-elevated border border-border rounded-xl shadow-dropdown animate-fade-in overflow-hidden">
          <Command>
            <CommandInput placeholder="Search commands…" autoFocus />
            <CommandList>
              <CommandEmpty>No commands found.</CommandEmpty>
              <CommandGroup heading="Slash commands">
                {SLASH_COMMANDS.map((cmd) => {
                  const Icon = icons[cmd.iconName]
                  return (
                    <CommandItem
                      key={cmd.id}
                      value={`${cmd.label} ${cmd.description}`}
                      onSelect={() => {
                        onSelect(cmd)
                        onOpenChange(false)
                      }}
                      className="gap-3 cursor-pointer"
                    >
                      {Icon && (
                        <div className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0 bg-accent/10">
                          <Icon className="h-4 w-4 text-accent" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium">{cmd.label}</div>
                        <p className="text-xs text-foreground-tertiary truncate">{cmd.description}</p>
                      </div>
                    </CommandItem>
                  )
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </div>
      </PopoverContent>
    </Popover>
  )
}
