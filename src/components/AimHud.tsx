import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { OcrCrop } from '../../modules/native-vision-translator';
import type { ScanError } from '@/scanner/machine';
import { useShellLayout } from './ScreenShell';
import { colors, typography } from '@/theme';
import { MicroLabel } from './ui';

function useAimFooterInset() {
  return useShellLayout().footerHeight + 8;
}

export function AimHud({
  scanning,
  error,
  onReticleFrame,
}: {
  scanning: boolean;
  error: ScanError | null;
  onReticleFrame?: (crop: OcrCrop) => void;
}) {
  const insets = useSafeAreaInsets();
  const footerInset = useAimFooterInset();
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [reticle, setReticle] = useState<LayoutChangeEvent['nativeEvent']['layout'] | null>(null);

  useEffect(() => {
    if (!onReticleFrame || !reticle) {
      return;
    }
    const { width: viewportWidth, height: viewportHeight } = viewport;
    const { x, y, width, height } = reticle;
    const size = Math.min(RETICLE_SIZE, width, height);
    if (size <= 0 || viewportWidth <= 0 || viewportHeight <= 0) {
      return;
    }
    // OCR sees a margin of context around the framed box, so the capture
    // crop is larger than the reticle while the reticle stays small.
    const pad = size * 0.16;
    const left = Math.max(0, x + (width - size) / 2 - pad);
    const top = Math.max(0, y + (height - size) / 2 - pad);
    const cropWidth = Math.min(viewportWidth - left, size + pad * 2);
    const cropHeight = Math.min(viewportHeight - top, size + pad * 2);
    onReticleFrame({
      x: left / viewportWidth,
      y: top / viewportHeight,
      width: cropWidth / viewportWidth,
      height: cropHeight / viewportHeight,
    });
  }, [onReticleFrame, reticle, viewport]);

  return (
    <View
      style={styles.container}
      pointerEvents="box-none"
      onLayout={(event) => {
        const { width, height } = event.nativeEvent.layout;
        setViewport({ width, height });
      }}
    >
      <View
        style={[
          styles.reticleArea,
          { top: insets.top + 64, bottom: insets.bottom + 116 },
        ]}
        pointerEvents="none"
        onLayout={(event) => setReticle(event.nativeEvent.layout)}
      >
        <View style={styles.reticle}>
          <View style={[styles.corner, styles.topLeft]} />
          <View style={[styles.corner, styles.topRight]} />
          <View style={[styles.corner, styles.bottomLeft]} />
          <View style={[styles.corner, styles.bottomRight]} />
          <View style={styles.crosshairHorizontal} />
          <View style={styles.crosshairVertical} />
        </View>
      </View>

      <View style={styles.footerWrap}>
        <View style={[styles.footer, { paddingBottom: footerInset }]}>
          {scanning ? (
            <>
              <View style={styles.readingRow}>
                <ActivityIndicator size="small" color={colors.accent} />
                <Text style={styles.status}>READING ON-DEVICE</Text>
              </View>
              <MicroLabel tone="dim">OCR + TRANSLATION · NO UPLOAD</MicroLabel>
            </>
          ) : (
            <>
              <Text style={styles.status}>FRAME THE TEXT</Text>
              <MicroLabel tone="dim">
                HOLD ANYWHERE · AIM · RELEASE
              </MicroLabel>
            </>
          )}
          {error ? (
            <Text style={styles.errorText} numberOfLines={2}>
              {error.message}
            </Text>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const RETICLE_SIZE = 230;
const CORNER = 22;
const CORNER_WIDTH = 1.5;

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  reticleArea: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reticle: {
    width: RETICLE_SIZE,
    height: RETICLE_SIZE,
  },
  corner: {
    position: 'absolute',
    width: CORNER,
    height: CORNER,
    borderColor: colors.accent,
  },
  topLeft: {
    top: 0,
    left: 0,
    borderTopWidth: CORNER_WIDTH,
    borderLeftWidth: CORNER_WIDTH,
  },
  topRight: {
    top: 0,
    right: 0,
    borderTopWidth: CORNER_WIDTH,
    borderRightWidth: CORNER_WIDTH,
  },
  bottomLeft: {
    bottom: 0,
    left: 0,
    borderBottomWidth: CORNER_WIDTH,
    borderLeftWidth: CORNER_WIDTH,
  },
  bottomRight: {
    bottom: 0,
    right: 0,
    borderBottomWidth: CORNER_WIDTH,
    borderRightWidth: CORNER_WIDTH,
  },
  crosshairHorizontal: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    width: 12,
    height: 1,
    marginLeft: -6,
    backgroundColor: colors.accent,
  },
  crosshairVertical: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    width: 1,
    height: 12,
    marginTop: -6,
    backgroundColor: colors.accent,
  },
  footerWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  footer: {
    paddingTop: 16,
    paddingHorizontal: 20,
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(0,0,0,0.78)',
  },
  readingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  status: {
    ...typography.label,
    color: colors.accent,
    letterSpacing: 2,
  },
  errorText: {
    ...typography.body,
    color: colors.warning,
    fontSize: 13,
    textAlign: 'center',
  },
});
