import { useState } from 'react';
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChipButton } from '@/components/ui';
import { showFontSize } from '@/services/showText';
import { colors } from '@/theme';

/**
 * Full-screen, high-contrast presentation of a translation. Font size adapts
 * to text length and viewport; the whole sheet can be flipped 180 degrees so
 * the phone can face the listener. Audio never starts on open.
 */
export function ShowToLocal({
  translation,
  original,
  speaking,
  onSpeak,
  onStop,
  onClose,
}: {
  translation: string;
  original?: string;
  speaking: boolean;
  onSpeak: () => void;
  onStop: () => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [flipped, setFlipped] = useState(false);
  const fontSize = showFontSize(translation.length, width - 48, height * 0.68);

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View
        style={[
          styles.root,
          {
            paddingTop: insets.top + 12,
            paddingBottom: insets.bottom + 12,
          },
        ]}
      >
        <View style={styles.inner} accessibilityViewIsModal>
          <View style={[styles.viewport, flipped && styles.flippedViewport]}>
            <ScrollView
              style={styles.scroll}
              contentContainerStyle={styles.scrollContent}
            >
              <Text
                selectable
                style={[
                  styles.translation,
                  { fontSize, lineHeight: Math.round(fontSize * 1.24) },
                ]}
              >
                {translation}
              </Text>
              {original ? (
                <Text style={styles.original} numberOfLines={4}>
                  {original}
                </Text>
              ) : null}
            </ScrollView>
          </View>

          <View style={styles.controls}>
            <ChipButton
              label="FLIP"
              icon="sync-outline"
              active={flipped}
              onPress={() => setFlipped((value) => !value)}
            />
            <ChipButton
              label={speaking ? 'STOP' : 'SPEAK'}
              icon={speaking ? 'stop' : 'volume-high-outline'}
              onPress={speaking ? onStop : onSpeak}
            />
            <ChipButton label="CLOSE" icon="close" onPress={onClose} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: 24,
  },
  inner: {
    flex: 1,
  },
  viewport: {
    flex: 1,
  },
  flippedViewport: {
    transform: [{ rotate: '180deg' }],
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingVertical: 16,
  },
  translation: {
    color: colors.foreground,
    fontWeight: '600',
    textAlign: 'center',
  },
  original: {
    color: colors.muted,
    fontSize: 17,
    lineHeight: 24,
    textAlign: 'center',
    marginTop: 28,
  },
  controls: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
    paddingTop: 12,
  },
});
