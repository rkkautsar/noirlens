import { useEffect, useRef } from 'react';
import {
  Animated,
  Easing,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';

import { colors } from '@/theme';

const BLADES = 8;
const OPEN_MS = 230;
const CLOSE_MS = 170;

/**
 * Octagonal leaf shutter. Eight black blades sit over the viewfinder and slide
 * radially outward as the hold begins, so the clear center grows from a point
 * into an octagon; releasing closes it again. Pure native-driver transforms.
 */
export function ShutterOverlay({ open }: { open: boolean }) {
  const progress = useRef(new Animated.Value(0)).current;
  const { width, height } = useWindowDimensions();

  useEffect(() => {
    Animated.timing(progress, {
      toValue: open ? 1 : 0,
      duration: open ? OPEN_MS : CLOSE_MS,
      easing: open ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [open, progress]);

  const diagonal = Math.hypot(width, height);
  const size = diagonal * 1.05;
  const travel = size / 2 + diagonal * 0.6;
  const offset = useRef(
    progress.interpolate({ inputRange: [0, 1], outputRange: [0, -travel] }),
  ).current;

  const blades = Array.from({ length: BLADES }, (_, index) => {
    const angle = (360 / BLADES) * index;
    return (
      <Animated.View
        key={angle}
        style={[
          styles.blade,
          {
            width: size,
            height: size,
            left: width / 2 - size / 2,
            top: height / 2 - size / 2,
            transform: [{ rotate: `${angle}deg` }, { translateY: offset }],
          },
        ]}
      />
    );
  });

  return (
    <View pointerEvents="none" style={styles.viewport}>
      {blades}
    </View>
  );
}

const styles = StyleSheet.create({
  // The blades are much larger than the screen; clip them so the document
  // never gains scrollable overflow on web.
  viewport: {
    ...StyleSheet.absoluteFill,
    overflow: 'hidden',
  },
  blade: {
    position: 'absolute',
    backgroundColor: colors.background,
  },
});
