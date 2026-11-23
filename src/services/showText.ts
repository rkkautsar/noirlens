/**
 * Font size for the show-to-local presentation: larger text on longer
 * strings would overflow, so the size steps down with length and is clamped
 * to the viewport.
 */
export function showFontSize(
  length: number,
  width: number,
  height: number,
): number {
  const byWidth = width * 0.16;
  let size: number;
  if (length <= 40) {
    size = Math.min(byWidth, height * 0.22);
  } else if (length <= 120) {
    size = Math.min(byWidth * 0.68, height * 0.16);
  } else if (length <= 280) {
    size = Math.min(byWidth * 0.48, height * 0.11);
  } else {
    size = Math.min(byWidth * 0.36, height * 0.082);
  }
  return Math.max(20, Math.round(size));
}
