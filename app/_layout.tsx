import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { useEffect } from 'react';
import {
  SafeAreaProvider,
  initialWindowMetrics,
} from 'react-native-safe-area-context';

import { colors } from '@/theme';

export default function RootLayout() {
  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(colors.background).catch(() => {});
  }, []);

  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <StatusBar style="light" hidden />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
          animation: 'fade',
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen
          name="languages"
          options={{
            presentation: 'formSheet',
            sheetAllowedDetents: [0.6, 1],
            sheetGrabberVisible: true,
            sheetCornerRadius: 24,
            contentStyle: { backgroundColor: colors.background },
          }}
        />
        <Stack.Screen
          name="history"
          options={{
            presentation: 'formSheet',
            sheetAllowedDetents: [0.6, 1],
            sheetGrabberVisible: true,
            sheetCornerRadius: 24,
            contentStyle: { backgroundColor: colors.background },
          }}
        />
        <Stack.Screen
          name="paywall"
          options={{
            presentation: 'modal',
            animation: 'slide_from_bottom',
          }}
        />
        <Stack.Screen
          name="lookup"
          options={{
            presentation: 'formSheet',
            sheetAllowedDetents: [0.5, 1],
            sheetGrabberVisible: true,
            sheetCornerRadius: 24,
            contentStyle: { backgroundColor: colors.background },
          }}
        />
        <Stack.Screen name="preview" />
      </Stack>
    </SafeAreaProvider>
  );
}
