import Ionicons from '@expo/vector-icons/Ionicons';
import * as Clipboard from 'expo-clipboard';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ScreenShell } from '@/components/ScreenShell';
import { ChipButton, MicroLabel } from '@/components/ui';
import { languageLabel } from '@/constants/languages';
import { useScanAllowance } from '@/services/allowance';
import { captures, useCaptures } from '@/services/captures';
import type { CaptureRecord } from '@/services/captureModel';
import {
  clearScanHistory,
  readScanHistory,
  type ScanHistoryEntry,
} from '@/services/scanHistory';
import { colors, typography } from '@/theme';

export type HistoryTab = 'translations' | 'captures';

function formatTime(at: number): string {
  return new Date(at).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function statusLabel(record: CaptureRecord): {
  label: string;
  tone: 'accent' | 'dim' | 'danger' | 'muted';
} {
  switch (record.status) {
    case 'pending':
      return { label: 'QUEUED', tone: 'dim' };
    case 'processing':
      return { label: 'READING…', tone: 'accent' };
    case 'failed':
      return { label: 'FAILED', tone: 'danger' };
    default:
      return {
        label:
          record.language && record.language !== 'und'
            ? languageLabel(record.language)
            : 'READY',
        tone: 'accent',
      };
  }
}

function CaptureRow({
  record,
  uri,
  onOpen,
  onDelete,
}: {
  record: CaptureRecord;
  uri: string;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const status = statusLabel(record);
  const [imageFailed, setImageFailed] = useState(false);
  return (
    <View
      style={[
        styles.captureRow,
        record.reviewedAt === null && styles.captureRowUnseen,
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Open capture from ${formatTime(record.at)}`}
        onPress={onOpen}
        style={({ pressed }) => [styles.captureMain, pressed && styles.pressed]}
      >
        <View style={styles.thumbWrap}>
          {uri && !imageFailed ? (
            <Image
              source={{ uri }}
              style={styles.thumb}
              onError={() => setImageFailed(true)}
            />
          ) : (
            <View style={[styles.thumb, styles.thumbEmpty]}>
              <Ionicons name="image-outline" size={18} color={colors.dim} />
            </View>
          )}
        </View>
        <View style={styles.captureBody}>
          <View style={styles.captureTop}>
            <MicroLabel tone={status.tone}>{status.label}</MicroLabel>
            <MicroLabel tone="dim">{formatTime(record.at)}</MicroLabel>
          </View>
          <Text style={styles.captureText} numberOfLines={2}>
            {record.text ||
              (record.status === 'failed'
                ? 'Text recognition failed.'
                : record.status === 'done'
                  ? 'No text recognized.'
                  : 'Reading text on-device…')}
          </Text>
        </View>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Delete capture"
        hitSlop={10}
        onPress={onDelete}
        style={styles.deleteIcon}
      >
        <Ionicons name="trash-outline" size={15} color={colors.muted} />
      </Pressable>
    </View>
  );
}

/** Full-page history: pushed from the camera, stays mounted under a result. */
/** Bounded to the visible prefix so long scans don't allocate per row. */
function excerptFor(text: string): string {
  const characters: string[] = [];
  for (const character of text) {
    if (characters.length === 61) {
      break;
    }
    characters.push(character);
  }
  if (characters.length <= 60) {
    return text;
  }
  return `${characters.slice(0, 57).join('')}…`;
}

export function HistoryScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ tab?: string }>();
  const allowance = useScanAllowance();
  const initialTab: HistoryTab =
    params.tab === 'captures' ? 'captures' : 'translations';
  const [entries, setEntries] = useState<ScanHistoryEntry[]>([]);
  const [copied, setCopied] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<HistoryTab>(initialTab);
  const captureState = useCaptures();
  const navigating = useRef(false);

  useFocusEffect(
    useCallback(() => {
      navigating.current = false;
    }, []),
  );

  const openResult = (params: { id?: string; capture?: string }) => {
    if (navigating.current) {
      return;
    }
    navigating.current = true;
    router.push({ pathname: '/result', params });
  };

  const back = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/');
    }
  };

  useEffect(() => {
    void captures.hydrate();
  }, []);

  useEffect(() => {
    let active = true;
    void readScanHistory()
      .then((rows) => {
        if (active) {
          setEntries(rows);
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
  }, []);

  const copy = async (entry: ScanHistoryEntry) => {
    await Clipboard.setStringAsync(entry.translatedText || entry.sourceText);
    setCopied(entry.id);
    setTimeout(() => {
      setCopied((current) => (current === entry.id ? null : current));
    }, 1200);
  };

  const clearScans = () => {
    Alert.alert(
      'Clear scan history?',
      'Every saved scan on this device is removed. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear Scans',
          style: 'destructive',
          onPress: () => {
            void clearScanHistory()
              .then(() => setEntries([]))
              .catch(() => {
                Alert.alert(
                  'Could not clear scans',
                  'Nothing was removed. Try again.',
                );
              });
          },
        },
      ],
    );
  };

  const deleteCapture = (record: CaptureRecord) => {
    Alert.alert(
      'Delete capture?',
      'The image and its recognized text are removed from this device.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            void captures.remove(record.id);
          },
        },
      ],
    );
  };

  const clearCaptures = () => {
    Alert.alert(
      'Clear all captures?',
      'Every saved image and its text are removed from this device.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: () => {
            void captures.clear();
          },
        },
      ],
    );
  };

  const subtitle =
    tab === 'captures'
      ? `${captureState.records.length} CAPTURE${
          captureState.records.length === 1 ? '' : 'S'
        } · ON-DEVICE`
      : 'LAST 50 · ON-DEVICE';

  return (
    <ScreenShell
      remaining={allowance.remaining}
      unlimited={allowance.unlimited}
      onPaywall={() => router.push('/paywall')}
      onBack={back}
    >
      <View style={styles.page}>
        <View style={styles.titleBlock}>
          <Text style={styles.title}>HISTORY</Text>
          <MicroLabel tone="dim">{subtitle}</MicroLabel>
        </View>

        <View style={styles.tabs}>
          <ChipButton
            label="SCANS"
            icon="document-text-outline"
            active={tab === 'translations'}
            onPress={() => setTab('translations')}
          />
          <ChipButton
            label={`CAPTURES${
              captureState.records.length > 0
                ? ` ${captureState.records.length}`
                : ''
            }`}
            icon="images-outline"
            active={tab === 'captures'}
            onPress={() => setTab('captures')}
          />
        </View>

        {tab === 'translations' ? (
          <FlatList
            style={styles.scroll}
            contentContainerStyle={[
              styles.content,
              { paddingBottom: insets.bottom + 32 },
            ]}
            data={loading ? [] : entries}
            keyExtractor={(entry) => entry.id}
            initialNumToRender={10}
            windowSize={7}
            ListHeaderComponent={
              !loading && entries.length > 0 ? (
                <View style={styles.listHeader}>
                  <MicroLabel tone="dim">
                    {entries.length} SCAN{entries.length === 1 ? '' : 'S'}
                  </MicroLabel>
                  <ChipButton
                    label="CLEAR"
                    icon="trash-outline"
                    onPress={clearScans}
                  />
                </View>
              ) : undefined
            }
            ListEmptyComponent={
              loading ? (
                <MicroLabel tone="dim">LOADING…</MicroLabel>
              ) : (
                <View style={styles.empty}>
                  <MicroLabel tone="dim">NO RECENT SCANS</MicroLabel>
                  <Text style={styles.emptyText}>
                    Hold to scan a sign. Finished scans appear here.
                  </Text>
                </View>
              )
            }
            renderItem={({ item: entry }) => {
              const isCopied = copied === entry.id;
              const text = entry.translatedText || entry.sourceText;
              const excerpt = excerptFor(text);
              return (
                <View style={styles.entryWrap}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Open scan: ${
                      entry.translatedText || entry.sourceText
                    }`}
                    accessibilityHint="Opens the result to look up again"
                    onPress={() => openResult({ id: entry.id })}
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
                      <MicroLabel tone="dim">
                        {formatTime(entry.at)}
                      </MicroLabel>
                    </View>
                    <Text
                      style={styles.entryText}
                      numberOfLines={3}
                      selectable
                    >
                      {entry.translatedText || entry.sourceText}
                    </Text>
                    {entry.translatedText ? (
                      <Text style={styles.entrySource} numberOfLines={1}>
                        {entry.sourceText}
                      </Text>
                    ) : null}
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={
                      isCopied ? 'Copied' : `Copy scan: ${excerpt}`
                    }
                    accessibilityHint={
                      isCopied
                        ? undefined
                        : 'Copies the scan text to the clipboard'
                    }
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
                </View>
              );
            }}
          />
        ) : (
          <FlatList
            style={styles.scroll}
            contentContainerStyle={[
              styles.content,
              { paddingBottom: insets.bottom + 32 },
            ]}
            data={
              captureState.loaded && captureState.available
                ? captureState.records
                : []
            }
            keyExtractor={(record) => record.id}
            initialNumToRender={6}
            windowSize={5}
            ListHeaderComponent={
              captureState.loaded &&
              captureState.available &&
              captureState.records.length > 0 ? (
                <View style={styles.listHeader}>
                  <MicroLabel tone="dim">
                    {captureState.records.length} CAPTURE
                    {captureState.records.length === 1 ? '' : 'S'}
                  </MicroLabel>
                  <ChipButton
                    label="CLEAR"
                    icon="trash-outline"
                    onPress={clearCaptures}
                  />
                </View>
              ) : undefined
            }
            ListEmptyComponent={
              !captureState.loaded ? (
                <MicroLabel tone="dim">LOADING…</MicroLabel>
              ) : !captureState.available ? (
                <View style={styles.empty}>
                  <MicroLabel tone="warning">STORAGE UNAVAILABLE</MicroLabel>
                  <Text style={styles.emptyText}>
                    Saved captures could not be read. Nothing has been deleted;
                    reopen History to retry.
                  </Text>
                </View>
              ) : (
                <View style={styles.empty}>
                  <MicroLabel tone="dim">NO CAPTURES YET</MicroLabel>
                  <Text style={styles.emptyText}>
                    Turn on Collect mode and hold to save signs for later.
                  </Text>
                </View>
              )
            }
            renderItem={({ item: record }) => (
              <CaptureRow
                record={record}
                uri={captures.uriFor(record.thumb)}
                onOpen={() => openResult({ capture: record.id })}
                onDelete={() => deleteCapture(record)}
              />
            )}
          />
        )}
      </View>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
  },
  titleBlock: {
    paddingHorizontal: 20,
    paddingTop: 8,
    gap: 6,
  },
  title: {
    ...typography.title,
    color: colors.foreground,
    letterSpacing: 1,
  },
  tabs: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 2,
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 16,
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
  entryWrap: {
    position: 'relative',
  },
  copyIcon: {
    position: 'absolute',
    right: 14,
    bottom: 14,
  },
  captureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    backgroundColor: colors.surface,
  },
  captureRowUnseen: {
    borderColor: colors.accent,
  },
  captureMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 10,
  },
  thumbWrap: {
    width: 54,
    height: 54,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: colors.surfaceRaised,
  },
  thumb: {
    width: 54,
    height: 54,
  },
  thumbEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  captureBody: {
    flex: 1,
    gap: 5,
  },
  captureTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  captureText: {
    ...typography.body,
    fontSize: 13,
    lineHeight: 18,
    color: colors.foreground,
  },
  deleteIcon: {
    paddingHorizontal: 12,
    paddingVertical: 16,
  },
});
