import { useEffect, useRef } from 'react';
import {
  Animated,
  Pressable,
  StyleSheet,
  View,
  type ViewStyle,
} from 'react-native';

import { colors } from '@/theme';

export function OverlaySheet({
  children,
  onClose,
  sheetStyle,
}: {
  children: React.ReactNode;
  onClose: () => void;
  sheetStyle?: ViewStyle;
}) {
  const translateY = useRef(new Animated.Value(64)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(backdropOpacity, {
        toValue: 1,
        duration: 180,
        useNativeDriver: true,
      }),
      Animated.spring(translateY, {
        toValue: 0,
        damping: 26,
        stiffness: 260,
        mass: 0.8,
        useNativeDriver: true,
      }),
    ]).start();
  }, [backdropOpacity, translateY]);

  return (
    <View style={styles.fill}>
      <Animated.View
        pointerEvents="none"
        style={[styles.backdrop, { opacity: backdropOpacity }]}
      />
      <Pressable
        accessibilityLabel="Dismiss"
        onPress={onClose}
        style={styles.backdropTouch}
      />
      <Animated.View
        style={[
          styles.sheet,
          sheetStyle,
          { transform: [{ translateY }] },
        ]}
      >
        {children}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    justifyContent: 'flex-end',
    zIndex: 50,
  },
  backdrop: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.62)',
  },
  backdropTouch: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
  },
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSoft,
    maxHeight: '85%',
    overflow: 'hidden',
  },
});
