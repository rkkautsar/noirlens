import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { useEffect, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SheetHeader } from '@/components/SheetHeader';
import { ChipButton, MicroLabel } from '@/components/ui';
import { languageLabel } from '@/constants/languages';
import {
  clearScanHistory,
  readScanHistory,
  type ScanHistoryEntry,
} from '@/services/scanHistory';
import { colors, typography } from '@/theme';

const MOCK_HISTORY: ScanHistoryEntry[] = [
  {
    id: 'mock-1',
    at: Date.now() - 1000 * 60 * 8,
    sourceLanguage: 'ko',
    sourceText: '금연 · 담배는 건강에 해롭습니다',
    translatedText:
      'No smoking. Cigarettes are harmful to your health and the people around you.',
    kind: 'translated',
  },
  {
    id: 'mock-2',
    at: Date.now() - 1000 * 60 * 46,
    sourceLanguage: 'ja',
    sourceText: '営業時間 10:00 - 20:00',
    translatedText: 'Business hours 10:00 - 20:00',
    kind: 'translated',
  },
  {
    id: 'mock-3',
    at: Date.now() - 1000 * 60 * 60 * 3,
    sourceLanguage: 'th',
    sourceText: 'ราคา 120 บาท',
    translatedText: 'Price 120 baht',
    kind: 'translated',
  },
];

function formatTime(at: number): string {
  return new Date(at).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function HistorySheet({
  demo = false,
  onClose,
}: {
  demo?: boolean;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [entries, setEntries] = useState<ScanHistoryEntry[]>([]);
  const [copied, setCopied] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    void readScanHistory()
      .then((rows) => {
        if (active) {
          setEntries(rows.length === 0 && demo ? MOCK_HISTORY : rows);
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [demo]);

  const copy = async (entry: ScanHistoryEntry) => {
    await Clipboard.setStringAsync(entry.translatedText || entry.sourceText);
    setCopied(entry.id);
    setTimeout(() => {
      setCopied((current) => (current === entry.id ? null : current));
    }, 1200);
  };

  const clear = async () => {
    await clearScanHistory();
    setEntries([]);
  };

  return (
    <View style={styles.sheetBody}>
      <SheetHeader
        title="RECENT SCANS"
        subtitle="LAST 50 · ON-DEVICE"
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + 28 },
        ]}
      >
        {loading ? (
          <MicroLabel tone="dim">LOADING…</MicroLabel>
        ) : entries.length === 0 ? (
          <View style={styles.empty}>
            <MicroLabel tone="dim">NO RECENT SCANS</MicroLabel>
            <Text style={styles.emptyText}>
              Hold to scan a sign. Finished scans appear here.
            </Text>
          </View>
        ) : (
          <>
            <View style={styles.listHeader}>
              <MicroLabel tone="dim">
                {entries.length} SCAN{entries.length === 1 ? '' : 'S'}
              </MicroLabel>
              <ChipButton
                label="CLEAR"
                icon="trash-outline"
                onPress={() => {
                  void clear();
                }}
              />
            </View>

            {entries.map((entry) => {
              const isCopied = copied === entry.id;
              return (
                <Pressable
                  key={entry.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Open scan: ${
                    entry.translatedText || entry.sourceText
                  }`}
                  accessibilityHint="Opens the result to look up again"
                  onPress={() => {
                    onClose();
                    router.push({
                      pathname: '/result',
                      params: { id: entry.id },
                    });
                  }}
                  style={({ pressed }) => [
                    styles.entry,
                    pressed && styles.pressed,
                  ]}
                >
                  <View style={styles.entryTop}>
                    <MicroLabel
                      tone={entry.kind === 'translated' ? 'accent' : 'dim'}
                    >
                      {entry.kind === 'translated'
                        ? `${languageLabel(entry.sourceLanguage)} → ENGLISH`
                        : entry.sourceLanguage === 'und'
                          ? 'NO LANGUAGE DETECTED'
                          : 'ENGLISH'}
                    </MicroLabel>
                    <MicroLabel tone="dim">{formatTime(entry.at)}</MicroLabel>
                  </View>
                  <Text style={styles.entryText} numberOfLines={3} selectable>
                    {entry.translatedText || entry.sourceText}
                  </Text>
                  {entry.translatedText ? (
                    <Text style={styles.entrySource} numberOfLines={1}>
                      {entry.sourceText}
                    </Text>
                  ) : null}
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={isCopied ? 'Copied' : 'Copy scan'}
                    hitSlop={10}
                    onPress={() => {
                      void copy(entry);
                    }}
                    style={styles.copyIcon}
                  >
                    <Ionicons
                      name={isCopied ? 'checkmark' : 'copy-outline'}
                      size={15}
                      color={isCopied ? colors.success : colors.muted}
                    />
                  </Pressable>
                </Pressable>
              );
            })}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  sheetBody: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  sheet: {
    top: '38%',
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 20,
    gap: 12,
  },
  empty: {
    marginTop: 40,
    gap: 8,
  },
  emptyText: {
    ...typography.body,
    color: colors.muted,
  },
  listHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  entry: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    backgroundColor: colors.surface,
    padding: 14,
    gap: 8,
  },
  pressed: {
    opacity: 0.7,
  },
  entryTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingRight: 20,
  },
  entryText: {
    ...typography.body,
    color: colors.foreground,
    paddingRight: 24,
  },
  entrySource: {
    ...typography.body,
    fontSize: 13,
    color: colors.muted,
    paddingRight: 24,
  },
  copyIcon: {
    position: 'absolute',
    right: 14,
    bottom: 14,
  },
});
