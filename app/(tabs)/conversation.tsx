import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState, type ComponentRef } from 'react';
import {
  AppState,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ScreenShell } from '@/components/ScreenShell';
import { languageLabel } from '@/constants/languages';
import {
  conversationSourceLanguage,
  conversationTargetLanguage,
  preferredLocalLanguage,
  type ConversationSide,
} from '@/services/conversationTurn';
import { useScanAllowance } from '@/services/allowance';
import { sourceLanguage, useSourceLanguage } from '@/services/sourceLanguage';
import { installPack, translateText } from '@/services/translationTask';
import { useSheet } from '@/components/SheetHost';
import { colors, layout, radius, typography } from '@/theme';
import vision, {
  type SpeechPermissionPayload,
} from '../../modules/native-vision-translator';

type Side = ConversationSide;
type Phase = 'idle' | 'preparing' | 'listening' | 'translating';

interface Message {
  id: number;
  side: Side;
  text: string;
}

interface PendingRetry {
  source: string;
  target: string;
  transcript: string;
  recipient: Side;
}

function tap() {
  if (Platform.OS !== 'web') {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  }
}

function errorCode(error: unknown): string | null {
  return typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code?: unknown }).code ?? '')
    : null;
}

function speechErrorMessage(error: unknown): string {
  switch (errorCode(error)) {
    case 'ERR_SPEECH_PERMISSION':
      return 'Speech access is off. Enable it in Settings.';
    case 'ERR_SPEECH_ON_DEVICE_UNAVAILABLE':
      return 'On-device speech recognition is unavailable for this language.';
    case 'ERR_SPEECH_TIMEOUT':
      return 'The transcript took too long. Hold and try again.';
    case 'ERR_SPEECH_EMPTY':
      return 'No speech detected. Hold and try again.';
    case 'ERR_SPEECH_BUSY':
      return 'Finish the other side first.';
    default:
      return 'Speech input failed. Hold and try again.';
  }
}

