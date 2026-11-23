import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  PanResponder,
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
  const [expanded, setExpanded] = useState(false);

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

  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) =>
        Math.abs(gesture.dy) > 6,
      onPanResponderRelease: (_, gesture) => {
        if (gesture.dy > 60) {
          onClose();
          return;
        }
        if (gesture.dy < -30) {
          setExpanded(true);
        }
      },
    }),
  ).current;

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
          expanded ? styles.sheetExpanded : styles.sheetCompact,
          sheetStyle,
          { transform: [{ translateY }] },
        ]}
      >
        <View {...pan.panHandlers} style={styles.grabberWrap}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={expanded ? 'Collapse sheet' : 'Expand sheet'}
            onPress={() => setExpanded((value) => !value)}
            style={styles.grabberPress}
          >
            <View style={styles.grabber} />
          </Pressable>
        </View>
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
    overflow: 'hidden',
  },
  sheetCompact: {
    height: '72%',
  },
  sheetExpanded: {
    height: '94%',
  },
  grabberWrap: {
    paddingTop: 10,
    paddingBottom: 6,
    alignItems: 'center',
  },
  grabberPress: {
    paddingHorizontal: 24,
    paddingVertical: 4,
  },
  grabber: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
  },
});
