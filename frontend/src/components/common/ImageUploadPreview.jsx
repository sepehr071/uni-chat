import { useCallback, useState } from 'react'
import { Upload, X, ImageIcon, Loader2 } from 'lucide-react'
import { cn } from '../../utils/cn'
import toast from 'react-hot-toast'

export default function ImageUploadPreview({ images = [], maxImages = 5, onChange, disabled = false }) {
  const [isDragging, setIsDragging] = useState(false)
  const [loading, setLoading] = useState(false)

  const validateFile = (file) => {
    // Check if it's an image
    if (!file.type.startsWith('image/')) {
      toast.error('Only image files are allowed')
      return false
    }

    // Check file size (5MB limit)
    const maxSize = 5 * 1024 * 1024 // 5MB
    if (file.size > maxSize) {
      toast.error('Image size should be less than 5MB')
      return false
    }

    return true
  }

  const convertToBase64 = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result)
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
  }

  const handleFiles = async (files) => {
    const fileArray = Array.from(files)

    // Check total count
    if (images.length + fileArray.length > maxImages) {
      toast.error(`Maximum ${maxImages} images allowed`)
      return
    }

    // Validate all files
    const validFiles = fileArray.filter(validateFile)
    if (validFiles.length === 0) return

    setLoading(true)

    try {
      // Convert all to base64
      const base64Promises = validFiles.map(async (file) => {
        const base64 = await convertToBase64(file)
        return {
          file,
          preview: URL.createObjectURL(file),
          base64
        }
      })

      const newImages = await Promise.all(base64Promises)
      onChange([...images, ...newImages])
    } catch (error) {
      toast.error('Failed to process images')
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  const handleDrop = useCallback((e) => {
    e.preventDefault()
    setIsDragging(false)

    if (disabled) return

    const files = e.dataTransfer.files
    if (files.length > 0) {
      handleFiles(files)
    }
  }, [disabled, images, maxImages])

  const handleDragOver = useCallback((e) => {
    e.preventDefault()
    if (!disabled) {
      setIsDragging(true)
    }
  }, [disabled])

  const handleDragLeave = useCallback((e) => {
    e.preventDefault()
    setIsDragging(false)
  }, [])

  const handleFileSelect = (e) => {
    const files = e.target.files
    if (files.length > 0) {
      handleFiles(files)
    }
    e.target.value = '' // Reset input
  }

  const removeImage = (index) => {
    const newImages = images.filter((_, i) => i !== index)
    onChange(newImages)
  }

  return (
    <div className="space-y-3">
      {/* Upload Area */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={cn(
          'border-2 border-dashed rounded-lg p-6 text-center transition-colors',
          isDragging && !disabled ? 'border-primary bg-primary/5' : 'border-border',
          disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:border-primary/50'
        )}
      >
        <input
          type="file"
          id="image-upload"
          multiple
          accept="image/*"
          onChange={handleFileSelect}
          disabled={disabled || loading || images.length >= maxImages}
          className="hidden"
        />
        <label
          htmlFor="image-upload"
          className={cn(
            'flex flex-col items-center gap-2',
            disabled || loading || images.length >= maxImages ? 'cursor-not-allowed' : 'cursor-pointer'
          )}
        >
          {loading ? (
            <Loader2 className="w-8 h-8 text-foreground-tertiary animate-spin" />
          ) : (
            <Upload className="w-8 h-8 text-foreground-tertiary" />
          )}
          <div className="text-sm">
            {loading ? (
              <span className="text-foreground-secondary">Processing images...</span>
            ) : images.length >= maxImages ? (
              <span className="text-foreground-tertiary">Maximum images reached</span>
            ) : (
              <>
                <span className="text-foreground font-medium">Click to upload</span>
                <span className="text-foreground-secondary"> or drag and drop</span>
              </>
            )}
          </div>
          <p className="text-xs text-foreground-tertiary">
            {images.length}/{maxImages} images • PNG, JPG up to 5MB each
          </p>
        </label>
      </div>

      {/* Image Previews */}
      {images.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {images.map((image, index) => (
            <div
              key={index}
              className="relative group aspect-square bg-background-secondary rounded-lg overflow-hidden border border-border"
            >
              <img
                src={image.preview}
                alt={`Preview ${index + 1}`}
                className="w-full h-full object-cover"
              />
              <button
                onClick={() => removeImage(index)}
                disabled={disabled}
                className={cn(
                  'absolute top-1 right-1 p-1 bg-red-500 text-white rounded-full',
                  'opacity-0 group-hover:opacity-100 transition-opacity',
                  'hover:bg-red-600 disabled:opacity-50',
                  disabled && 'cursor-not-allowed'
                )}
              >
                <X className="w-4 h-4" />
              </button>
              <div className="absolute bottom-0 left-0 right-0 p-1 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity">
                <p className="text-xs text-white truncate">{image.file.name}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
