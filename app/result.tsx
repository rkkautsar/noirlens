import { useLocalSearchParams } from 'expo-router';

import { ScanResultScreen } from '@/screens/ScanResultScreen';

export default function ResultScreen() {
  const { id, capture } = useLocalSearchParams<{
    id?: string;
    capture?: string;
  }>();

  return <ScanResultScreen captureId={capture} scanId={id} />;
}
