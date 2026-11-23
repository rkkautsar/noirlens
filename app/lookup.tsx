import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import Ionicons from '@expo/vector-icons/Ionicons';
import {
  ActivityIndicator,
  Image,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { SheetHeader } from '@/components/SheetHeader';
import { ChipButton, MicroLabel, SolidButton } from '@/components/ui';
import {
  browserSearchUrl,
  lookUp,
  type LookupResult,
} from '@/services/lookup';
import { colors, typography } from '@/theme';

export default function LookupScreen() {
  const router = useRouter();
  const { q, alt, terms } = useLocalSearchParams<{
    q?: string;
    alt?: string;
    terms?: string;
  }>();
  const [result, setResult] = useState<LookupResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const termList: string[] = (() => {
    if (typeof terms !== 'string' || !terms) {
      return [];
    }
    try {
      const parsed: unknown = JSON.parse(terms);
      return Array.isArray(parsed)
        ? parsed.filter((term): term is string => typeof term === 'string')
        : [];
    } catch {
      return [];
    }
  })();

  useEffect(() => {
    if (termList.length > 0) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    const phrase = typeof q === 'string' ? q : '';
    const fallback = typeof alt === 'string' ? alt : '';
    void (async () => {
      let found = await lookUp(phrase).catch(() => null);
      if (!found && fallback && fallback !== phrase) {
        found = await lookUp(fallback).catch(() => null);
      }
      if (!cancelled) {
        setResult(found);
        setFailed(found === null);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, alt, terms]);

  const phrase = (typeof q === 'string' ? q : '') || (typeof alt === 'string' ? alt : '');

  return (
    <View style={styles.screen}>
      <SheetHeader
        title={termList.length > 0 ? 'TERMS' : 'LOOK UP'}
        subtitle={
          termList.length > 0
            ? 'TAP A TERM TO EXPLAIN'
            : 'WIKIPEDIA · DUCKDUCKGO'
        }
      />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        {termList.length > 0 ? (
          <View style={styles.block}>
            {termList.map((term) => (
              <Pressable
                key={term}
                accessibilityRole="button"
                onPress={() => {
                  router.push({
                    pathname: '/lookup',
                    params: { q: term },
                  });
                }}
                style={({ pressed }) => [
                  styles.termRow,
                  pressed && styles.termRowPressed,
                ]}
              >
                <Text style={styles.termText}>{term}</Text>
                <Ionicons
                  name="chevron-forward"
                  size={16}
                  color={colors.muted}
                />
              </Pressable>
            ))}
          </View>
        ) : loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="small" color={colors.accent} />
            <MicroLabel tone="dim">SEARCHING…</MicroLabel>
          </View>
        ) : failed ? (
          <View style={styles.block}>
            <Text style={styles.title}>{phrase}</Text>
            <Text style={styles.body}>
              No summary found. Try a web search for this phrase.
            </Text>
            <SolidButton
              label="SEARCH THE WEB"
              icon="search-outline"
              onPress={() => {
                void Linking.openURL(browserSearchUrl(phrase)).catch(() => {});
              }}
              primary
            />
          </View>
        ) : result ? (
          <View style={styles.block}>
            {result.image ? (
              <Image
                source={{ uri: result.image }}
                style={styles.image}
                resizeMode="cover"
              />
            ) : null}
            <Text style={styles.title}>{result.title}</Text>
            <MicroLabel tone="dim">
              {result.source === 'wikipedia' ? 'WIKIPEDIA' : 'DUCKDUCKGO'}
            </MicroLabel>
            <Text style={styles.body}>{result.extract}</Text>
            <View style={styles.actions}>
              {result.url ? (
                <ChipButton
                  label="READ MORE"
                  icon="open-outline"
                  onPress={() => {
                    if (result.url) {
                      void Linking.openURL(result.url).catch(() => {});
                    }
                  }}
                />
              ) : null}
              <ChipButton
                label="SEARCH"
                icon="search-outline"
                onPress={() => {
                  void Linking.openURL(browserSearchUrl(phrase)).catch(
                    () => {},
                  );
                }}
              />
            </View>
          </View>
        ) : null}
      </ScrollView>
      <View style={styles.footer}>
        <SolidButton
          label="CLOSE"
          icon="close"
          onPress={() => {
            if (router.canGoBack()) {
              router.back();
            } else {
              router.replace('/preview');
            }
          }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 24,
    gap: 12,
  },
  center: {
    paddingTop: 40,
    alignItems: 'center',
    gap: 10,
  },
  block: {
    gap: 10,
  },
  image: {
    width: '100%',
    height: 180,
    borderRadius: 14,
    backgroundColor: colors.surface,
  },
  title: {
    ...typography.title,
    color: colors.foreground,
  },
  body: {
    ...typography.body,
    fontSize: 16,
    lineHeight: 24,
    color: colors.muted,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  termRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSoft,
  },
  termRowPressed: {
    opacity: 0.6,
  },
  termText: {
    ...typography.title,
    fontSize: 18,
    color: colors.foreground,
    flexShrink: 1,
  },
  footer: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderSoft,
  },
});
