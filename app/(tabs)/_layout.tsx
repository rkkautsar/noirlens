import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router/js-tabs';

import { colors, typography } from '@/theme';

/**
 * Landing shell: Camera and Translate are the only two destinations, and the
 * tab bar exists only here. Pushed pages (result, history) cover it.
 */
export default function LandingTabs() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: colors.background },
        tabBarStyle: {
          backgroundColor: colors.background,
          borderTopColor: colors.borderSoft,
        },
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: { ...typography.micro, fontSize: 11 },
        tabBarHideOnKeyboard: true,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'CAMERA',
          tabBarIcon: ({ focused, size }) => (
            <Ionicons
              name={focused ? 'scan' : 'scan-outline'}
              size={size}
              color={focused ? colors.accent : colors.dim}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="translate"
        options={{
          title: 'TRANSLATE',
          tabBarIcon: ({ focused, size }) => (
            <Ionicons
              name={focused ? 'language' : 'language-outline'}
              size={size}
              color={focused ? colors.accent : colors.dim}
            />
          ),
        }}
      />
    </Tabs>
  );
}
