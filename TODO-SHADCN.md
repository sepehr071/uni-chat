# TODO: shadcn/ui Migration

Remaining files to update with shadcn/ui components for consistent premium UI.

## High Priority (User-Facing Pages)

### Dashboard Pages
- [ ] `frontend/src/pages/dashboard/HistoryPage.jsx`
  - Replace: `input`, `card` classes
  - Use: Card, Input, Button, Badge, Skeleton

- [ ] `frontend/src/pages/dashboard/ImageStudioPage.jsx`
  - Replace: `input`, `btn`, `card` classes
  - Use: Button, Input, Card, Select, Tabs, Slider

- [ ] `frontend/src/pages/dashboard/GalleryPage.jsx`
  - Replace: `card`, `btn` classes
  - Use: Card, Button, Badge, Dialog (image modal)

- [ ] `frontend/src/pages/dashboard/ConfigsPage.jsx`
  - Replace: `card`, `btn`, `input` classes
  - Use: Card, Button, Dialog, Input, Badge

### Feature Pages
- [ ] `frontend/src/pages/arena/ArenaPage.jsx`
  - Replace: `btn`, native `<select>`, `<button>`
  - Use: Button, Select, Card, Badge

- [ ] `frontend/src/pages/debate/DebatePage.jsx`
  - Replace: `card` classes
  - Use: Card, Badge, Button

- [ ] `frontend/src/pages/knowledge/KnowledgePage.jsx`
  - Replace: `card`, `btn`, `input` classes
  - Use: Card, Button, Badge, Input, Tabs

## Medium Priority (Modals & Components)

### Knowledge Modals
- [ ] `frontend/src/components/knowledge/MoveToFolderModal.jsx`
  - Replace: Custom modal structure
  - Use: Dialog, Button, Card

- [ ] `frontend/src/components/knowledge/KnowledgeEditModal.jsx`
  - Replace: Custom modal, native inputs
  - Use: Dialog, Input, Textarea, Button

- [ ] `frontend/src/components/knowledge/KnowledgeDetailModal.jsx`
  - Replace: Custom modal
  - Use: Dialog, Button, Badge

### Workflow Components
- [ ] `frontend/src/pages/workflow/components/LoadWorkflowModal.jsx`
  - Replace: Custom modal, `input`, `btn`
  - Use: Dialog, Input, Button, Card

- [ ] `frontend/src/pages/workflow/components/WorkflowToolbar.jsx`
  - Replace: `btn` classes, native buttons
  - Use: Button, Tooltip, DropdownMenu

### Config Components
- [ ] `frontend/src/components/config/ConfigEditor.jsx`
  - Replace: `input`, native `<select>`
  - Use: Input, Select, Textarea, Switch, Button

### Arena Components
- [ ] `frontend/src/components/arena/ArenaConfigSelector.jsx`
  - Replace: Custom selector
  - Use: Select, Button, Badge

### Image Components
- [ ] `frontend/src/components/image/TemplateSelector.jsx`
  - Replace: Custom cards
  - Use: Card, Badge, Button

## Low Priority (Admin Pages)

- [ ] `frontend/src/pages/admin/AdminDashboard.jsx`
- [ ] `frontend/src/pages/admin/UserManagement.jsx`
- [ ] `frontend/src/pages/admin/TemplatesPage.jsx`
- [ ] `frontend/src/pages/admin/PromptTemplatesPage.jsx`
- [ ] `frontend/src/pages/admin/AuditLogPage.jsx`
- [ ] `frontend/src/pages/admin/UserHistoryPage.jsx`

All admin pages need:
- Card for data tables/sections
- Button for actions
- Input/Select for forms
- Dialog for confirmations
- Badge for status indicators
- Skeleton for loading states

---

## Migration Checklist Per File

1. [ ] Import shadcn components from `@/components/ui/`
2. [ ] Replace `className="btn btn-*"` with `<Button variant="*">`
3. [ ] Replace `className="input"` with `<Input>`
4. [ ] Replace `className="card"` with `<Card>`
5. [ ] Replace custom modals with `<Dialog>`
6. [ ] Add `<Tooltip>` to icon buttons
7. [ ] Use `<Skeleton>` for loading states
8. [ ] Add Motion animations for entrances/transitions
9. [ ] Test component functionality
10. [ ] Verify build passes

---

## Notes

- Path alias `@/` = `frontend/src/`
- Animation presets in `frontend/src/utils/animations.js`
- All shadcn components are in `frontend/src/components/ui/`
- Components already support dark mode via CSS variables
