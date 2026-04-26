import { useCallback } from 'react';
import { Download } from 'lucide-react';
import { IMAGE_GEN_MODELS } from '@/constants/workflowModels';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';

/**
 * Inspector for Image Generate nodes.
 * Props: { node, activeTab, updateNodeData, onRunNode, runHistory }
 */
export default function ImageGenInspector({ node, activeTab, updateNodeData, runHistory = [] }) {
  const { data } = node;

  const handleDownload = useCallback(() => {
    if (!data.generatedImage) return;
    const a = document.createElement('a');
    a.href = data.generatedImage;
    a.download = 'generated-image.png';
    a.click();
  }, [data.generatedImage]);

  const nodeHistory = runHistory.filter((r) => r.nodeId === node.id);
  const selectedModel = IMAGE_GEN_MODELS.find((m) => m.id === data.model) || IMAGE_GEN_MODELS[0];

  if (activeTab === 'output') {
    return (
      <div className="p-4 space-y-4 overflow-y-auto h-full">
        {data.generatedImage ? (
          <>
            <img
              src={data.generatedImage}
              alt="Generated"
              className="w-full rounded-lg border border-border object-contain max-h-72"
            />
            <Button variant="outline" size="sm" onClick={handleDownload} className="w-full">
              <Download className="h-4 w-4 mr-2" />
              Download
            </Button>
          </>
        ) : (
          <p className="text-sm text-foreground-secondary italic">No image generated yet. Run the workflow to see results.</p>
        )}
      </div>
    );
  }

  if (activeTab === 'history') {
    return (
      <div className="p-4 space-y-3 overflow-y-auto h-full">
        {nodeHistory.length === 0 ? (
          <p className="text-sm text-foreground-secondary italic">No runs yet for this node.</p>
        ) : (
          nodeHistory.map((run, i) => (
            <div key={i} className="border border-border rounded-lg p-3 text-xs space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-medium text-foreground">{run.status ?? 'completed'}</span>
                <span className="text-foreground-tertiary">{run.createdAt ?? ''}</span>
              </div>
              {run.output && (
                <img src={run.output} alt="" className="w-full rounded object-cover h-24" />
              )}
            </div>
          ))
        )}
      </div>
    );
  }

  // Configure tab
  return (
    <div className="p-4 space-y-4 overflow-y-auto h-full">
      {/* Model */}
      <div className="space-y-1.5">
        <Label className="text-xs font-semibold uppercase tracking-wide text-foreground-secondary">
          Model
        </Label>
        <Select
          value={data.model || IMAGE_GEN_MODELS[0].id}
          onValueChange={(val) => updateNodeData(node.id, { model: val })}
        >
          <SelectTrigger className="text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {IMAGE_GEN_MODELS.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-[11px] text-foreground-tertiary">
          Max {selectedModel.maxInputs} reference image{selectedModel.maxInputs !== 1 ? 's' : ''}
        </p>
      </div>

      {/* Prompt */}
      <div className="space-y-1.5">
        <Label className="text-xs font-semibold uppercase tracking-wide text-foreground-secondary">
          Prompt
        </Label>
        <Textarea
          rows={4}
          placeholder="Describe the image..."
          value={data.prompt || ''}
          onChange={(e) => updateNodeData(node.id, { prompt: e.target.value })}
          className="text-sm resize-none"
        />
      </div>

      {/* Negative prompt */}
      <div className="space-y-1.5">
        <Label className="text-xs font-semibold uppercase tracking-wide text-foreground-secondary">
          Negative Prompt
        </Label>
        <Textarea
          rows={2}
          placeholder="What to avoid..."
          value={data.negativePrompt || ''}
          onChange={(e) => updateNodeData(node.id, { negativePrompt: e.target.value })}
          className="text-sm resize-none"
        />
      </div>

      {/* Reference images info */}
      <div className="space-y-1.5">
        <Label className="text-xs font-semibold uppercase tracking-wide text-foreground-secondary">
          Reference Images
        </Label>
        <p className="text-xs text-foreground-secondary">
          Connect up to {selectedModel.maxInputs} Image Upload nodes to the left handles to use as references.
        </p>
      </div>
    </div>
  );
}
