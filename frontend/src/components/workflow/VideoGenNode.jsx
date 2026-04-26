import { memo } from 'react';
import { Video } from 'lucide-react';
import { VIDEO_GEN_MODELS, VIDEO_MODEL_SPECS } from '../../constants/workflowModels';
import CompactNodeShell from './CompactNodeShell';

function VideoGenNode({ data, selected, isConnectable }) {
  const modelId = VIDEO_GEN_MODELS.find((m) => m.id === data.model)
    ? data.model
    : VIDEO_GEN_MODELS[0].id;
  const spec = VIDEO_MODEL_SPECS[modelId] || {};

  const duration = spec.durations?.includes(data.duration)
    ? data.duration
    : (VIDEO_GEN_MODELS.find((m) => m.id === modelId)?.defaultDuration ?? 8);
  const resolution = spec.resolutions?.includes(data.resolution)
    ? data.resolution
    : (VIDEO_GEN_MODELS.find((m) => m.id === modelId)?.defaultResolution ?? '1080p');
  const aspectRatio = spec.aspectRatios?.includes(data.aspectRatio)
    ? data.aspectRatio
    : (VIDEO_GEN_MODELS.find((m) => m.id === modelId)?.defaultAspectRatio ?? '16:9');

  const isRendering = data.isRunning || data.status === 'in_progress' || data.status === 'pending';

  const summaryText = `${resolution} · ${duration}s · ${aspectRatio}`;
  const summary = isRendering ? (
    <span className="inline-flex items-center gap-1">
      <span className="inline-block px-1.5 py-0.5 rounded text-[10px] bg-accent/20 text-accent font-medium">
        rendering{data.progress != null ? ` ${data.progress}%` : ''}
      </span>
    </span>
  ) : (
    summaryText
  );

  return (
    <CompactNodeShell
      selected={selected}
      isRunning={isRendering}
      hasError={data.status === 'failed'}
      icon={Video}
      iconColor="bg-warning/10"
      iconTextColor="text-warning"
      title={data.label || 'Video Gen'}
      statusDot={data.videoUrl ? 'ok' : data.status === 'failed' ? 'error' : null}
      summary={summary}
      lastRunAt={data.lastRunAt}
      leftHandles={[
        { id: 'frame_image', top: '30%', label: 'Keyframe image' },
        { id: 'prompt_text', top: '70%', label: 'Prompt text' },
      ]}
      rightHandles={[{ id: 'output', top: '50%', label: 'Video out' }]}
      isConnectable={isConnectable}
    />
  );
}

export default memo(VideoGenNode);
