import { memo } from 'react';
import { Volume2 } from 'lucide-react';
import { TTS_VOICES } from '../../constants/workflowModels';
import CompactNodeShell from './CompactNodeShell';

function TTSNode({ data, selected, isConnectable }) {
  const voice = data.voice && TTS_VOICES.includes(data.voice) ? data.voice : null;
  const speed = typeof data.speed === 'number' ? data.speed : 1.0;
  const summary = voice ? `${voice} · ${speed.toFixed(1)}x` : 'Choose voice';

  return (
    <CompactNodeShell
      selected={selected}
      isRunning={!!data.isRunning}
      hasError={false}
      icon={Volume2}
      iconColor="bg-info/10"
      iconTextColor="text-info"
      title={data.label || 'TTS'}
      statusDot={data.audioDataUri ? 'ok' : null}
      summary={summary}
      lastRunAt={data.lastRunAt}
      leftHandles={[{ id: 'input-0', top: '50%', label: 'Script text' }]}
      rightHandles={[{ id: 'output', top: '50%', label: 'Audio out' }]}
      isConnectable={isConnectable}
    />
  );
}

export default memo(TTSNode);
