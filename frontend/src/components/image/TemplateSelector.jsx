import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Wand2, ChevronDown, X } from 'lucide-react'
import { cn } from '../../utils/cn'
import { promptTemplateService } from '../../services/promptTemplateService'
import toast from 'react-hot-toast'

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
      <button
        type="button"
        onClick={() => setShowTemplates(!showTemplates)}
        disabled={disabled}
        className={cn(
          'flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors',
          showTemplates
            ? 'bg-accent text-white'
            : 'bg-background-tertiary text-foreground-secondary hover:text-foreground',
          disabled && 'opacity-50 cursor-not-allowed'
        )}
      >
        <Wand2 className="w-4 h-4" />
        <span>{showTemplates ? 'Hide Templates' : 'Use Template'}</span>
        <ChevronDown className={cn(
          'w-4 h-4 transition-transform',
          showTemplates && 'rotate-180'
        )} />
      </button>

      {/* Templates Panel */}
      {showTemplates && (
        <div className="border border-border rounded-lg p-4 space-y-4 bg-background-secondary">
          {/* Category Filter */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setSelectedCategory('all')}
              className={cn(
                'px-3 py-1.5 rounded-lg text-sm transition-colors',
                selectedCategory === 'all'
                  ? 'bg-accent text-white'
                  : 'bg-background-tertiary text-foreground-secondary hover:text-foreground'
              )}
            >
              All
            </button>
            {categories.map((cat) => (
              <button
                key={cat.category}
                onClick={() => setSelectedCategory(cat.category)}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-sm transition-colors',
                  selectedCategory === cat.category
                    ? 'bg-accent text-white'
                    : 'bg-background-tertiary text-foreground-secondary hover:text-foreground'
                )}
              >
                {CATEGORY_LABELS[cat.category] || cat.category} ({cat.count})
              </button>
            ))}
          </div>

          {/* Templates Grid */}
          {isLoading ? (
            <div className="text-center py-8 text-foreground-tertiary">
              Loading templates...
            </div>
          ) : templates.length === 0 ? (
            <div className="text-center py-8 text-foreground-tertiary">
              No templates found
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-96 overflow-y-auto">
              {templates.map((template) => (
                <button
                  key={template._id}
                  onClick={() => handleTemplateClick(template)}
                  className="text-left p-3 rounded-lg border border-border hover:border-accent hover:bg-background-tertiary transition-all group"
                >
                  <div className="font-medium text-sm text-foreground mb-1 group-hover:text-accent">
                    {template.name}
                  </div>
                  <div className="text-xs text-foreground-tertiary line-clamp-2">
                    {template.description}
                  </div>
                  {template.variables && template.variables.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {template.variables.map(v => (
                        <span
                          key={v}
                          className="text-xs px-2 py-0.5 rounded bg-accent/10 text-accent"
                        >
                          {v}
                        </span>
                      ))}
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Variable Input Dialog */}
      {showVariableDialog && selectedTemplate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-background rounded-lg p-6 max-w-md w-full space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-foreground">
                Fill in Template Variables
              </h3>
              <button
                onClick={() => setShowVariableDialog(false)}
                className="p-1 hover:bg-background-tertiary rounded"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="text-sm text-foreground-secondary">
              {selectedTemplate.name}
            </div>

            <div className="space-y-3">
              {selectedTemplate.variables.map(varName => (
                <div key={varName}>
                  <label className="block text-sm font-medium text-foreground mb-1 capitalize">
                    {varName.replace(/_/g, ' ')}
                  </label>
                  <input
                    type="text"
                    value={variables[varName] || ''}
                    onChange={(e) => setVariables({
                      ...variables,
                      [varName]: e.target.value
                    })}
                    placeholder={`Enter ${varName.replace(/_/g, ' ')}`}
                    className="input w-full"
                  />
                </div>
              ))}
            </div>

            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowVariableDialog(false)}
                className="px-4 py-2 rounded-lg border border-border text-foreground-secondary hover:text-foreground"
              >
                Cancel
              </button>
              <button
                onClick={handleApplyWithVariables}
                className="btn btn-primary"
              >
                Apply Template
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
