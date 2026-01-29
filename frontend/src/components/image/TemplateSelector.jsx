import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Wand2, ChevronDown, X } from 'lucide-react'
import { cn } from '../../utils/cn'
import { promptTemplateService } from '../../services/promptTemplateService'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'

const CATEGORY_LABELS = {
  product_photography: 'Product Photography',
  advertisement: 'Advertisement',
  social_media: 'Social Media',
  lifestyle: 'Lifestyle',
  hero_banner: 'Hero/Banner',
  tech_saas: 'Tech/SaaS',
  food_restaurant: 'Food/Restaurant',
  fashion_apparel: 'Fashion/Apparel',
}

export default function TemplateSelector({ onSelect, disabled = false }) {
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [showTemplates, setShowTemplates] = useState(false)
  const [selectedTemplate, setSelectedTemplate] = useState(null)
  const [variables, setVariables] = useState({})
  const [showVariableDialog, setShowVariableDialog] = useState(false)

  // Fetch categories
  const { data: categoriesData } = useQuery({
    queryKey: ['promptTemplateCategories'],
    queryFn: () => promptTemplateService.getCategories(),
  })

  // Fetch templates
  const { data: templatesData, isLoading } = useQuery({
    queryKey: ['promptTemplates', selectedCategory],
    queryFn: () => promptTemplateService.getTemplates(
      selectedCategory === 'all' ? null : selectedCategory
    ),
  })

  const categories = categoriesData?.categories || []
  const templates = templatesData?.templates || []

  const handleTemplateClick = (template) => {
    setSelectedTemplate(template)

    // If template has variables, show dialog
    if (template.variables && template.variables.length > 0) {
      setShowVariableDialog(true)
      // Initialize variables with empty values
      const initialVars = {}
      template.variables.forEach(v => {
        initialVars[v] = ''
      })
      setVariables(initialVars)
    } else {
      // No variables, use template directly
      applyTemplate(template.template_text)
    }
  }

  const applyTemplate = (text) => {
    // Record usage
    if (selectedTemplate) {
      promptTemplateService.useTemplate(selectedTemplate._id).catch(err => {
        console.error('Failed to record template usage:', err)
      })
    }

    onSelect(text)
    setShowTemplates(false)
    setShowVariableDialog(false)
    toast.success('Template applied!')
  }

  const handleApplyWithVariables = () => {
    if (!selectedTemplate) return

    // Check all variables are filled
    const emptyVars = selectedTemplate.variables.filter(v => !variables[v] || !variables[v].trim())
    if (emptyVars.length > 0) {
      toast.error(`Please fill in: ${emptyVars.join(', ')}`)
      return
    }

    // Replace variables in template
    let finalText = selectedTemplate.template_text
    Object.keys(variables).forEach(varName => {
      const regex = new RegExp(`{{${varName}}}`, 'g')
      finalText = finalText.replace(regex, variables[varName])
    })

    applyTemplate(finalText)
  }

  return (
    <div className="space-y-2">
      {/* Toggle Button */}
      <Collapsible open={showTemplates} onOpenChange={setShowTemplates}>
        <CollapsibleTrigger asChild>
          <Button
            variant={showTemplates ? "default" : "secondary"}
            disabled={disabled}
            className="w-auto"
          >
            <Wand2 className="w-4 h-4 mr-2" />
            <span>{showTemplates ? 'Hide Templates' : 'Use Template'}</span>
            <ChevronDown className={cn(
              'w-4 h-4 ml-2 transition-transform',
              showTemplates && 'rotate-180'
            )} />
          </Button>
        </CollapsibleTrigger>

        {/* Templates Panel */}
        <CollapsibleContent className="mt-2">
          <Card className="p-4 space-y-4">
            {/* Category Filter */}
            <div className="flex items-center gap-2 flex-wrap">
              <Button
                variant={selectedCategory === 'all' ? "default" : "secondary"}
                size="sm"
                onClick={() => setSelectedCategory('all')}
              >
                All
              </Button>
              {categories.map((cat) => (
                <Button
                  key={cat.category}
                  variant={selectedCategory === cat.category ? "default" : "secondary"}
                  size="sm"
                  onClick={() => setSelectedCategory(cat.category)}
                >
                  {CATEGORY_LABELS[cat.category] || cat.category} ({cat.count})
                </Button>
              ))}
            </div>

            {/* Templates Grid */}
            {isLoading ? (
              <div className="text-center py-8 text-muted-foreground">
                Loading templates...
              </div>
            ) : templates.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No templates found
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-96 overflow-y-auto">
                {templates.map((template) => (
                  <Card
                    key={template._id}
                    className="p-3 cursor-pointer hover:border-primary transition-colors group"
                    onClick={() => handleTemplateClick(template)}
                  >
                    <div className="font-medium text-sm mb-1 group-hover:text-primary">
                      {template.name}
                    </div>
                    <div className="text-xs text-muted-foreground line-clamp-2">
                      {template.description}
                    </div>
                    {template.variables && template.variables.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {template.variables.map(v => (
                          <Badge
                            key={v}
                            variant="secondary"
                            className="text-xs"
                          >
                            {v}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </Card>
                ))}
              </div>
            )}
          </Card>
        </CollapsibleContent>
      </Collapsible>

      {/* Variable Input Dialog */}
      <Dialog open={showVariableDialog} onOpenChange={setShowVariableDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Fill in Template Variables</DialogTitle>
            <div className="text-sm text-muted-foreground">
              {selectedTemplate?.name}
            </div>
          </DialogHeader>

          <div className="space-y-3">
            {selectedTemplate?.variables.map(varName => (
              <div key={varName}>
                <label className="block text-sm font-medium mb-1 capitalize">
                  {varName.replace(/_/g, ' ')}
                </label>
                <Input
                  type="text"
                  value={variables[varName] || ''}
                  onChange={(e) => setVariables({
                    ...variables,
                    [varName]: e.target.value
                  })}
                  placeholder={`Enter ${varName.replace(/_/g, ' ')}`}
                />
              </div>
            ))}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowVariableDialog(false)}
            >
              Cancel
            </Button>
            <Button onClick={handleApplyWithVariables}>
              Apply Template
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
