import Ionicons from '@expo/vector-icons/Ionicons';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useEffect, useReducer, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LanguagePickerSheet } from '@/components/LanguagePickerSheet';
import { MODE_TABS_HEIGHT, ModeTabs } from '@/components/ModeTabs';
import { OverlaySheet } from '@/components/OverlaySheet';
import { ShowToLocal } from '@/components/ShowToLocal';
import { TopBar } from '@/components/TopBar';
import {
  languageLabel,
  languageShortLabel,
} from '@/constants/languages';
import { FREE_DAILY_SCAN_LIMIT } from '@/scanner/machine';
import { hasUnlimitedScans } from '@/services/entitlementLogic';
import { useEntitlementState } from '@/services/entitlements';
import { localDayKey } from '@/services/day';
import { readScanCount } from '@/services/scanLedger';
import {
  IDLE_TRANSLATE,
  describeTranslateFailure,
  swapPair,
  translateReducer,
} from '@/services/translateRequest';
import { useSourceLanguage } from '@/services/sourceLanguage';
import { colors, radius, typography } from '@/theme';
import vision from '../modules/native-vision-translator';

function tap() {
  if (Platform.OS !== 'web') {
    void Haptics.selectionAsync().catch(() => {});
  }
}

export default function TranslateScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const entitlement = useEntitlementState();
  const preferred = useSourceLanguage();

  const [source, setSource] = useState(() =>
    preferred.code !== 'auto' ? preferred.code : 'ja',
  );
  const [target, setTarget] = useState('en');
  const [input, setInput] = useState('');
  const [picker, setPicker] = useState<'source' | 'target' | null>(null);
  const [request, dispatch] = useReducer(translateReducer, IDLE_TRANSLATE);
  const requestCounter = useRef(0);
  const [preparing, setPreparing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [showing, setShowing] = useState(false);
  const [remaining, setRemaining] = useState<number | null>(null);

  const unlimited = hasUnlimitedScans(entitlement, Date.now());

  useEffect(() => {
    void readScanCount(localDayKey())
      .then((count) =>
        setRemaining(Math.max(0, FREE_DAILY_SCAN_LIMIT - count)),
      )
      .catch(() => setRemaining(null));
  }, []);

  // Leaving the screen must not keep speaking.
  useEffect(
    () => () => {
      void vision.stopSpeaking().catch(() => {});
    },
    [],
  );

  useEffect(() => {
    void vision.stopSpeaking().catch(() => {});
    setSpeaking(false);
  }, [target]);

  const reset = () => {
    dispatch({ type: 'reset' });
    setNotice(null);
    setCopied(false);
  };

  const chooseLanguage = (code: string) => {
    if (picker === 'source') {
      setSource(code);
    } else if (picker === 'target') {
      setTarget(code);
    }
    setPicker(null);
    reset();
  };

  const swap = () => {
    tap();
    const next = swapPair(source, target);
    setSource(next.source);
    setTarget(next.target);
    setInput(request.text ?? input);
    reset();
  };

  const run = async () => {
    const text = input.trim();
    if (!text || source === target) {
      return;
    }
    const requestId = requestCounter.current + 1;
    requestCounter.current = requestId;
    dispatch({ type: 'start', requestId });
    setNotice(null);
    try {
      const payload = await vision.translate({
        text,
        sourceLanguage: source,
        targetLanguage: target,
      });
      dispatch({
        type: 'success',
        requestId,
        text: payload.translatedText,
      });
    } catch (error) {
      const failure = describeTranslateFailure(error, source, target);
      dispatch({
        type: 'failure',
        requestId,
        message: failure.message,
        packGap: failure.packGap,
      });
    }
  };

  const prepare = async () => {
    setPreparing(true);
    setNotice(null);
    try {
      const status = await vision.prepareLanguagePack(source, target);
      if (status.status === 'installed') {
        await run();
      } else {
        setNotice('The pack did not finish installing. Try again.');
      }
    } catch (error) {
      const failure = describeTranslateFailure(error, source, target);
      setNotice(failure.message);
    } finally {
      setPreparing(false);
    }
  };

  const copy = async () => {
    if (!request.text) {
      return;
    }
    await Clipboard.setStringAsync(request.text);
    setCopied(true);
    tap();
    setTimeout(() => setCopied(false), 1600);
  };

  const speak = async () => {
    if (!request.text || speaking) {
      return;
    }
    setSpeaking(true);
    try {
      await vision.speak(request.text, target);
    } catch {
      // Unavailable voices fall back to the system default inside native.
    } finally {
      setSpeaking(false);
    }
  };

  const stop = () => {
    void vision.stopSpeaking().catch(() => {});
    setSpeaking(false);
  };

  const canTranslate =
    input.trim().length > 0 && source !== target && request.status !== 'loading';

  return (
    <View style={styles.root}>
      <TopBar
        remaining={remaining}
        unlimited={unlimited}
        onOpenPaywall={() => router.push('/paywall')}
      />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        <ScrollView
          style={styles.flex}
          contentContainerStyle={[
            styles.content,
            { paddingBottom: MODE_TABS_HEIGHT + insets.bottom + 72 },
          ]}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.languageRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Source language: ${languageLabel(source)}`}
              onPress={() => setPicker('source')}
              style={({ pressed }) => [styles.language, pressed && styles.pressed]}
            >
              <Text style={styles.languageHint}>FROM</Text>
              <Text style={styles.languageName} numberOfLines={1}>
                {languageLabel(source)}
              </Text>
              <Text style={styles.languageShort}>{languageShortLabel(source)}</Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Swap languages"
              onPress={swap}
              style={({ pressed }) => [styles.swap, pressed && styles.pressed]}
            >
              <Ionicons name="swap-horizontal" size={18} color={colors.accent} />
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Target language: ${languageLabel(target)}`}
              onPress={() => setPicker('target')}
              style={({ pressed }) => [styles.language, pressed && styles.pressed]}
            >
              <Text style={styles.languageHint}>TO</Text>
              <Text style={styles.languageName} numberOfLines={1}>
                {languageLabel(target)}
              </Text>
              <Text style={styles.languageShort}>{languageShortLabel(target)}</Text>
            </Pressable>
          </View>

          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder="Type or paste text"
            placeholderTextColor={colors.dim}
            selectionColor={colors.accent}
            multiline
            textAlignVertical="top"
            style={styles.input}
            accessibilityLabel="Text to translate"
          />

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Translate"
            accessibilityState={{ disabled: !canTranslate }}
            disabled={!canTranslate}
            onPress={() => void run()}
            style={({ pressed }) => [
              styles.translate,
              !canTranslate && styles.disabled,
              pressed && styles.pressed,
            ]}
          >
            {request.status === 'loading' ? (
              <Text style={styles.translateText}>TRANSLATING…</Text>
            ) : (
              <>
                <Ionicons name="language-outline" size={16} color={colors.background} />
                <Text style={styles.translateText}>TRANSLATE</Text>
              </>
            )}
          </Pressable>

          {source === target ? (
            <Text style={styles.hint}>Choose two different languages.</Text>
          ) : null}

          {request.status === 'error' && request.error ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{request.error}</Text>
              {request.packGap ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Download language pack"
                  disabled={preparing}
                  onPress={() => void prepare()}
                  style={({ pressed }) => [
                    styles.packButton,
                    preparing && styles.disabled,
                    pressed && styles.pressed,
                  ]}
                >
                  <Ionicons name="download-outline" size={15} color={colors.accent} />
                  <Text style={styles.packText}>
                    {preparing ? 'DOWNLOADING…' : 'DOWNLOAD & RETRY'}
                  </Text>
                </Pressable>
              ) : null}
              {notice ? <Text style={styles.notice}>{notice}</Text> : null}
            </View>
          ) : null}

          {request.status === 'done' && request.text ? (
            <View style={styles.result}>
              <Text style={styles.resultText} selectable>
                {request.text}
              </Text>
              <View style={styles.actions}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Copy translation"
                  onPress={() => void copy()}
                  style={({ pressed }) => [styles.action, pressed && styles.pressed]}
                >
                  <Ionicons name="copy-outline" size={15} color={colors.foreground} />
                  <Text style={styles.actionText}>{copied ? 'COPIED' : 'COPY'}</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={speaking ? 'Stop speaking' : 'Speak translation'}
                  accessibilityState={{ selected: speaking }}
                  onPress={() => (speaking ? stop() : void speak())}
                  style={({ pressed }) => [
                    styles.action,
                    speaking && styles.actionActive,
                    pressed && styles.pressed,
                  ]}
                >
                  <Ionicons
                    name={speaking ? 'stop' : 'volume-high-outline'}
                    size={15}
                    color={colors.foreground}
                  />
                  <Text style={styles.actionText}>{speaking ? 'STOP' : 'SPEAK'}</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Show translation to someone"
                  onPress={() => setShowing(true)}
                  style={({ pressed }) => [styles.action, pressed && styles.pressed]}
                >
                  <Ionicons name="expand-outline" size={15} color={colors.foreground} />
                  <Text style={styles.actionText}>SHOW</Text>
                </Pressable>
              </View>
            </View>
          ) : null}

          <Text style={styles.footnote}>
            On-device translation. Works offline once the pack is installed.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>

      <ModeTabs
        active="translate"
        onCamera={() => router.replace('/')}
        onTranslate={() => {}}
      />

      {picker ? (
        <OverlaySheet onClose={() => setPicker(null)}>
          <LanguagePickerSheet
            title={picker === 'source' ? 'TRANSLATE FROM' : 'TRANSLATE TO'}
            selected={picker === 'source' ? source : target}
            onSelect={chooseLanguage}
          />
        </OverlaySheet>
      ) : null}

      {showing && request.text ? (
        <ShowToLocal
          translation={request.text}
          original={input.trim() || undefined}
          speaking={speaking}
          onSpeak={() => void speak()}
          onStop={stop}
          onClose={() => setShowing(false)}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  flex: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 18,
    paddingTop: 20,
    gap: 14,
  },
  languageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  language: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  languageHint: {
    ...typography.micro,
    color: colors.dim,
  },
  languageName: {
    ...typography.label,
    color: colors.foreground,
    marginTop: 4,
  },
  languageShort: {
    ...typography.micro,
    color: colors.accent,
    marginTop: 2,
  },
  swap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentSoft,
  },
  input: {
    minHeight: 132,
    maxHeight: 240,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.foreground,
    fontSize: 17,
    lineHeight: 24,
  },
  translate: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 50,
    borderRadius: radius.md,
    backgroundColor: colors.accent,
  },
  translateText: {
    ...typography.label,
    color: colors.background,
    letterSpacing: 1.2,
  },
  hint: {
    ...typography.body,
    color: colors.dim,
    textAlign: 'center',
  },
  errorBox: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: 14,
    gap: 10,
  },
  errorText: {
    ...typography.body,
    color: colors.danger,
  },
  packButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
  },
  packText: {
    ...typography.label,
    color: colors.accent,
  },
  notice: {
    ...typography.body,
    color: colors.muted,
  },
  result: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: 16,
    gap: 14,
  },
  resultText: {
    ...typography.title,
    fontSize: 24,
    lineHeight: 32,
    color: colors.foreground,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
  },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceRaised,
  },
  actionActive: {
    borderColor: colors.accent,
  },
  actionText: {
    ...typography.micro,
    color: colors.foreground,
  },
  footnote: {
    ...typography.micro,
    color: colors.dim,
    textAlign: 'center',
    marginTop: 4,
  },
  pressed: {
    opacity: 0.7,
  },
  disabled: {
    opacity: 0.4,
  },
});
