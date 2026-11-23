import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import type { HistoryTab } from './HistorySheet';
import { AppSheet } from './AppSheet';
import { HistorySheet } from './HistorySheet';
import { LanguagePickerSheet } from './LanguagePickerSheet';
import { LanguagesSheet } from './LanguagesSheet';
import { LookupSheet } from './LookupSheet';

export type SheetRequest =
  | { kind: 'lookup'; q: string; alt?: string }
  | { kind: 'languages' }
  | {
      kind: 'languagePicker';
      title: string;
      selected: string;
      allowAuto?: boolean;
      onSelect: (code: string) => void;
    }
  | { kind: 'history'; initialTab?: HistoryTab };

type SheetContextValue = {
  openSheet: (request: SheetRequest) => void;
  closeSheet: () => void;
  sheetOpen: boolean;
};

const SheetContext = createContext<SheetContextValue | null>(null);

export function useSheet(): SheetContextValue {
  const value = useContext(SheetContext);
  if (!value) {
    throw new Error('useSheet must be used inside SheetHost');
  }
  return value;
}

/** One presentation owner for every app sheet, mounted above the navigator. */
export function SheetHost({ children }: { children: ReactNode }) {
  const [sheet, setSheet] = useState<SheetRequest | null>(null);
  const closeSheet = useCallback(() => setSheet(null), []);
  const openSheet = useCallback(
    (request: SheetRequest) => setSheet(request),
    [],
  );
  const value = useMemo(
    () => ({ openSheet, closeSheet, sheetOpen: sheet !== null }),
    [openSheet, closeSheet, sheet],
  );

  return (
    <SheetContext.Provider value={value}>
      {children}
      <AppSheet visible={sheet !== null} onClose={closeSheet}>
        {sheet?.kind === 'lookup' ? (
          <LookupSheet q={sheet.q} alt={sheet.alt} onClose={closeSheet} />
        ) : sheet?.kind === 'languages' ? (
          <LanguagesSheet onClose={closeSheet} />
        ) : sheet?.kind === 'languagePicker' ? (
          <LanguagePickerSheet
            title={sheet.title}
            selected={sheet.selected}
            allowAuto={sheet.allowAuto}
            onSelect={(code) => {
              closeSheet();
              sheet.onSelect(code);
            }}
          />
        ) : sheet?.kind === 'history' ? (
          <HistorySheet
            initialTab={sheet.initialTab}
            onClose={closeSheet}
          />
        ) : null}
      </AppSheet>
    </SheetContext.Provider>
  );
}
