import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { usePathname, useRouter, type Href } from 'expo-router';
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
  /** Close the sheet, then push once the platform reports dismissal. */
  navigateAfterClose: (href: Href) => void;
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
  const router = useRouter();
  const [sheet, setSheet] = useState<SheetRequest | null>(null);
  const [pendingHref, setPendingHref] = useState<Href | null>(null);
  const pathname = usePathname();
  const lastPath = useRef(pathname);

  useEffect(() => {
    if (lastPath.current !== pathname) {
      lastPath.current = pathname;
      setSheet(null);
      setPendingHref(null);
    }
  }, [pathname]);

  useEffect(() => {
    if (!pendingHref) {
      return;
    }
    const href = pendingHref;
    const timer = setTimeout(() => {
      setPendingHref(null);
      router.push(href);
    }, 250);
    return () => clearTimeout(timer);
  }, [pendingHref, router]);
  const closeSheet = useCallback(() => setSheet(null), []);
  const openSheet = useCallback(
    (request: SheetRequest) => setSheet(request),
    [],
  );
  const navigateAfterClose = useCallback((href: Href) => {
    setPendingHref(href);
    setSheet(null);
  }, []);
  const handleDismiss = useCallback(() => {
    setSheet(null);
    if (pendingHref) {
      const href = pendingHref;
      setPendingHref(null);
      router.push(href);
    }
  }, [pendingHref, router]);
  const value = useMemo(
    () => ({
      openSheet,
      closeSheet,
      navigateAfterClose,
      sheetOpen: sheet !== null,
    }),
    [openSheet, closeSheet, navigateAfterClose, sheet],
  );

  return (
    <SheetContext.Provider value={value}>
      {children}
      <AppSheet visible={sheet !== null} onClose={handleDismiss}>
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
