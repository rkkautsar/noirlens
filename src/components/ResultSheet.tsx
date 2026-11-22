import { useEffect, useRef } from 'react';
import {
  Animated,
  PanResponder,
  StyleSheet,
  useWindowDimensions,
  View,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors } from '@/theme';

/**
 * Bottom sheet for scan results. Anchored to the bottom edge, it grows in
 * height: dragging the handle up expands it to full height instead of
 * translating the whole panel and leaving a gap underneath, and dragging it
 * down below the resting height dismisses it.
 */
export function ResultSheet({
  children,
  onDismiss,
  style,
}: {
  children: React.ReactNode;
  onDismiss: () => void;
  style?: ViewStyle;
}) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const collapsed = Math.round(height * 0.82);
  const expanded = Math.max(collapsed, height - Math.max(insets.top, 20) - 8);

  const sheetHeight = useRef(new Animated.Value(0)).current;
  const currentHeight = useRef(0);
  const gestureStart = useRef(collapsed);

  useEffect(() => {
    const listener = sheetHeight.addListener(({ value }) => {
      currentHeight.current = value;
    });
    Animated.spring(sheetHeight, {
      toValue: collapsed,
      useNativeDriver: false,
      damping: 24,
      stiffness: 220,
      mass: 0.8,
    }).start();
    return () => {
      sheetHeight.removeListener(listener);
    };
  }, [collapsed, sheetHeight]);

  const close = () => {
    Animated.timing(sheetHeight, {
      toValue: 0,
      duration: 200,
      useNativeDriver: false,
    }).start(({ finished }) => {
      if (finished) {
        onDismiss();
      }
    });
  };

  const snap = (toValue: number) => {
    Animated.spring(sheetHeight, {
      toValue,
      useNativeDriver: false,
      damping: 24,
      stiffness: 220,
      mass: 0.8,
    }).start();
  };

  const responder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) =>
        Math.abs(gesture.dy) > 4 &&
        Math.abs(gesture.dy) > Math.abs(gesture.dx),
      onPanResponderGrant: () => {
        gestureStart.current = currentHeight.current;
      },
      onPanResponderMove: (_, gesture) => {
        const next = Math.min(expanded, Math.max(0, gestureStart.current - gesture.dy));
        sheetHeight.setValue(next);
        currentHeight.current = next;
      },
      onPanResponderRelease: (_, gesture) => {
        if (gesture.dy > 120 || gesture.vy > 0.9) {
          close();
          return;
        }
        if (gesture.dy < -40 || currentHeight.current > (collapsed + expanded) / 2) {
          snap(expanded);
          return;
        }
        snap(collapsed);
      },
      onPanResponderTerminate: () => {
        snap(currentHeight.current > (collapsed + expanded) / 2 ? expanded : collapsed);
      },
    }),
  ).current;

  return (
    <Animated.View
      style={[styles.sheet, style, { height: sheetHeight }]}
      pointerEvents="box-none"
    >
      <View style={styles.handleArea} {...responder.panHandlers}>
        <View style={styles.handle} />
      </View>
      <View style={[styles.content, { paddingBottom: insets.bottom }]}>
        {children}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    left: 0,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
    backgroundColor: colors.background,
  },
  handleArea: {
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
  },
  content: {
    flex: 1,
  },
});
