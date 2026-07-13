import { useState } from 'react';
import { AutoScrollViewer } from './AutoScrollViewer';

interface ImagePreviewProps {
  url: string;
  name: string;
}

/** Compact slowly-scrolling preview for JPG/PNG attachments. */
export function ImagePreview({ url, name }: ImagePreviewProps) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return <p className="text-xs text-gray-400 text-center py-8">Preview unavailable — use the download button above.</p>;
  }

  return (
    <AutoScrollViewer>
      <img
        src={url}
        alt={name}
        draggable={false}
        className="w-full h-auto block"
        onError={() => {
          console.error('[ImagePreview] failed to load', url);
          setFailed(true);
        }}
      />
    </AutoScrollViewer>
  );
}
