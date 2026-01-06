import { memo, useCallback, useState } from 'react';
import { Handle, Position } from 'reactflow';
import { Upload, X, Image as ImageIcon } from 'lucide-react';
import { cn } from '../../utils/cn';

function ImageUploadNode({ data, isConnectable }) {
  const [isDragging, setIsDragging] = useState(false);

  const handleFileSelect = useCallback((file) => {
    if (!file || !file.type.startsWith('image/')) {
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      if (data.onImageChange) {
        data.onImageChange(e.target.result);
      }
    };
    reader.readAsDataURL(file);
  }, [data]);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    handleFileSelect(file);
  }, [handleFileSelect]);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleInputChange = useCallback((e) => {
    const file = e.target.files[0];
    handleFileSelect(file);
  }, [handleFileSelect]);

  const clearImage = useCallback(() => {
    if (data.onImageChange) {
      data.onImageChange(null);
    }
  }, [data]);

  return (
    <div className="bg-background border-2 border-border rounded-xl shadow-lg min-w-[200px]">
      {/* Header */}
      <div className="px-3 py-2 border-b border-border bg-background-secondary rounded-t-xl">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-accent/10">
            <Upload className="w-4 h-4 text-accent" />
          </div>
          <span className="font-medium text-sm text-foreground">
            {data.label || 'Image Upload'}
          </span>
        </div>
      </div>

      {/* Content */}
      <div className="p-3">
        {data.imageUrl ? (
          <div className="relative">
            <img
              src={data.imageUrl}
              alt="Uploaded"
              className="w-full h-32 object-cover rounded-lg"
            />
            <button
              onClick={clearImage}
              className="absolute top-1 right-1 p-1 rounded-full bg-background/80 hover:bg-background text-foreground-secondary hover:text-error transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <label
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            className={cn(
              "flex flex-col items-center justify-center w-full h-32 rounded-lg border-2 border-dashed cursor-pointer transition-colors",
              isDragging
                ? "border-accent bg-accent/10"
                : "border-border hover:border-accent/50 hover:bg-background-tertiary"
            )}
          >
            <ImageIcon className="w-8 h-8 text-foreground-tertiary mb-2" />
            <span className="text-xs text-foreground-secondary">
              Drop image or click
            </span>
            <input
              type="file"
              accept="image/*"
              onChange={handleInputChange}
              className="hidden"
            />
          </label>
        )}
      </div>

      {/* Output Handle */}
      <Handle
        type="source"
        position={Position.Right}
        id="output"
        isConnectable={isConnectable}
        className="!w-3 !h-3 !bg-accent !border-2 !border-background"
      />
    </div>
  );
}

export default memo(ImageUploadNode);
