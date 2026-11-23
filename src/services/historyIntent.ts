// A one-shot request to reopen the capture history on the camera after a
// result closes. The requesting sheet passes the tab the user left, so the
// camera restores that tab rather than its mode default.
export type HistoryTab = 'translations' | 'captures';

let pending: HistoryTab | null = null;

export function requestCaptureHistory(tab: HistoryTab): void {
  pending = tab;
}

export function clearCaptureHistory(): void {
  pending = null;
}

export function consumeCaptureHistory(): HistoryTab | null {
  const value = pending;
  pending = null;
  return value;
}
