import { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Image,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';

import { colors } from '@/theme';

const SIZE = 76;
const POP_MS = 150;
const FLY_MS = 360;

/**
 * Flies the just-saved thumbnail from the center of the camera into the
 * History button. Purely visual: persistence and the badge counter never wait
 * for it, and Reduce Motion skips straight to the counter.
 */
export function CaptureFlight({
  thumbnail,
  targetX,
  targetY,
  onDone,
}: {
  thumbnail: string;
  targetX: number;
  targetY: number;
  onDone: () => void;
}) {
  const { width, height } = useWindowDimensions();
  const progress = useRef(new Animated.Value(0)).current;
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  const [reduceMotion, setReduceMotion] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => {
        if (active) {
          setReduceMotion(value);
        }
      })
      .catch(() => {
        if (active) {
          setReduceMotion(false);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (reduceMotion === null) {
      return;
    }
    if (reduceMotion) {
      doneRef.current();
      return;
    }
    const animation = Animated.sequence([
      Animated.timing(progress, {
        toValue: 0.2,
        duration: POP_MS,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(progress, {
        toValue: 1,
        duration: FLY_MS,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
    ]);
    animation.start(({ finished }) => {
      if (finished) {
        doneRef.current();
      }
    });
    return () => {
      animation.stop();
    };
  }, [progress, reduceMotion]);

  if (reduceMotion !== false) {
    return null;
  }

  const translateX = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, targetX - width / 2],
  });
  const translateY = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, targetY - height / 2],
  });
  const scale = progress.interpolate({
    inputRange: [0, 0.2, 1],
    outputRange: [0.62, 1, 0.28],
  });
  const opacity = progress.interpolate({
    inputRange: [0, 0.08, 0.82, 1],
    outputRange: [0, 1, 1, 0],
  });

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Animated.View
        style={[
          styles.thumbnail,
          {
            left: width / 2 - SIZE / 2,
            top: height / 2 - SIZE / 2,
            opacity,
            transform: [{ translateX }, { translateY }, { scale }],
          },
        ]}
      >
        <Image source={{ uri: thumbnail }} style={styles.image} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  thumbnail: {
    position: 'absolute',
    width: SIZE,
    height: SIZE,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.accent,
    backgroundColor: colors.surfaceRaised,
    overflow: 'hidden',
  },
  image: {
    flex: 1,
  },
});
