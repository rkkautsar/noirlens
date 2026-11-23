import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Linking,
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

export function LookupSheet({
  q,
  alt,
  onClose,
}: {
  q?: string;
  alt?: string;
  onClose: () => void;
}) {
  const [result, setResult] = useState<LookupResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
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
  }, [q, alt]);

  const phrase = (typeof q === 'string' ? q : '') || (typeof alt === 'string' ? alt : '');

  return (
    <View style={styles.screen}>
      <SheetHeader title="LOOK UP" subtitle="WIKIPEDIA · DUCKDUCKGO" />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        {loading ? (
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
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
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
  footer: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderSoft,
  },
});
