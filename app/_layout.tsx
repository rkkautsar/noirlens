import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { useEffect } from 'react';
import {
  SafeAreaProvider,
  initialWindowMetrics,
} from 'react-native-safe-area-context';

import { captures } from '@/services/captures';
import { resumeCaptureProcessing } from '@/services/captureProcessing';
import { SheetHost } from '@/components/SheetHost';
import { colors } from '@/theme';

export default function RootLayout() {
  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(colors.background).catch(() => {});
  }, []);

  useEffect(() => {
    let active = true;
    const maybeResume = () => {
      const snapshot = captures.getSnapshot();
      if (active && snapshot.loaded && snapshot.available) {
        resumeCaptureProcessing();
      }
    };
    const unsubscribe = captures.subscribe(maybeResume);
    void captures.hydrate({ reconcile: true }).then(maybeResume).catch(() => {});
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <StatusBar style="light" hidden />
      <SheetHost>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
          animation: 'fade',
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="translate" />
        <Stack.Screen
          name="paywall"
          options={{
            presentation: 'modal',
            animation: 'slide_from_bottom',
          }}
        />
        <Stack.Screen
          name="result"
          options={{ animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="licenses"
          options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
        />
      </Stack>
      </SheetHost>
    </SafeAreaProvider>
  );
}
