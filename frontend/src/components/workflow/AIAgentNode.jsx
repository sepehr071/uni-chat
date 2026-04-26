import { memo } from 'react';
import { Bot } from 'lucide-react';
import { AI_AGENT_MODELS } from '../../constants/workflowModels';
import CompactNodeShell from './CompactNodeShell';

const truncate = (str, max) =>
  str && str.length > max ? str.slice(0, max) + '…' : str || '';

function AIAgentNode({ data, selected, isConnectable }) {
  const modelEntry = AI_AGENT_MODELS.find((m) => m.id === data.model);
  const shortModelName = modelEntry?.name ?? 'No model';
  const promptSnippet = truncate(data.systemPrompt, 30);
  const summary = promptSnippet
    ? `${shortModelName} · ${promptSnippet}`
    : shortModelName;

  return (
    <CompactNodeShell
      selected={selected}
      isRunning={!!data.isRunning}
      hasError={false}
      icon={Bot}
      iconColor="bg-accent/10"
      iconTextColor="text-accent"
      title={data.label || 'AI Agent'}
      statusDot={data.output ? 'ok' : null}
      summary={summary}
      leftHandles={[
        { id: 'input-0', top: '35%' },
        { id: 'input-1', top: '65%' },
      ]}
      rightHandles={[{ id: 'output', top: '50%' }]}
      isConnectable={isConnectable}
    />
  );
}

export default memo(AIAgentNode);
