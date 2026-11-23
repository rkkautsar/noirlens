import { useLocalSearchParams } from 'expo-router';

import { ScanResultScreen } from '@/screens/ScanResultScreen';

export default function ResultScreen() {
  const { id, capture, from } = useLocalSearchParams<{
    id?: string;
    capture?: string;
    from?: string;
  }>();

  return (
    <ScanResultScreen captureId={capture} scanId={id} returnTab={from} />
  );
}
