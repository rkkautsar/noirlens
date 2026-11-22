import * as Haptics from 'expo-haptics';
import { useMemo, useRef } from 'react';
import { PanResponder, StyleSheet, View } from 'react-native';

import { colors } from '@/theme';

const HEIGHT = 110;
const THUMB = 14;

/** Vertical scanline-intensity slider, 0 = none, 1 = thickest. */
export function ScanlineSlider({
  value,
  onChange,
}: {
  value: number;
  onChange: (value: number) => void;
}) {
  const lastStep = useRef(Math.round(value * 10));
  const update = (y: number) => {
    const next = Math.max(0, Math.min(1, 1 - y / HEIGHT));
    const step = Math.round(next * 10);
    if (step !== lastStep.current) {
      lastStep.current = step;
      void Haptics.selectionAsync().catch(() => {});
    }
    onChange(next);
  };
  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (event) => update(event.nativeEvent.locationY),
        onPanResponderMove: (event) => update(event.nativeEvent.locationY),
      }),
    // update reads the latest value through refs only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  return (
    <View style={styles.touch} {...responder.panHandlers}>
      <View style={styles.track} />
      <View style={[styles.thumb, { bottom: value * (HEIGHT - THUMB) }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  touch: {
    width: 30,
    height: HEIGHT,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  track: {
    width: 2,
    height: HEIGHT,
    borderRadius: 1,
    backgroundColor: colors.border,
  },
  thumb: {
    position: 'absolute',
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB / 2,
    backgroundColor: colors.accent,
  },
});
