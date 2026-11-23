import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { ChromeHeader } from './ChromeHeader';
import type { AppMode } from './ModeTabs';
import { colors } from '@/theme';

/**
 * The one screen layout: chrome, a content viewport, and a footer dock.
 * Flow screens (result, translate) get the header in flow; full-bleed screens
 * (camera) pass `backdrop` and get the chrome and footer over it. The shell
 * owns all safe-area placement and the relationship between content and dock.
 */
export function ScreenShell({
  mode,
  remaining,
  unlimited,
  onPaywall,
  onCamera,
  onTranslate,
  backdrop,
  actions,
  dock,
  overlay,
  children,
}: {
  mode: AppMode;
  remaining: number | null;
  unlimited: boolean;
  onPaywall: () => void;
  onCamera: () => void;
  onTranslate: () => void;
  /** Full-bleed content behind the chrome (camera preview). */
  backdrop?: ReactNode;
  /** Action row above the dock. */
  actions?: ReactNode;
  /** Bottom control (scan shutter, composer). */
  dock?: ReactNode;
  /** Full-screen overlay above the shell (inspect). */
  overlay?: ReactNode;
  children: ReactNode;
}) {
  const header = (
    <ChromeHeader
      active={mode}
      remaining={remaining}
      unlimited={unlimited}
      onOpenPaywall={onPaywall}
      onCamera={onCamera}
      onTranslate={onTranslate}
    />
  );

  return (
    <View style={styles.root}>
      {backdrop ? <View style={styles.backdrop}>{backdrop}</View> : null}
      {backdrop ? <View style={styles.floatingHeader}>{header}</View> : header}
      <View style={styles.viewport}>{children}</View>
      {actions || dock ? (
        <View style={styles.footer}>
          {actions ? <View style={styles.actions}>{actions}</View> : null}
          {dock}
        </View>
      ) : null}
      {overlay}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  floatingHeader: {
    position: 'absolute',
    top: 0,
    right: 0,
    left: 0,
    zIndex: 20,
  },
  viewport: {
    flex: 1,
  },
  footer: {
    gap: 8,
  },
  actions: {
    paddingHorizontal: 20,
  },
});
