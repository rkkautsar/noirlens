import { useLocalSearchParams } from 'expo-router';

import { ScanResultScreen } from '@/screens/ScanResultScreen';

export default function ResultScreen() {
  const { id, capture, live } = useLocalSearchParams<{
    id?: string;
    capture?: string;
    live?: string;
  }>();

  return (
    <ScanResultScreen
      captureId={capture}
      scanId={id}
      live={live === '1'}
    />
  );
}
