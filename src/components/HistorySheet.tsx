import Ionicons from '@expo/vector-icons/Ionicons';
import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';
import { requestCaptureHistory } from '@/services/historyIntent';
import { useEffect, useState } from 'react';
import {
  Alert,
  Image,
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
import { captures, useCaptures } from '@/services/captures';
import type { CaptureRecord, CaptureStatus } from '@/services/captureModel';
import { DEMO_HISTORY } from '@/services/demoHistory';
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
    <View style={styles.captureRow}>
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

export function HistorySheet({
  demo = false,
  initialTab = 'translations',
  onClose,
  reopenOnReturn = false,
}: {
  demo?: boolean;
  initialTab?: HistoryTab;
  onClose: () => void;
  /** The camera sheet asks the camera to reopen this same tab on return. */
  reopenOnReturn?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [entries, setEntries] = useState<ScanHistoryEntry[]>([]);
  const [copied, setCopied] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<HistoryTab>(initialTab);
  const captureState = useCaptures();

  useEffect(() => {
    void captures.hydrate();
  }, []);

  useEffect(() => {
    let active = true;
    void readScanHistory()
      .then((rows) => {
        if (active) {
          setEntries(rows.length === 0 && demo ? DEMO_HISTORY : rows);
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

  const openCapture = (record: CaptureRecord) => {
    // Dismiss the native sheet before navigating, and ask the camera to
    // reopen History when this result closes.
    onClose();
    if (reopenOnReturn) {
      requestCaptureHistory(tab);
    }
    router.push({
      pathname: '/result',
      params: { capture: record.id },
    });
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

  return (
    <View style={styles.sheetBody}>
      <SheetHeader
        title="HISTORY"
        subtitle={
          tab === 'captures'
            ? `${captureState.records.length} CAPTURE${
                captureState.records.length === 1 ? '' : 'S'
              } · ON-DEVICE`
            : 'LAST 50 · ON-DEVICE'
        }
      />

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
                  <View key={entry.id} style={styles.entryWrap}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Open scan: ${
                        entry.translatedText || entry.sourceText
                      }`}
                      accessibilityHint="Opens the result to look up again"
                      onPress={() => {
                        onClose();
                        if (reopenOnReturn) {
                          requestCaptureHistory(tab);
                        }
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
                    </Pressable>
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
                  </View>
                );
              })}
            </>
          )}
        </ScrollView>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.content,
            { paddingBottom: insets.bottom + 28 },
          ]}
        >
          {!captureState.loaded ? (
            <MicroLabel tone="dim">LOADING…</MicroLabel>
          ) : !captureState.available ? (
            <View style={styles.empty}>
              <MicroLabel tone="warning">STORAGE UNAVAILABLE</MicroLabel>
              <Text style={styles.emptyText}>
                Saved captures could not be read. Nothing has been deleted;
                reopen History to retry.
              </Text>
            </View>
          ) : captureState.records.length === 0 ? (
            <View style={styles.empty}>
              <MicroLabel tone="dim">NO CAPTURES YET</MicroLabel>
              <Text style={styles.emptyText}>
                Turn on Collect mode and hold to save signs for later.
              </Text>
            </View>
          ) : (
            <>
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
              {captureState.records.map((record) => (
                <CaptureRow
                  key={record.id}
                  record={record}
                  uri={captures.uriFor(record.thumb)}
                  onOpen={() => openCapture(record)}
                  onDelete={() => deleteCapture(record)}
                />
              ))}
            </>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  sheetBody: {
    flex: 1,
  },
  tabs: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 20,
    paddingTop: 14,
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
