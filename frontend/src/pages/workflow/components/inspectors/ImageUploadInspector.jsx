import { useState, useCallback } from 'react';
import { Image as ImageIcon, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { cn } from '@/utils/cn';

/**
 * Inspector for Image Upload nodes.
 * Props: { node, activeTab, updateNodeData, onRunNode, runHistory }
 */
export default function ImageUploadInspector({ node, activeTab, updateNodeData, runHistory = [] }) {
  const { data } = node;
  const [isDragging, setIsDragging] = useState(false);

  const handleFileSelect = useCallback((file) => {
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      updateNodeData(node.id, {
        imageUrl: e.target.result,
        imageName: file.name,
      });
    };
    reader.readAsDataURL(file);
  }, [node.id, updateNodeData]);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setIsDragging(false);
    handleFileSelect(e.dataTransfer.files[0]);
  }, [handleFileSelect]);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => setIsDragging(false), []);

  const handleInputChange = useCallback((e) => {
    handleFileSelect(e.target.files[0]);
  }, [handleFileSelect]);

  const clearImage = useCallback(() => {
    updateNodeData(node.id, { imageUrl: null, imageName: null });
  }, [node.id, updateNodeData]);

  const nodeHistory = runHistory.filter((r) => r.nodeId === node.id);

  if (activeTab === 'output') {
    return (
      <div className="p-4 overflow-y-auto h-full">
        {data.imageUrl ? (
          <div className="space-y-3">
            <img
              src={data.imageUrl}
              alt="Uploaded"
              className="w-full rounded-lg border border-border object-contain max-h-72"
            />
            {data.imageName && (
              <p className="text-xs text-foreground-secondary truncate">{data.imageName}</p>
            )}
          </div>
        ) : (
          <p className="text-sm text-foreground-secondary italic">No image uploaded yet.</p>
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
            <div key={i} className="border border-border rounded-lg p-3 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-medium text-foreground">{run.status ?? 'completed'}</span>
                <span className="text-foreground-tertiary">{run.createdAt ?? ''}</span>
              </div>
            </div>
          ))
        )}
      </div>
    );
  }

  // Configure tab
  return (
    <div className="p-4 space-y-4 overflow-y-auto h-full">
      <div className="space-y-1.5">
        <Label className="text-xs font-semibold uppercase tracking-wide text-foreground-secondary">
          Image
        </Label>

        {data.imageUrl ? (
          <div className="relative">
            <img
              src={data.imageUrl}
              alt="Uploaded"
              className="w-full h-40 object-cover rounded-lg border border-border"
            />
            <button
              onClick={clearImage}
              className="absolute top-2 right-2 p-1 rounded-full bg-background/80 hover:bg-background text-foreground-secondary hover:text-destructive transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
            {data.imageName && (
              <p className="mt-1.5 text-xs text-foreground-secondary truncate">{data.imageName}</p>
            )}
            <Button
              variant="outline"
              size="sm"
              className="mt-2 w-full"
              onClick={() => document.getElementById(`img-upload-${node.id}`).click()}
            >
              Replace Image
            </Button>
            <input
              id={`img-upload-${node.id}`}
              type="file"
              accept="image/*"
              onChange={handleInputChange}
              className="hidden"
            />
          </div>
        ) : (
          <label
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            className={cn(
              'flex flex-col items-center justify-center w-full h-40 rounded-lg border-2 border-dashed cursor-pointer transition-colors',
              isDragging
                ? 'border-accent bg-accent/10'
                : 'border-border hover:border-accent/50 hover:bg-background-secondary',
            )}
          >
            <ImageIcon className="h-8 w-8 text-foreground-tertiary mb-2" />
            <span className="text-sm text-foreground-secondary font-medium">Drop image or click to upload</span>
            <span className="text-xs text-foreground-tertiary mt-1">PNG, JPG, WEBP, GIF</span>
            <input
              type="file"
              accept="image/*"
              onChange={handleInputChange}
              className="hidden"
            />
          </label>
        )}
      </div>
    </div>
  );
}
