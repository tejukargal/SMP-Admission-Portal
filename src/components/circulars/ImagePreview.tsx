import { AutoScrollViewer } from './AutoScrollViewer';

interface ImagePreviewProps {
  url: string;
  name: string;
}

/** Compact slowly-scrolling preview for JPG/PNG attachments. */
export function ImagePreview({ url, name }: ImagePreviewProps) {
  return (
    <AutoScrollViewer>
      <img src={url} alt={name} draggable={false} className="w-full h-auto block" />
    </AutoScrollViewer>
  );
}
