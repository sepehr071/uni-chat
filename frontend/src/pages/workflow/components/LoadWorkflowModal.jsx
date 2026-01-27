import { Sparkles } from 'lucide-react';
import { cn } from '../../../utils/cn';

export default function LoadWorkflowModal({
  workflows,
  templates,
  activeTab,
  onTabChange,
  onLoadWorkflow,
  onLoadTemplate,
  onClose,
}) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-background rounded-xl border border-border w-full max-w-lg max-h-[80vh] overflow-hidden flex flex-col">
        <div className="p-4 border-b border-border">
          <h2 className="text-lg font-semibold text-foreground mb-3">Load Workflow</h2>
          {/* Tabs */}
          <div className="flex gap-2">
            <button
              onClick={() => onTabChange('workflows')}
              className={cn(
                "px-4 py-2 text-sm font-medium rounded-lg transition-colors",
                activeTab === 'workflows'
                  ? "bg-accent text-accent-foreground"
                  : "bg-background-tertiary text-foreground-secondary hover:bg-accent/20"
              )}
            >
              My Workflows ({workflows.length})
            </button>
            <button
              onClick={() => onTabChange('templates')}
              className={cn(
                "px-4 py-2 text-sm font-medium rounded-lg transition-colors",
                activeTab === 'templates'
                  ? "bg-accent text-accent-foreground"
                  : "bg-background-tertiary text-foreground-secondary hover:bg-accent/20"
              )}
            >
              Templates ({templates.length})
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {activeTab === 'workflows' ? (
            // My Workflows Tab
            workflows.length === 0 ? (
              <div className="text-center py-8 text-foreground-secondary">
                No workflows yet. Create one or start from a template!
              </div>
            ) : (
              <div className="space-y-2">
                {workflows.map((workflow) => (
                  <button
                    key={workflow._id}
                    onClick={() => onLoadWorkflow(workflow)}
                    className="w-full p-4 rounded-lg border border-border hover:border-accent hover:bg-background-tertiary transition-colors text-left"
                  >
                    <div className="font-medium text-foreground">{workflow.name}</div>
                    {workflow.description && (
                      <div className="text-sm text-foreground-secondary mt-1">
                        {workflow.description}
                      </div>
                    )}
                    <div className="text-xs text-foreground-tertiary mt-2">
                      {workflow.nodes?.length || 0} nodes
                    </div>
                  </button>
                ))}
              </div>
            )
          ) : (
            // Templates Tab
            templates.length === 0 ? (
              <div className="text-center py-8 text-foreground-secondary">
                No templates available yet.
              </div>
            ) : (
              <div className="space-y-2">
                {templates.map((template) => (
                  <button
                    key={template._id}
                    onClick={() => onLoadTemplate(template)}
                    className="w-full p-4 rounded-lg border border-accent/30 hover:border-accent hover:bg-accent/5 transition-colors text-left"
                  >
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-accent" />
                      <span className="font-medium text-foreground">{template.name}</span>
                    </div>
                    {template.description && (
                      <div className="text-sm text-foreground-secondary mt-1 ml-6">
                        {template.description}
                      </div>
                    )}
                    <div className="text-xs text-foreground-tertiary mt-2 ml-6">
                      {template.nodes?.length || 0} nodes · Ready to use
                    </div>
                  </button>
                ))}
              </div>
            )
          )}
        </div>

        <div className="p-4 border-t border-border">
          <button
            onClick={onClose}
            className="btn btn-secondary w-full"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
