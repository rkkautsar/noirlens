import {
  Suspense,
  createContext,
  lazy,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { usePathname } from 'expo-router';
import { AppSheet } from './AppSheet';

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
      travelerOnly?: boolean;
      onSelect: (code: string) => void;
    }

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
  const pathname = usePathname();
  const [sheet, setSheet] = useState<{
    request: SheetRequest;
    origin: string;
  } | null>(null);

  useEffect(() => {
    // Close a sheet left open by a screen we navigated away from; a sheet the
    // newly focused screen opened is not stale.
    setSheet((current) =>
      current && current.origin !== pathname ? null : current,
    );
  }, [pathname]);

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
  const handleDismiss = closeSheet;
  const value = useMemo(
    () => ({
      openSheet,
      closeSheet,
      sheetOpen: sheet !== null,
    }),
    [openSheet, closeSheet, sheet],
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
            travelerOnly={languageRequest.travelerOnly}
            onSelect={(code) => {
              closeSheet();
              languageRequest.onSelect(code);
            }}
          />
            ) : null}
          </Suspense>
        </AppSheet>
      ) : null}
    </SheetContext.Provider>
  );
}
