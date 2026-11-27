import { Tabs } from 'expo-router/js-tabs';

import { colors } from '@/theme';

/**
 * Landing shell: Camera and Translate are the only two destinations. The
 * switcher lives in the header; the navigator reserves no bottom bar.
 */
export default function LandingTabs() {
  return (
    <Tabs
      tabBar={() => null}
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: colors.background },
      }}
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen name="translate" />
    </Tabs>
  );
}
