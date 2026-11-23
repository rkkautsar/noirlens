import { BottomSheet } from '@expo/ui';
import { StyleSheet, View } from 'react-native';

import { colors } from '@/theme';

/**
 * Native bottom sheet (SwiftUI sheet on iOS, ModalBottomSheet on Android,
 * dialog on web). Content is plain RN and fills the presented sheet; the
 * sheet's own chrome uses the app background so the home-indicator inset
 * matches Noir.
 */
export function AppSheet({
  visible,
  onClose,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  children?: React.ReactNode;
}) {
  return (
    <BottomSheet
      isPresented={visible}
      onDismiss={onClose}
      snapPoints={['half', 'full']}
      showDragIndicator
      contentPadding={0}
      containerColor={colors.background}
    >
      <View style={styles.fill}>{children}</View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
});
