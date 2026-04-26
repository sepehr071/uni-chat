import { useState, useCallback } from 'react';
import { Film, Copy, Check, Maximize2, AlertTriangle } from 'lucide-react';
import { VIDEO_GEN_MODELS, VIDEO_MODEL_SPECS } from '@/constants/workflowModels';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { ConfigSection, Field } from './NodeConfigForm';

/**
 * Inspector for Video Gen nodes.
 * Props: { node, activeTab, updateNodeData, onRunNode, runHistory }
 */
export default function VideoGenInspector({ node, activeTab, updateNodeData, runHistory = [] }) {
  const { data } = node;
  const [copied, setCopied] = useState(false);
  const [showFullscreen, setShowFullscreen] = useState(false);

  const modelId = VIDEO_GEN_MODELS.find((m) => m.id === data.model)
    ? data.model
    : VIDEO_GEN_MODELS[0].id;
  const modelEntry = VIDEO_GEN_MODELS.find((m) => m.id === modelId);
  const spec = VIDEO_MODEL_SPECS[modelId] || {};

  const duration = spec.durations?.includes(data.duration) ? data.duration : (modelEntry?.defaultDuration ?? 8);
  const resolution = spec.resolutions?.includes(data.resolution) ? data.resolution : (modelEntry?.defaultResolution ?? '1080p');
  const aspectRatio = spec.aspectRatios?.includes(data.aspectRatio) ? data.aspectRatio : (modelEntry?.defaultAspectRatio ?? '16:9');
  const generateAudio = modelEntry?.supportsAudioToggle ? data.generateAudio !== false : true;
  const estCost = ((duration * (modelEntry?.pricePerSec ?? 0))).toFixed(2);

  const handleCopyUrl = useCallback(() => {
    if (data.videoUrl) {
      navigator.clipboard.writeText(data.videoUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [data.videoUrl]);

  const handleModelChange = useCallback((val) => {
    const newEntry = VIDEO_GEN_MODELS.find((m) => m.id === val);
    updateNodeData(node.id, {
      model: val,
      duration: newEntry?.defaultDuration ?? 8,
      resolution: newEntry?.defaultResolution ?? '1080p',
      aspectRatio: newEntry?.defaultAspectRatio ?? '16:9',
    });
  }, [node.id, updateNodeData]);

  const nodeHistory = runHistory.filter((r) => r.nodeId === node.id);
  const status = data.status || (data.isRunning ? 'in_progress' : data.videoUrl ? 'completed' : 'idle');

  if (activeTab === 'output') {
    return (
      <div className="p-4 space-y-4 overflow-y-auto h-full">
        {data.videoUrl ? (
          <>
            <div className="bg-success/10 border border-success/20 rounded-lg overflow-hidden">
              <div className="flex items-center justify-between px-3 py-2 border-b border-success/20 bg-success/5">
                <span className="text-xs font-medium text-success">
                  Video{data.durationSec ? ` ${data.durationSec}s` : ''}
                  {data.resolution ? ` · ${data.resolution}` : ''}
                </span>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleCopyUrl} title="Copy URL">
                    {copied ? <Check className="h-3 w-3 text-success" /> : <Copy className="h-3 w-3" />}
                  </Button>
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setShowFullscreen(true)} title="Fullscreen">
                    <Maximize2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
              <video controls src={data.videoUrl} className="w-full max-h-64 bg-black" />
            </div>
          </>
        ) : status === 'failed' && data.error ? (
          <div className="text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">
            {data.error}
          </div>
        ) : (
          <p className="text-sm text-foreground-secondary italic">No video generated yet. Run the workflow to see results.</p>
        )}

        {/* Fullscreen modal */}
        {showFullscreen && data.videoUrl && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
            onClick={() => setShowFullscreen(false)}
          >
            <div
              className="bg-background border border-border rounded-xl shadow-2xl w-[90vw] max-w-4xl max-h-[90vh] flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                <div className="flex items-center gap-2">
                  <Film className="h-5 w-5 text-warning" />
                  <span className="font-medium">Generated Video</span>
                </div>
                <Button variant="outline" size="sm" onClick={() => setShowFullscreen(false)}>
                  Close
                </Button>
              </div>
              <div className="flex-1 overflow-auto p-4 bg-black/20 flex items-center justify-center">
                <video controls autoPlay src={data.videoUrl} className="max-w-full max-h-[70vh] rounded" />
              </div>
            </div>
          </div>
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
              {run.error && (
                <p className="text-destructive">{run.error}</p>
              )}
            </div>
          ))
        )}
      </div>
    );
  }

  // Configure tab
  return (
    <ConfigSection>
      {/* Cost banner — status alert, not a field */}
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-warning/10 border border-warning/30">
        <AlertTriangle className="h-3.5 w-3.5 text-warning flex-shrink-0" />
        <span className="text-xs text-foreground-secondary">
          Est. cost <span className="font-semibold text-foreground">~${estCost}</span>
          <span className="text-foreground-tertiary"> ({duration}s x ${(modelEntry?.pricePerSec ?? 0).toFixed(2)}/s)</span>
        </span>
      </div>

      <Field label="Model">
        <Select value={modelId} onValueChange={handleModelChange}>
          <SelectTrigger className="text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {VIDEO_GEN_MODELS.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <Field label="Prompt">
        <Textarea
          rows={3}
          placeholder="Describe the video, or connect a prompt input..."
          value={data.prompt || ''}
          onChange={(e) => updateNodeData(node.id, { prompt: e.target.value })}
          className="text-sm resize-none"
        />
      </Field>

      {/* Duration + Resolution — two-column grid */}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Duration (s)">
          <Select
            value={String(duration)}
            onValueChange={(val) => updateNodeData(node.id, { duration: parseInt(val, 10) })}
          >
            <SelectTrigger className="text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(spec.durations ?? [duration]).map((d) => (
                <SelectItem key={d} value={String(d)}>{d}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Resolution">
          <Select
            value={resolution}
            onValueChange={(val) => updateNodeData(node.id, { resolution: val })}
          >
            <SelectTrigger className="text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(spec.resolutions ?? [resolution]).map((r) => (
                <SelectItem key={r} value={r}>{r}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>

      {/* Aspect Ratio + Seed — two-column grid */}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Aspect Ratio">
          <Select
            value={aspectRatio}
            onValueChange={(val) => updateNodeData(node.id, { aspectRatio: val })}
          >
            <SelectTrigger className="text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(spec.aspectRatios ?? [aspectRatio]).map((r) => (
                <SelectItem key={r} value={r}>{r}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Seed">
          <Input
            type="number"
            placeholder="Random"
            value={data.seed ?? ''}
            onChange={(e) => updateNodeData(node.id, { seed: e.target.value === '' ? null : parseInt(e.target.value, 10) })}
            className="text-sm"
          />
        </Field>
      </div>

      {/* Generate audio toggle — custom inline-row layout to preserve Switch on the right */}
      {modelEntry?.supportsAudioToggle ? (
        <div className="flex items-center justify-between">
          <Label className="text-xs font-semibold uppercase tracking-wide text-foreground-secondary">
            Generate Audio (native)
          </Label>
          <Switch
            checked={generateAudio}
            onCheckedChange={(checked) => updateNodeData(node.id, { generateAudio: checked })}
          />
        </div>
      ) : (
        <p className="text-xs text-foreground-tertiary italic">
          Native audio always on for this model.
        </p>
      )}

      {!modelEntry?.supportsFrameImage && (
        <p className="text-xs text-foreground-tertiary italic">
          This model ignores the frame_image input (text-to-video only).
        </p>
      )}

      {/* Frame image reference note */}
      {modelEntry?.supportsFrameImage && (
        <Field
          label="Frame Image"
          help="Connect an Image Upload node to the top-left handle to use as a frame reference."
        />
      )}
    </ConfigSection>
  );
}
