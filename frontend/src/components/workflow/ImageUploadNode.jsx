import { memo } from 'react';
import { Upload } from 'lucide-react';
import CompactNodeShell from './CompactNodeShell';

const summary = (data) => {
  if (data.imageUrl) {
    return (
      <span className="flex items-center gap-1 truncate">
        <img
          src={data.imageUrl}
          alt=""
          className="h-3 w-3 rounded object-cover flex-shrink-0"
        />
        <span className="truncate">{data.imageName || 'Image loaded'}</span>
      </span>
    );
  }
  return data.imageName || 'No image';
};

function ImageUploadNode({ data, selected, isConnectable }) {
  return (
    <CompactNodeShell
      selected={selected}
      isRunning={false}
      hasError={false}
      icon={Upload}
      iconColor="bg-accent/10"
      iconTextColor="text-accent"
      title={data.label || 'Image Upload'}
      statusDot={data.imageUrl ? 'ok' : null}
      summary={summary(data)}
      leftHandles={[]}
      rightHandles={[{ id: 'output', top: '50%' }]}
      isConnectable={isConnectable}
    />
  );
}

export default memo(ImageUploadNode);
