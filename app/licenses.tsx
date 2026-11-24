import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { THIRD_PARTY_NOTICES } from '@/services/notices';
import { colors, typography } from '@/theme';

export default function LicensesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.container, { paddingTop: insets.top + 12 }]}>
      <View style={styles.header}>
        <Text style={styles.title}>LICENSES</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close"
          onPress={() => router.back()}
          hitSlop={12}
        >
          <Text style={styles.close}>CLOSE</Text>
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.text}>{THIRD_PARTY_NOTICES}</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  title: { ...typography.label, color: colors.foreground },
  close: { ...typography.label, color: colors.accent },
  body: { paddingHorizontal: 20, paddingBottom: 40 },
  text: { ...typography.body, color: colors.muted, fontSize: 13, lineHeight: 20 },
});
