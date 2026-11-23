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

  const footer =
    actions || dock ? (
      <View style={styles.footer}>
        {actions ? <View style={styles.actions}>{actions}</View> : null}
        {dock}
      </View>
    ) : null;

  if (backdrop) {
    // Full-bleed screens keep the content viewport at full screen so camera
    // reticle coordinates stay relative to the native preview; chrome and
    // dock float above it.
    return (
      <View style={styles.root}>
        <View style={styles.backdrop}>{backdrop}</View>
        <View style={styles.floatingHeader}>{header}</View>
        <View style={styles.fullViewport}>{children}</View>
        {footer ? <View style={styles.floatingFooter}>{footer}</View> : null}
        {overlay}
      </View>
    );
  }

  return (
    <View style={styles.root}>
      {header}
      <View style={styles.viewport}>{children}</View>
      {footer}
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
  fullViewport: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  floatingFooter: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  footer: {
    gap: 8,
  },
  actions: {
    paddingHorizontal: 20,
  },
});
