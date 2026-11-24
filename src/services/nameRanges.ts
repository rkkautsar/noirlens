export interface NameRange {
  start: number;
  end: number;
}

export interface NameState {
  text: string;
  ranges: NameRange[];
}

/** Ranges only when they were computed for this exact translation. */
export function resolvedNameRanges(
  state: NameState | null,
  text: string,
): NameRange[] | null {
  return state !== null && state.text === text ? state.ranges : null;
}