function ConversationPane({
  flipped = false,
  language,
  messages,
  phase,
  active,
  ready,
  requesting,
  retrying,
  permission,
  header,
  onEnable,
  onStart,
  onRelease,
  onTerminate,
}: {
  flipped?: boolean;
  language: string;
  messages: Message[];
  phase: Phase;
  active: boolean;
  ready: boolean;
  requesting: boolean;
  retrying: boolean;
  permission: SpeechPermissionPayload | null;
  header?: React.ReactNode;
  onEnable: () => void;
  onStart: () => void;
  onRelease: () => void;
  onTerminate: () => void;
}) {
  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null);
  const [pressed, setPressed] = useState(false);

  const newestId = messages[messages.length - 1]?.id ?? 0;

  useEffect(() => {
    if (newestId === 0) {
      return;
    }
    const timer = setTimeout(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    }, 30);
    return () => clearTimeout(timer);
  }, [newestId]);

  const label = languageLabel(language);
  const preparing = active && phase === 'preparing';
  const listening = active && phase === 'listening';
  const busy = phase !== 'idle' || retrying;
  const enabled = ready && !busy;
  const accessMissing =
    Platform.OS !== 'web' &&
    permission !== null &&
    (permission.speech !== 'authorized' || permission.microphone !== 'granted');
  const undetermined =
    permission?.speech === 'undetermined' ||
    permission?.microphone === 'undetermined';

  return (
    <View style={[styles.pane, flipped && styles.flipped]}>
      {header}
      <ScrollView
        ref={scrollRef}
        style={styles.logScroll}
        contentContainerStyle={[
          styles.log,
          messages.length > 0 ? styles.logFilled : styles.logEmpty,
        ]}
        showsVerticalScrollIndicator={false}
      >
        {messages.length === 0 ? (
          <Text style={styles.hint}>
            {flipped
              ? `Translations from English appear here in ${label}.`
              : 'Translations from the other side appear here.'}
          </Text>
        ) : (
          messages.map((message) => (
            <View key={message.id} style={styles.message}>
              <Text style={styles.messageText}>{message.text}</Text>
            </View>
          ))
        )}
      </ScrollView>

      {accessMissing && !ready ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            undetermined ? 'Enable speech input' : 'Open settings for speech'
          }
          disabled={requesting}
          onPress={undetermined ? onEnable : () => void Linking.openSettings()}
          style={({ pressed: activePress }) => [
            styles.control,
            styles.controlDisabled,
            activePress && styles.controlPressed,
          ]}
        >
          <Ionicons
            name={undetermined ? 'mic-outline' : 'settings-outline'}
            size={18}
            color={colors.muted}
          />
          <Text style={styles.controlLabel}>
            {requesting
              ? 'ENABLING…'
              : undetermined
                ? 'ENABLE SPEECH INPUT'
                : 'OPEN SETTINGS'}
          </Text>
        </Pressable>
      ) : (
        <View
          accessible
          accessibilityRole="button"
          accessibilityLabel={
            preparing
              ? 'Preparing the speech model'
              : listening
                ? `Stop speaking ${label}`
                : `Hold to speak ${label}. Double tap to start or stop.`
          }
          accessibilityState={{
            disabled: !enabled && !listening && !preparing,
            busy: listening || preparing,
          }}
          onAccessibilityTap={() => {
            if (listening || preparing) {
              onRelease();
            } else if (enabled) {
              onStart();
            }
          }}
          onStartShouldSetResponder={() => enabled}
          onResponderGrant={() => {
            setPressed(true);
            tap();
            onStart();
          }}
          onResponderRelease={() => {
            setPressed(false);
            onRelease();
          }}
          onResponderTerminate={() => {
            setPressed(false);
            onTerminate();
          }}
          onResponderTerminationRequest={() => false}
          style={[
            styles.control,
            listening && styles.controlListening,
            !enabled && styles.controlDisabled,
            pressed && styles.controlPressed,
          ]}
        >
          <Ionicons
            name={listening ? 'mic' : 'mic-outline'}
            size={18}
            color={listening ? colors.accent : colors.foreground}
          />
          <Text
            style={[
              styles.controlLabel,
              listening && styles.controlLabelListening,
            ]}
          >
            {preparing
              ? 'PREPARING SPEECH MODEL…'
              : listening
                ? `LISTENING · ${label}`
                : phase === 'translating'
                  ? 'TRANSLATING…'
                  : Platform.OS === 'web'
                    ? 'SPEECH INPUT REQUIRES THE IOS APP'
                    : `HOLD TO SPEAK · ${label}`}
          </Text>
        </View>
      )}
    </View>
  );
}

