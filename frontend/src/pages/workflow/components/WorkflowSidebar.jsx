import { Upload, Sparkles } from 'lucide-react';
import { WorkflowGenerator } from '../../../components/workflow';

export default function WorkflowSidebar({
  showAIGenerator,
  onAddNode,
  onAIGenerate,
  onToggleAIGenerator,
}) {
  return (
    <div className="w-64 border-r border-border bg-background-secondary p-4 overflow-y-auto">
      <h3 className="text-sm font-semibold text-foreground mb-4">Add Nodes</h3>

      <div className="space-y-2">
        <p className="text-xs font-medium text-foreground-secondary mb-2">Input Nodes</p>
        <button
          onClick={() => onAddNode('imageUpload')}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-border hover:border-accent hover:bg-background transition-colors text-sm text-left text-foreground"
        >
          <Upload className="w-4 h-4 text-accent" />
          <span>Image Upload</span>
        </button>

        <p className="text-xs font-medium text-foreground-secondary mb-2 mt-4">Generation Nodes</p>
        <button
          onClick={() => onAddNode('imageGen')}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-border hover:border-accent hover:bg-background transition-colors text-sm text-left text-foreground"
        >
          <Sparkles className="w-4 h-4 text-success" />
          <span>Image Generate</span>
        </button>

        <div className="mt-6 p-3 bg-background rounded-lg border border-border">
          <p className="text-xs text-foreground-secondary">
            <strong className="text-foreground">Tip:</strong> Click to add nodes, drag outputs to inputs to connect them.
          </p>
        </div>

        {/* AI Workflow Generator */}
        <div className="mt-6">
          {showAIGenerator ? (
            <WorkflowGenerator
              onGenerate={onAIGenerate}
              onClose={() => onToggleAIGenerator(false)}
            />
          ) : (
            <button
              onClick={() => onToggleAIGenerator(true)}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-primary/80 to-accent/80 hover:from-primary hover:to-accent text-white rounded-lg transition-all font-medium text-sm"
            >
              <Sparkles className="w-4 h-4" />
              Generate with AI
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
