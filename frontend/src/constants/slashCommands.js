export const SLASH_COMMANDS = [
  {
    id: 'canvas',
    label: 'Canvas',
    description: 'Build a runnable HTML/CSS/JS artifact and open it in the canvas',
    iconName: 'PanelRightOpen',
    configId: 'agent:canvas',
    intent: 'canvas',
    placeholder: 'Describe the app or visual you want to build…',
  },
  {
    id: 'routine',
    label: 'Routine',
    description: 'Schedule a recurring AI task — e.g. "every weekday 9am: summarize my unread emails"',
    iconName: 'CalendarClock',
    intent: 'routine',
    placeholder: 'When and what? e.g. "every weekday 9am: summarize my unread emails"',
  },
]

export function getSlashCommand(id) {
  return SLASH_COMMANDS.find((cmd) => cmd.id === id)
}
