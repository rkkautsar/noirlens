// A one-shot request to open the capture history after returning to the
// camera. The camera screen consumes it on focus, so the capture detail can
// dismiss itself without leaving a duplicate route or a URL param.
let pending = false;

export function requestCaptureHistory(): void {
  pending = true;
}

export function consumeCaptureHistory(): boolean {
  const value = pending;
  pending = false;
  return value;
}
