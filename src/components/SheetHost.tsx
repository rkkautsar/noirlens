import {
  Suspense,
  createContext,
  lazy,
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

const HistorySheet = lazy(() =>
  import('./HistorySheet').then((module) => ({ default: module.HistorySheet })),
);
const LanguagePickerSheet = lazy(() =>
  import('./LanguagePickerSheet').then((module) => ({
    default: module.LanguagePickerSheet,
  })),
);
const LanguagesSheet = lazy(() =>
  import('./LanguagesSheet').then((module) => ({
    default: module.LanguagesSheet,
  })),
);
const LookupSheet = lazy(() =>
  import('./LookupSheet').then((module) => ({ default: module.LookupSheet })),
);

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
  const pathname = usePathname();
  const [sheet, setSheet] = useState<{
    request: SheetRequest;
    origin: string;
  } | null>(null);
  const [pendingHref, setPendingHref] = useState<Href | null>(null);
  const pendingRef = useRef<Href | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPath = useRef(pathname);

  const takePending = useCallback(() => {
    const href = pendingRef.current;
    pendingRef.current = null;
    setPendingHref(null);
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    return href;
  }, []);

  const finishPending = useCallback(() => {
    const href = takePending();
    if (href) {
      router.push(href);
    }
  }, [router, takePending]);

  useEffect(() => {
    if (lastPath.current === pathname) {
      return;
    }
    lastPath.current = pathname;
    // Only a sheet from another screen is stale; a sheet the newly focused
    // screen opened is not.
    setSheet((current) =>
      current && current.origin !== pathname ? null : current,
    );
    takePending();
  }, [pathname, takePending]);

  useEffect(() => {
    if (!pendingHref) {
      return;
    }
    timerRef.current = setTimeout(finishPending, 250);
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [pendingHref, finishPending]);

  const [everOpened, setEverOpened] = useState(false);
  useEffect(() => {
    if (sheet !== null) {
      setEverOpened(true);
    }
  }, [sheet]);
  const closeSheet = useCallback(() => setSheet(null), []);
  const openSheet = useCallback(
    (request: SheetRequest) => setSheet({ request, origin: pathname }),
    [pathname],
  );
  const navigateAfterClose = useCallback((href: Href) => {
    pendingRef.current = href;
    setPendingHref(href);
    setSheet(null);
  }, []);
  const handleDismiss = useCallback(() => {
    setSheet(null);
    finishPending();
  }, [finishPending]);
  const value = useMemo(
    () => ({
      openSheet,
      closeSheet,
      navigateAfterClose,
      sheetOpen: sheet !== null,
    }),
    [openSheet, closeSheet, navigateAfterClose, sheet],
  );

  const languageRequest =
    sheet?.request.kind === 'languagePicker' ? sheet.request : null;

  return (
    <SheetContext.Provider value={value}>
      {children}
      {everOpened ? (
        <AppSheet
          visible={sheet !== null}
          onClose={handleDismiss}
          expanded={sheet?.request.kind === 'history'}
        >
          <Suspense fallback={null}>
            {sheet?.request.kind === 'lookup' ? (
          <LookupSheet
            q={sheet.request.q}
            alt={sheet.request.alt}
            onClose={closeSheet}
          />
        ) : sheet?.request.kind === 'languages' ? (
          <LanguagesSheet onClose={closeSheet} />
        ) : languageRequest ? (
          <LanguagePickerSheet
            title={languageRequest.title}
            selected={languageRequest.selected}
            allowAuto={languageRequest.allowAuto}
            onSelect={(code) => {
              closeSheet();
              languageRequest.onSelect(code);
            }}
          />
        ) : sheet?.request.kind === 'history' ? (
          <HistorySheet
            initialTab={sheet.request.initialTab}
            onClose={closeSheet}
          />
            ) : null}
          </Suspense>
        </AppSheet>
      ) : null}
    </SheetContext.Provider>
  );
}