export default function ConversationScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const allowance = useScanAllowance();
  const preferred = useSourceLanguage();
  const { openSheet } = useSheet();
  const localLanguage = preferredLocalLanguage(preferred.code);

  const [messages, setMessages] = useState<Message[]>([]);
  const [phase, setPhase] = useState<Phase>('idle');
  const [activeSide, setActiveSide] = useState<Side | null>(null);
  const [permission, setPermission] = useState<SpeechPermissionPayload | null>(
    null,
  );
  const [requesting, setRequesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState<PendingRetry | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [ttsEnabled, setTtsEnabled] = useState(true);

  const phaseRef = useRef<Phase>('idle');
  const retryToken = useRef(0);
  const packRequest = useRef<string | null>(null);
  const ttsRef = useRef(true);
  const activeRef = useRef<Side | null>(null);
  const turnId = useRef<string | null>(null);
  const turnCounter = useRef(0);
  const messageCounter = useRef(0);
  const started = useRef(false);
  const released = useRef(false);
  const finishing = useRef(false);

  const setTurnPhase = (next: Phase) => {
    phaseRef.current = next;
    setPhase(next);
  };

  const append = (side: Side, text: string) => {
    const message: Message = {
      id: ++messageCounter.current,
      side,
      text,
    };
    setMessages((current) => [...current.slice(-39), message]);
  };

  const resetTurn = () => {
    started.current = false;
    released.current = false;
    finishing.current = false;
    turnId.current = null;
    activeRef.current = null;
    setActiveSide(null);
    setTurnPhase('idle');
  };

  const cancelRetry = () => {
    retryToken.current += 1;
    const request = packRequest.current;
    packRequest.current = null;
    setRetrying(false);
    if (request !== null) {
      void vision.cancelLanguagePack(request).catch(() => {});
    }
  };

  const cancelTurn = () => {
    const id = turnId.current;
    cancelRetry();
    resetTurn();
    if (id !== null) {
      void vision.cancelListening(id).catch(() => {});
    }
  };

  const finishTurn = async (id: string, side: Side) => {
    if (finishing.current) {
      return;
    }
    finishing.current = true;
    setTurnPhase('translating');

    try {
      const transcript = (await vision.stopListening(id)).trim();
      if (turnId.current !== id) {
        return;
      }
      if (!transcript) {
        setError('No speech detected. Hold and try again.');
        return;
      }
      const source = conversationSourceLanguage(side, localLanguage);
      const target = conversationTargetLanguage(side, localLanguage);
      const outcome = await translateText({
        text: transcript,
        sourceLanguage: source,
        targetLanguage: target,
      });
      if (turnId.current !== id) {
        return;
      }
      if (outcome.status === 'translated') {
        append(side === 'en' ? 'local' : 'en', outcome.text);
        if (ttsRef.current) {
          void vision.speak(outcome.text, target).catch(() => {});
        }
        setError(null);
        setRetry(null);
      } else if (outcome.status === 'pack_missing') {
        setRetry({
          source,
          target,
          transcript,
          recipient: side === 'en' ? 'local' : 'en',
        });
        setError(outcome.message);
      } else {
        setError(outcome.message);
      }
    } catch (caught) {
      if (
        turnId.current === id &&
        errorCode(caught) !== 'ERR_SPEECH_CANCELLED'
      ) {
        setError(speechErrorMessage(caught));
      }
    } finally {
      if (turnId.current === id) {
        resetTurn();
      }
      finishing.current = false;
    }
  };

  const beginTurn = async (side: Side) => {
    if (phaseRef.current !== 'idle' || retrying) {
      return;
    }
    void vision.stopSpeaking().catch(() => {});
    cancelRetry();
    const id = `conversation-${Date.now()}-${++turnCounter.current}`;
    turnId.current = id;
    activeRef.current = side;
    started.current = false;
    released.current = false;
    finishing.current = false;
    setActiveSide(side);
    setError(null);
    setRetry(null);
    setTurnPhase('preparing');

    const language =
      side === 'en' ? 'en' : conversationSourceLanguage('local', localLanguage);
    try {
      await vision.startListening(id, language, [
        'en',
        conversationSourceLanguage('local', localLanguage),
      ]);
    } catch (caught) {
      if (turnId.current !== id) {
        return;
      }
      resetTurn();
      const code = errorCode(caught);
      if (code !== 'ERR_SPEECH_CANCELLED') {
        setError(speechErrorMessage(caught));
      }
      return;
    }

    if (turnId.current !== id) {
      void vision.cancelListening(id).catch(() => {});
      return;
    }
    started.current = true;
    setTurnPhase('listening');
    if (released.current) {
      void finishTurn(id, side);
    }
  };

  const releaseTurn = (side: Side) => {
    if (activeRef.current !== side) {
      return;
    }
    released.current = true;
    const id = turnId.current;
    if (id !== null && !started.current && !finishing.current) {
      void vision.cancelListening(id).catch(() => {});
      resetTurn();
      return;
    }
    if (id !== null && !finishing.current) {
      void finishTurn(id, side);
    }
  };

  const enableSpeech = async () => {
    if (requesting) {
      return;
    }
    setRequesting(true);
    try {
      const status = await vision.requestSpeechPermissions();
      setPermission(status);
    } catch {
      setError('Speech access could not be requested.');
    } finally {
      setRequesting(false);
    }
  };

  const retryTranscript = async () => {
    if (!retry || retrying) {
      return;
    }
    const run = ++retryToken.current;
    const current = retry;
    const request = `conversation-pack-${Date.now()}-${run}`;
    packRequest.current = request;
    setRetrying(true);
    try {
      const outcome = await installPack(
        current.source,
        current.target,
        request,
      );
      if (run !== retryToken.current) {
        return;
      }
      packRequest.current = null;
      if (outcome !== 'installed') {
        setError(
          outcome === 'cancelled'
            ? 'The pack download was cancelled. Try again.'
            : 'The language pack could not be installed.',
        );
        return;
      }
      const translated = await translateText({
        text: current.transcript,
        sourceLanguage: current.source,
        targetLanguage: current.target,
      });
      if (run !== retryToken.current) {
        return;
      }
      if (translated.status === 'translated') {
        append(current.recipient, translated.text);
        if (ttsRef.current) {
          void vision.speak(translated.text, current.target).catch(() => {});
        }
        setError(null);
        setRetry(null);
      } else {
        setError(translated.message);
      }
    } catch {
      if (run === retryToken.current) {
        setError('The language pack could not be installed.');
      }
    } finally {
      if (run === retryToken.current) {
        packRequest.current = null;
        setRetrying(false);
      }
    }
  };

  useFocusEffect(
    useCallback(() => {
      if (Platform.OS !== 'web') {
        void vision
          .speechPermissionStatus()
          .then((status) => setPermission(status))
          .catch(() => {});
      }
      return () => {
        cancelTurn();
        void vision.stopSpeaking().catch(() => {});
      };
      // The turn refs are stable; the cleanup only invalidates this screen's
      // active native turn.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );

  useEffect(() => {
    setMessages([]);
    setRetry(null);
    setError(null);
    cancelTurn();
    if (Platform.OS !== 'web') {
      void vision.prepareSpeechAssets([
        'en',
        conversationSourceLanguage('local', localLanguage),
      ]);
    }
    // A changed pair relabels both sides, so old turns cannot remain.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localLanguage]);

  useEffect(() => {
    if (Platform.OS === 'web') {
      return;
    }
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') {
        if (turnId.current !== null) {
          cancelTurn();
        }
        void vision.stopSpeaking().catch(() => {});
        return;
      }
      void vision
        .speechPermissionStatus()
        .then((status) => setPermission(status))
        .catch(() => {});
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (Platform.OS === 'web') {
      return;
    }
    return () => {
      const id = turnId.current;
      if (id !== null) {
        void vision.cancelListening(id).catch(() => {});
      }
    };
  }, []);

  const ready =
    Platform.OS !== 'web' &&
    permission?.speech === 'authorized' &&
    permission.microphone === 'granted';

  const paneMessages = (side: Side) =>
    messages.filter((message) => message.side === side);

  return (
    <ScreenShell
      remaining={allowance.remaining}
      unlimited={allowance.unlimited}
      onPaywall={() => router.push('/paywall')}
    >
      <View style={[styles.body, { paddingBottom: insets.bottom }]}>
        {error ? (
          <View style={styles.notice}>
            <Text style={styles.noticeText}>{error}</Text>
            {retry ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Download language pack and retry"
                disabled={retrying}
                onPress={() => void retryTranscript()}
                style={({ pressed }) => [
                  styles.retry,
                  pressed && styles.controlPressed,
                ]}
              >
                <Text style={styles.retryText}>
                  {retrying ? 'DOWNLOADING…' : 'DOWNLOAD & RETRY'}
                </Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        <ConversationPane
          flipped
          language={localLanguage}
          messages={paneMessages('local')}
          phase={phase}
          active={activeSide === 'local'}
          ready={ready}
          requesting={requesting}
          retrying={retrying}
          permission={permission}
          onEnable={() => void enableSpeech()}
          onStart={() => void beginTurn('local')}
          onRelease={() => releaseTurn('local')}
          onTerminate={cancelTurn}
        />
        <View style={styles.divider} />
        <ConversationPane
          language="en"
          messages={paneMessages('en')}
          phase={phase}
          active={activeSide === 'en'}
          ready={ready}
          requesting={requesting}
          retrying={retrying}
          permission={permission}
          header={
            <View style={styles.optionsRow}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Conversation language: ${languageLabel(localLanguage)}. Change language.`}
                onPress={() =>
                  openSheet({
                    kind: 'languagePicker',
                    title: 'CONVERSATION LANGUAGE',
                    selected: localLanguage,
                    travelerOnly: true,
                    packTarget: 'en',
                    onSelect: (code) => {
                      void sourceLanguage.set(code).catch(() => {});
                    },
                  })
                }
                style={({ pressed: pressedChip }) => [
                  styles.languageChip,
                  pressedChip && styles.languageChipPressed,
                ]}
              >
                <Ionicons
                  name="language-outline"
                  size={14}
                  color={colors.accent}
                />
                <Text style={styles.languageChipText}>
                  {languageLabel(localLanguage)}
                </Text>
              </Pressable>
              <View style={styles.ttsControl}>
                <Text style={styles.ttsLabel}>SPEAK</Text>
                <Switch
                accessibilityLabel="Speak translations"
                value={ttsEnabled}
                onValueChange={(next) => {
                  ttsRef.current = next;
                  setTtsEnabled(next);
                  if (!next) {
                    void vision.stopSpeaking().catch(() => {});
                  }
                }}
                trackColor={{
                  false: colors.border,
                  true: colors.accentSoft,
                }}
                thumbColor={ttsEnabled ? colors.accent : colors.dim}
                  ios_backgroundColor={colors.border}
                />
              </View>
            </View>
          }
          onEnable={() => void enableSpeech()}
          onStart={() => void beginTurn('en')}
          onRelease={() => releaseTurn('en')}
          onTerminate={cancelTurn}
        />
      </View>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  body: {
    flex: 1,
  },
  pane: {
    flex: 1,
    minHeight: 0,
    paddingHorizontal: layout.page,
    paddingTop: 8,
    paddingBottom: 8,
  },
  flipped: {
    transform: [{ rotate: '180deg' }],
  },
  logScroll: {
    flex: 1,
  },
  log: {
    flexGrow: 1,
    gap: 8,
  },
  logFilled: {
    justifyContent: 'flex-end',
  },
  logEmpty: {
    justifyContent: 'center',
  },
  hint: {
    ...typography.body,
    color: colors.dim,
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  message: {
    alignSelf: 'flex-start',
    maxWidth: '92%',
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  messageText: {
    fontSize: 22,
    lineHeight: 30,
    letterSpacing: -0.1,
    fontWeight: '500',
    color: colors.foreground,
  },
  optionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingBottom: 6,
  },
  languageChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  languageChipPressed: {
    backgroundColor: colors.surface,
  },
  languageChipText: {
    ...typography.micro,
    color: colors.foreground,
    letterSpacing: 0.6,
  },
  ttsControl: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  ttsLabel: {
    ...typography.micro,
    color: colors.muted,
    letterSpacing: 1.2,
  },
  divider: {
    height: 1,
    marginHorizontal: layout.page,
    backgroundColor: colors.borderSoft,
  },
  control: {
    minHeight: 56,
    marginTop: 8,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceRaised,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 18,
  },
  controlListening: {
    borderColor: colors.accent,
    backgroundColor: colors.accentSoft,
  },
  controlDisabled: {
    opacity: 0.48,
  },
  controlPressed: {
    opacity: 0.7,
  },
  controlLabel: {
    ...typography.micro,
    color: colors.muted,
    letterSpacing: 1.2,
    textAlign: 'center',
  },
  controlLabelListening: {
    color: colors.accent,
  },
  notice: {
    marginHorizontal: layout.page,
    marginTop: 4,
    marginBottom: 6,
    padding: 10,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceRaised,
    gap: 8,
  },
  noticeText: {
    ...typography.label,
    color: colors.muted,
    lineHeight: 17,
  },
  retry: {
    alignSelf: 'flex-start',
  },
  retryText: {
    ...typography.micro,
    color: colors.accent,
  },
});
