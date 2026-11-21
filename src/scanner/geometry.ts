import type { ScanBlock } from '@/scanner/machine';

export interface Size {
  width: number;
  height: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Rect occupied by an image inside a container. `contain` letterboxes (all of
 * the frame is visible), `cover` crops (the frame fills the container).
 */
export function imageFitRect(
  image: Size,
  container: Size,
  mode: 'contain' | 'cover' = 'contain',
): Rect {
  if (image.width <= 0 || image.height <= 0) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }
  const scale =
    mode === 'contain'
      ? Math.min(container.width / image.width, container.height / image.height)
      : Math.max(container.width / image.width, container.height / image.height);
  const width = image.width * scale;
  const height = image.height * scale;
  return {
    x: (container.width - width) / 2,
    y: (container.height - height) / 2,
    width,
    height,
  };
}

export function mapBlockRect(
  block: Pick<ScanBlock, 'x' | 'y' | 'width' | 'height'>,
  imageRect: Rect,
): Rect {
  return {
    x: imageRect.x + block.x * imageRect.width,
    y: imageRect.y + block.y * imageRect.height,
    width: block.width * imageRect.width,
    height: block.height * imageRect.height,
  };
}
