import { memo } from 'react';
import { Type } from 'lucide-react';
import CompactNodeShell from './CompactNodeShell';

const truncate = (str, max) =>
  str && str.length > max ? str.slice(0, max) + '…' : str || '';

function TextInputNode({ data, selected, isConnectable }) {
  return (
    <CompactNodeShell
      selected={selected}
      isRunning={false}
      hasError={false}
      icon={Type}
      iconColor="bg-info/10"
      iconTextColor="text-info"
      title={data.label || 'Text Input'}
      statusDot={null}
      summary={data.text ? truncate(data.text, 40) : 'No text'}
      leftHandles={[]}
      rightHandles={[{ id: 'output', top: '50%' }]}
      isConnectable={isConnectable}
    />
  );
}

export default memo(TextInputNode);
