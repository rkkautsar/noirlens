import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { useMemo, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  PanResponder,
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, typography } from '@/theme';

type Zone = 'cancel' | 'languages';

const ZONE = 64;
const HOLD_MS = 2000;

function impact() {
  if (Platform.OS !== 'web') {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  }
}

function success() {
  if (Platform.OS !== 'web') {
    void Haptics.notificationAsync(
      Haptics.NotificationFeedbackType.Success,
    ).catch(() => {});
  }
}

/**
 * Always-mounted hold shutter. Press to start, aim while holding, release to
 * capture. Swiping left or right past the zone reveals a cancel / languages
 * target; holding on it fills for two seconds and fires without a release.
 */
export function ScanShutter({
  active,
  scanning,
  next = false,
  onStart,
  onCapture,
  onCancel,
  onLanguages,
  collect = false,
}: {
  active: boolean;
  scanning: boolean;
  next?: boolean;
  onStart: () => void;
  onCapture: () => void;
  onCancel: () => void;
  onLanguages: () => void;
  collect?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const [zone, setZone] = useState<Zone | null>(null);
  const drag = useRef(new Animated.Value(0)).current;
  const progress = useRef(new Animated.Value(0)).current;
  const hold = useRef<Animated.CompositeAnimation | null>(null);
  const zoneRef = useRef<Zone | null>(null);
  const directZone = useRef<Zone | null>(null);
  const fired = useRef(false);
  const latest = useRef({ onStart, onCapture, onCancel, onLanguages, scanning });
  latest.current = { onStart, onCapture, onCancel, onLanguages, scanning };

  const responder = useMemo(() => {
    const clear = () => {
      hold.current?.stop();
      hold.current = null;
      zoneRef.current = null;
      progress.setValue(0);
      setZone(null);
    };

    const fire = (target: Zone) => {
      if (fired.current) {
        return;
      }
      fired.current = true;
      success();
      if (target === 'cancel') {
        latest.current.onCancel();
      } else {
        latest.current.onLanguages();
      }
    };

    const start = (target: Zone) => {
      hold.current?.stop();
      progress.setValue(0);
      zoneRef.current = target;
      setZone(target);
      impact();
      hold.current = Animated.timing(progress, {
        toValue: 1,
        duration: HOLD_MS,
        useNativeDriver: false,
      });
      hold.current.start(({ finished }) => {
        if (finished && !fired.current) {
          fire(target);
        }
      });
    };

    return PanResponder.create({
      onStartShouldSetPanResponder: () => !latest.current.scanning,
      onMoveShouldSetPanResponder: () => !latest.current.scanning,
      onPanResponderGrant: (event) => {
        fired.current = false;
        clear();
        drag.setValue(0);
        // A direct tap on the visible cancel / languages targets is an action,
        // not a capture: never arm the camera for it.
        const x0 = event.nativeEvent.pageX;
        const screenWidth = Dimensions.get('window').width;
        if (x0 <= 96) {
          directZone.current = 'cancel';
          return;
        }
        if (x0 >= screenWidth - 96) {
          directZone.current = 'languages';
          return;
        }
        directZone.current = null;
        impact();
        latest.current.onStart();
      },
      onPanResponderMove: (_, gesture) => {
        if (directZone.current !== null || fired.current) {
          return;
        }
        drag.setValue(gesture.dx);
        const next: Zone | null =
          gesture.dx <= -ZONE
            ? 'cancel'
            : gesture.dx >= ZONE
              ? 'languages'
              : null;
        if (next === null) {
          if (zoneRef.current !== null) {
            clear();
          }
          return;
        }
        if (zoneRef.current !== next) {
          start(next);
        }
      },
      onPanResponderRelease: (_, gesture) => {
        if (directZone.current !== null) {
          const target = directZone.current;
          directZone.current = null;
          fired.current = false;
          fire(target);
          return;
        }
        if (fired.current) {
          return;
        }
        const target = zoneRef.current;
        clear();
        if (target !== null) {
          fire(target);
          return;
        }
        if (gesture.dx <= -ZONE) {
          fire('cancel');
          return;
        }
        if (gesture.dx >= ZONE) {
          fire('languages');
          return;
        }
        latest.current.onCapture();
      },
      onPanResponderTerminate: () => {
        const wasFired = fired.current;
        directZone.current = null;
        clear();
        if (!wasFired) {
          latest.current.onCapture();
        }
      },
      onPanResponderTerminationRequest: () => false,
    });
  }, [drag, progress]);

  const leftOpacity = drag.interpolate({
    inputRange: [-96, -24, 0],
    outputRange: [1, 0.36, 0.36],
    extrapolate: 'clamp',
  });
  const rightOpacity = drag.interpolate({
    inputRange: [0, 24, 96],
    outputRange: [0.36, 0.36, 1],
    extrapolate: 'clamp',
  });
  const leftScale = drag.interpolate({
    inputRange: [-96, 0],
    outputRange: [1, 0.7],
    extrapolate: 'clamp',
  });
  const rightScale = drag.interpolate({
    inputRange: [0, 96],
    outputRange: [0.7, 1],
    extrapolate: 'clamp',
  });
  const fillScale = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0.4, 1],
  });

  const label = scanning
    ? 'READING ON-DEVICE'
    : active
      ? collect
        ? 'RELEASE TO COLLECT'
        : 'RELEASE TO CAPTURE'
      : next
        ? 'NEXT SCAN'
        : collect
          ? 'HOLD TO COLLECT'
          : 'HOLD TO SCAN';
  const icon: React.ComponentProps<typeof Ionicons>['name'] = scanning
    ? 'hourglass-outline'
    : active
      ? 'radio-button-on'
      : next
        ? 'refresh'
        : 'hand-left-outline';

  return (
    <View
      {...responder.panHandlers}
      style={[
        styles.wrap,
        { paddingBottom: insets.bottom + 12 },
      ]}
    >
      <View
        accessibilityRole="button"
        accessibilityLabel={
          scanning
            ? 'Reading the sign'
            : active
              ? 'Release to capture'
              : next
                ? 'Hold for the next scan. Swipe left to cancel, right for languages.'
                : collect
                  ? 'Hold to save a capture. Swipe left to cancel, right for languages.'
                  : 'Hold to scan. Swipe left to cancel, right for languages.'
        }
        style={[
          styles.bar,
          active && styles.barActive,
          scanning && styles.barBusy,
        ]}
      >
        <Animated.View
          pointerEvents="none"
          style={[
            styles.target,
            styles.targetLeft,
            { opacity: leftOpacity, transform: [{ scale: leftScale }] },
          ]}
        >
          <Animated.View
            style={[
              styles.fill,
              { opacity: zone === 'cancel' ? progress : 0, transform: [{ scale: fillScale }] },
            ]}
          />
          <Ionicons name="close" size={20} color={colors.foreground} />
        </Animated.View>

        <Animated.View
          pointerEvents="none"
          style={[
            styles.target,
            styles.targetRight,
            { opacity: rightOpacity, transform: [{ scale: rightScale }] },
          ]}
        >
          <Animated.View
            style={[
              styles.fill,
              { opacity: zone === 'languages' ? progress : 0, transform: [{ scale: fillScale }] },
            ]}
          />
          <Ionicons
            name="language-outline"
            size={20}
            color={colors.foreground}
          />
        </Animated.View>

        <Ionicons
          name={icon}
          size={18}
          color={active ? colors.accent : colors.muted}
        />
        <Text
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.8}
          style={[styles.label, active && styles.labelActive]}
        >
          {label}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 16,
    paddingTop: 28,
  },
  bar: {
    minHeight: 64,
    borderRadius: 22,
    backgroundColor: 'rgba(9,9,10,0.92)',
    paddingHorizontal: 18,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    overflow: 'hidden',
  },
  barActive: {
    backgroundColor: colors.accentSoft,
  },
  barBusy: {
    opacity: 0.8,
  },
  label: {
    ...typography.label,
    color: colors.foreground,
    letterSpacing: 1.1,
    fontSize: 15,
    flexShrink: 1,
  },
  labelActive: {
    color: colors.accent,
  },
  target: {
    position: 'absolute',
    top: 8,
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  targetLeft: {
    left: 8,
  },
  targetRight: {
    right: 8,
  },
  fill: {
    position: 'absolute',
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.accent,
  },
});
