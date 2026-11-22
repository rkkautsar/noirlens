import { useRef } from 'react';
import {
  Animated,
  PanResponder,
  StyleSheet,
  useWindowDimensions,
  View,
  type ViewStyle,
} from 'react-native';

import { colors } from '@/theme';

/**
 * Bottom sheet for scan results. The grabber accepts a downward drag; the
 * content below it keeps its own scrolling. Dragging the grabber down far
 * enough dismisses the sheet.
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
  const translateY = useRef(new Animated.Value(0)).current;
  const { height } = useWindowDimensions();
  const maxUp = Math.max(120, height * 0.3);

  const responder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) =>
        Math.abs(gesture.dy) > 6 &&
        Math.abs(gesture.dy) > Math.abs(gesture.dx),
      onPanResponderMove: (_, gesture) => {
        translateY.setValue(
          Math.min(0, Math.max(-maxUp, gesture.dy)),
        );
      },
      onPanResponderTerminate: () => {
        Animated.spring(translateY, {
          toValue: 0,
          useNativeDriver: false,
        }).start();
      },
      onPanResponderRelease: (_, gesture) => {
        if (gesture.dy < -maxUp * 0.35 || gesture.vy < -0.7) {
          Animated.spring(translateY, {
            toValue: -maxUp,
            useNativeDriver: false,
          }).start();
          return;
        }
        if (gesture.dy > 110 || gesture.vy > 0.8) {
          Animated.timing(translateY, {
            toValue: 900,
            duration: 180,
            useNativeDriver: false,
          }).start(({ finished }) => {
            if (finished) {
              onDismiss();
            }
          });
          return;
        }
        Animated.spring(translateY, {
          toValue: 0,
          useNativeDriver: false,
        }).start();
      },
    }),
  ).current;

  return (
    <Animated.View
      style={[styles.sheet, style, { transform: [{ translateY }] }]}
    >
      <View style={styles.handleArea} {...responder.panHandlers}>
        <View style={styles.handle} />
      </View>
      <View style={styles.content}>{children}</View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    top: '18%',
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
