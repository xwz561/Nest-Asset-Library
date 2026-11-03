import { useState } from "react";

export function usePreview() {
  const [previewId, setPreviewId] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [thumbnailSize, setThumbnailSize] = useState(null);
  const [rotation, setRotation] = useState(0);
  const [checker, setChecker] = useState(false);

  return { previewId, setPreviewId, zoom, setZoom, thumbnailSize, setThumbnailSize, rotation, setRotation, checker, setChecker };
}
