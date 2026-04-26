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
]

export function getSlashCommand(id) {
  return SLASH_COMMANDS.find((cmd) => cmd.id === id)
}
