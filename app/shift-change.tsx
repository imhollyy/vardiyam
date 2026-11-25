import { useCallback, useEffect, useMemo, useState } from 'react';
import { randomUUID } from 'expo-crypto';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';

import { useAppDatabase } from '@/src/data/AppDatabaseProvider';
import { listShiftTemplates, listShiftCycles, appendShiftCycleVersion } from '@/src/data/shiftCycleRepository';
import type { ShiftCycle, ShiftTemplate } from '@/src/domain/shift-cycle/index';
import { buildShiftChangeFromToday } from '@/src/features/shifts/buildShiftChangeFromToday';
import { useAppTheme } from '@/src/theme/AppThemeProvider';
import { fonts, layout, shiftPalette } from '@/src/theme/tokens';
import { ActionButton } from '@/src/components/ui/ActionButton';
import { PageHeading } from '@/src/components/ui/PageHeading';

function todayLocalDate(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

type WhenOption = 'from-today';

function templateShiftKind(t: ShiftTemplate): 'day' | 'evening' | 'night' {
  const start = Number(t.startLocalTime.split(':')[0] ?? '8');
  if (start >= 6 && start < 14) return 'day';
  if (start >= 14 && start < 22) return 'evening';
  return 'night';
}

export default function ShiftChangeScreen() {
  const { theme, mode } = useAppTheme();
  const database = useAppDatabase();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const today = useMemo(() => todayLocalDate(), []);

  const [templates, setTemplates] = useState<ShiftTemplate[]>([]);
  const [cycle, setCycle] = useState<ShiftCycle | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [when, setWhen] = useState<WhenOption>('from-today');
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      const tmpl = await listShiftTemplates(database);
      const cycles = await listShiftCycles(database);
      if (!active) return;
      const activeCycle = cycles[0] ?? null;

      // Only templates referenced in the cycle are selectable
      const cycleTemplateIds = new Set(
        (activeCycle?.entries ?? [])
          .filter((e) => e.kind === 'SHIFT')
          .map((e) => (e as { kind: 'SHIFT'; templateId: string }).templateId),
      );
      const cycleTemplates = tmpl.filter((t) => cycleTemplateIds.has(t.id));

      setTemplates(cycleTemplates.length > 0 ? cycleTemplates : tmpl);
      setCycle(activeCycle);
      if (cycleTemplates.length > 0) setSelectedTemplateId(cycleTemplates[0]!.id);
      setLoaded(true);
    })();
    return () => { active = false; };
  }, [database]);

  const handleSave = useCallback(async () => {
    if (!selectedTemplateId || !cycle) return;
    setSaving(true);
    setError(null);
    try {
      const { effectiveFrom, anchorLocalDate, startIndex } = buildShiftChangeFromToday({
        today,
        targetTemplateId: selectedTemplateId,
        currentCycle: cycle,
      });
      const newCycle: ShiftCycle = { ...cycle, id: randomUUID(), anchorLocalDate, startIndex };
      await appendShiftCycleVersion(database, templates, newCycle, effectiveFrom);
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Kaydedilemedi.');
      setSaving(false);
    }
  }, [database, selectedTemplateId, cycle, today, router, templates]);

  if (!loaded) return null;

  const footerPaddingBottom = Math.max(insets.bottom, layout.screen.bottom);

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <PageHeading eyebrow="VARDIYA" title="Vardiya degistir" />

        {/* Shift block picker */}
        <View style={{ gap: 10 }}>
          {templates.map((t) => {
            const kind = templateShiftKind(t);
            const palette = shiftPalette[kind][mode];
            const sel = selectedTemplateId === t.id;
            return (
              <Pressable
                key={t.id}
                accessibilityRole="radio"
                accessibilityState={{ selected: sel }}
                accessibilityLabel={`${t.name}: ${t.startLocalTime} – ${t.endLocalTime}`}
                onPress={() => setSelectedTemplateId(t.id)}
                style={[styles.shiftCard, {
                  backgroundColor: sel ? palette.background : theme.surface,
                  borderColor: sel ? palette.text : theme.border,
                  borderWidth: sel ? 2 : StyleSheet.hairlineWidth,
                }]}
              >
                <View style={styles.shiftCardLeft}>
                  <Ionicons
                    name={sel ? 'radio-button-on' : 'radio-button-off'}
                    size={20}
                    color={sel ? palette.text : theme.muted}
                    accessible={false}
                  />
                  <View>
                    <Text style={{ fontFamily: fonts.extraBold, fontSize: layout.type.section, color: sel ? palette.text : theme.ink }}>{t.name}</Text>
                    <Text style={{ fontFamily: fonts.medium, fontSize: layout.type.body, color: sel ? palette.textSecondary : theme.muted }}>{t.startLocalTime} – {t.endLocalTime}</Text>
                  </View>
                </View>
                {t.breakMinutes > 0 && (
                  <Text style={{ fontFamily: fonts.regular, fontSize: layout.type.caption, color: sel ? palette.textSecondary : theme.muted }}>{t.breakMinutes} dk mola</Text>
                )}
              </Pressable>
            );
          })}
        </View>

        {/* When toggle */}
        <View style={{ gap: 8 }}>
          <Text style={{ fontFamily: fonts.semiBold, fontSize: layout.type.caption, color: theme.muted, letterSpacing: 0.5, textTransform: 'uppercase' }}>
            Ne zaman?
          </Text>
          <View style={[styles.whenRow, { backgroundColor: theme.surfaceMuted, borderRadius: layout.radius.control }]}>
            <Pressable
              accessibilityRole="radio"
              accessibilityState={{ selected: when === 'from-today' }}
              accessibilityLabel="Bugundan itibaren"
              onPress={() => setWhen('from-today')}
              style={[styles.whenBtn, when === 'from-today' && { backgroundColor: theme.surface, borderRadius: layout.radius.control - 2 }]}
            >
              <Text style={[styles.whenBtnText, { color: when === 'from-today' ? theme.ink : theme.muted, fontFamily: when === 'from-today' ? fonts.semiBold : fonts.regular }]}>
                Bugundan itibaren
              </Text>
            </Pressable>
          </View>
        </View>

        {/* Live preview */}
        {selectedTemplateId && cycle && (() => {
          try {
            const { startIndex } = buildShiftChangeFromToday({ today, targetTemplateId: selectedTemplateId, currentCycle: cycle });
            const previewIdx = startIndex % cycle.entries.length;
            const previewEntry = cycle.entries[previewIdx];
            const tmpl = templates.find((t) => t.id === selectedTemplateId);
            if (!tmpl || !previewEntry) return null;
            const kind = templateShiftKind(tmpl);
            const palette = shiftPalette[kind][mode];
            return (
              <View style={[styles.preview, { backgroundColor: palette.background, borderRadius: layout.radius.card }]}>
                <Text style={{ fontFamily: fonts.semiBold, fontSize: 11, color: palette.textSecondary, letterSpacing: 1, textTransform: 'uppercase' }}>
                  BUGUN
                </Text>
                <Text style={{ fontFamily: fonts.extraBold, fontSize: layout.type.heading, color: palette.text }}>
                  {tmpl.name}
                </Text>
                <Text style={{ fontFamily: fonts.medium, fontSize: layout.type.body, color: palette.textSecondary }}>
                  {tmpl.startLocalTime} – {tmpl.endLocalTime}
                </Text>
              </View>
            );
          } catch { return null; }
        })()}

        {error ? <Text accessibilityRole="alert" style={[styles.error, { color: theme.danger }]}>{error}</Text> : null}
      </ScrollView>

      <View style={[styles.footer, { borderTopColor: theme.border, paddingBottom: footerPaddingBottom }]}>
        <ActionButton
          label={saving ? 'Kaydediliyor...' : 'Kaydet'}
          onPress={() => { void handleSave(); }}
          disabled={!selectedTemplateId || saving}
          loading={saving}
          icon="checkmark"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: layout.screen.horizontal, paddingTop: layout.screen.top, gap: layout.space.md, paddingBottom: layout.space.lg },
  shiftCard: { borderRadius: layout.radius.block, padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 72 },
  shiftCardLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  whenRow: { flexDirection: 'row', padding: 4 },
  whenBtn: { flex: 1, paddingVertical: 10, paddingHorizontal: 14, alignItems: 'center', minHeight: 44, justifyContent: 'center' },
  whenBtnText: { fontSize: layout.type.body },
  preview: { padding: 16, gap: 4 },
  error: { textAlign: 'center', fontSize: layout.type.caption },
  footer: { paddingHorizontal: layout.screen.horizontal, paddingTop: layout.space.md, borderTopWidth: StyleSheet.hairlineWidth },
});
