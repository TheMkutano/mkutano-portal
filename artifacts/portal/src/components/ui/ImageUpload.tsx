import { useRef, useState } from "react";
import { Upload, X, Loader2 } from "lucide-react";
import { projectObjectUrl } from "@/lib/projectObjectUrl";

interface ImageUploadProps {
  currentUrl?: string | null;
  conveningId: string | null | undefined;
  onUpload: (objectPath: string) => Promise<void>;
  onRemove?: () => Promise<void>;
  shape?: "circle" | "square";
  size?: "sm" | "md" | "lg";
  placeholder?: string;
  accept?: string;
}

function objectPathToSrc(path: string, conveningId: string | null | undefined): string {
  if (!path) return "";
  return projectObjectUrl(path, conveningId);
}

const sizeClasses = {
  sm: "h-16 w-16",
  md: "h-24 w-24",
  lg: "h-32 w-32",
};

export default function ImageUpload({
  currentUrl,
  conveningId,
  onUpload,
  onRemove,
  shape = "square",
  size = "md",
  placeholder = "Upload",
  accept = "image/jpeg,image/png,image/webp",
}: ImageUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  const imgSrc = preview ?? (currentUrl ? objectPathToSrc(currentUrl, conveningId) : null);
  const roundClass = shape === "circle" ? "rounded-full" : "rounded-lg";
  const sizeClass = sizeClasses[size];

  async function handleFile(file: File) {
    if (!file.type.startsWith("image/")) {
      setError("Please select an image file.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("Image must be under 5 MB.");
      return;
    }
    setError(null);
    setUploading(true);

    const localPreview = URL.createObjectURL(file);
    setPreview(localPreview);

    try {
      const urlRes = await fetch("/api/storage/uploads/request-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type, conveningId }),
        credentials: "include",
      });
      if (!urlRes.ok) throw new Error("Could not get upload URL");
      const { uploadURL, objectPath } = await urlRes.json();

      const uploadRes = await fetch(uploadURL, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!uploadRes.ok) throw new Error("Upload failed");

      await onUpload(objectPath);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed. Please try again.");
      setPreview(null);
      URL.revokeObjectURL(localPreview);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) void handleFile(file);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) void handleFile(file);
  }

  async function handleRemove(ev: React.MouseEvent) {
    ev.stopPropagation();
    setPreview(null);
    if (onRemove) await onRemove();
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <div
        className={`relative ${sizeClass} ${roundClass} border-2 border-dashed border-gray-200 bg-gray-50 hover:border-gray-400 hover:bg-gray-100 transition-colors cursor-pointer overflow-hidden group`}
        onClick={() => !uploading && inputRef.current?.click()}
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
      >
        {imgSrc ? (
          <>
            <img src={imgSrc} alt="Upload" className={`${sizeClass} ${roundClass} object-cover`} />
            <div className={`absolute inset-0 ${roundClass} bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center`}>
              {uploading ? (
                <Loader2 className="h-5 w-5 text-white animate-spin" />
              ) : (
                <Upload className="h-5 w-5 text-white" />
              )}
            </div>
            {!uploading && onRemove && (
              <button
                onClick={handleRemove}
                className="absolute top-1 right-1 h-5 w-5 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </>
        ) : (
          <div className="flex flex-col items-center justify-center h-full gap-1 px-2">
            {uploading ? (
              <Loader2 className="h-5 w-5 text-gray-400 animate-spin" />
            ) : (
              <>
                <Upload className="h-5 w-5 text-gray-400" />
                <span className="text-[10px] text-gray-400 text-center leading-tight">{placeholder}</span>
              </>
            )}
          </div>
        )}
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          className="hidden"
          onChange={handleChange}
        />
      </div>
      {error && <p className="text-xs text-red-500 max-w-[160px]">{error}</p>}
    </div>
  );
}
