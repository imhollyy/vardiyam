import { useCallback, useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';

import { useAppDatabase } from '@/src/data/AppDatabaseProvider';
import { getDayEntry, upsertDayEntry, deleteDayEntry, type DayEntryPatch } from '@/src/data/dayEntryRepository';
import { getSettings } from '@/src/data/settingsRepository';
import { listShiftTemplates, listShiftCycles } from '@/src/data/shiftCycleRepository';
import { resolvePlannedTemplates, enumerateDays, calculateOvertime, type Settings } from '@/src/domain/payroll/index';
import type { LeaveType } from '@/src/domain/payroll/types';
import type { ShiftTemplate } from '@/src/domain/shift-cycle/index';
import { formatTryMinor } from '@/src/domain/money';
import { useAppTheme } from '@/src/theme/AppThemeProvider';
import { fonts, layout, shiftPalette } from '@/src/theme/tokens';
import { Card } from '@/src/components/ui/Card';
import { Stepper } from '@/src/components/ui/Stepper';
import { ActionButton } from '@/src/components/ui/ActionButton';
import { QuickTile, QuickTileGrid } from '@/src/components/ui/QuickTile';
import { QuickChips } from '@/src/components/ui/QuickChips';
import { ChoiceGroup } from '@/src/components/ui/ChoiceChip';

type QuickMode = 'overtime' | 'lateEarly' | 'leave' | 'shiftOverride' | null;

const LEAVE_OPTIONS: { value: LeaveType; label: string; deducted: boolean }[] = [
  { value: 'ANNUAL', label: 'Yıllık izin', deducted: false },
  { value: 'UNPAID', label: 'Ücretsiz izin', deducted: true },
  { value: 'SICK', label: 'Hastalık raporu', deducted: true },
  { value: 'EXCUSE', label: 'Mazeret izni', deducted: false },
  { value: 'MATERNITY', label: 'Doğum izni', deducted: false },
  { value: 'BEREAVEMENT', label: 'Ölüm izni', deducted: false },
  { value: 'SOCIAL', label: 'Sosyal izin', deducted: false },
  { value: 'HOURLY', label: 'Saatlik izin', deducted: false },
];

function formatDisplayDate(localDate: string): string {
  const [y, m, d] = localDate.split('-');
  const months = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
  return `${Number(d)} ${months[Number(m) - 1] ?? ''} ${y}`;
}

export default function DayEditScreen() {
  const { theme, mode } = useAppTheme();
  const database = useAppDatabase();
  const router = useRouter();
  const { date } = useLocalSearchParams<{ date: string }>();
  const localDate = date ?? '';

  const [quickMode, setQuickMode] = useState<QuickMode>(null);
  const [overtimeHours, setOvertimeHours] = useState(0);
  const [lateEarlyHours, setLateEarlyHours] = useState(0);
  const [leaveType, setLeaveType] = useState<LeaveType | null>(null);
  const [leaveHalfDay, setLeaveHalfDay] = useState(false);
  const [leaveHourly, setLeaveHourly] = useState(0);
  const [leaveDeducted, setLeaveDeducted] = useState(false);
  const [shiftOverrideId, setShiftOverrideId] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [noteExpanded, setNoteExpanded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [templates, setTemplates] = useState<ShiftTemplate[]>([]);
  const [plannedTemplateId, setPlannedTemplateId] = useState<string | null>(null);

  useEffect(() => {
    if (!localDate) return;
    let active = true;
    void (async () => {
      const [entry, s, tmpl, cycles] = await Promise.all([
        getDayEntry(database, localDate),
        getSettings(database),
        listShiftTemplates(database),
        listShiftCycles(database),
      ]);
      if (!active) return;
      setSettings(s);
      setTemplates(tmpl);
      const entryMap = entry ? new Map([[localDate, entry]]) : new Map<string, typeof entry>();
      const planned = resolvePlannedTemplates(enumerateDays(localDate, localDate), cycles, tmpl, entryMap as Map<string, NonNullable<typeof entry>>);
      setPlannedTemplateId(planned.get(localDate) ?? null);
      if (entry) {
        setIsDirty(true);
        if (entry.overtimeMinutes > 0) {
          setOvertimeHours(entry.overtimeMinutes / 60);
          setQuickMode('overtime');
        } else if (entry.lateEarlyMinutes > 0) {
          setLateEarlyHours(entry.lateEarlyMinutes / 60);
          setQuickMode('lateEarly');
        } else if (entry.leaveType) {
          setLeaveType(entry.leaveType);
          setLeaveHalfDay(entry.leaveHalfDay);
          setQuickMode('leave');
        } else if (entry.shiftOverrideId) {
          setShiftOverrideId(entry.shiftOverrideId);
          setQuickMode('shiftOverride');
        }
        setNote(entry.note ?? '');
        if (entry.note) setNoteExpanded(true);
      }
    })();
    return () => { active = false; };
  }, [database, localDate]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const overtime = Math.max(0, Math.round(overtimeHours * 60));
      const lateEarly = Math.max(0, Math.round(lateEarlyHours * 60));
      const hasData = overtime > 0 || lateEarly > 0 || leaveType !== null || shiftOverrideId !== null || note.trim().length > 0;
      if (!hasData) {
        await deleteDayEntry(database, localDate);
      } else {
        const patch: DayEntryPatch = {
          overtimeMinutes: overtime,
          lateEarlyMinutes: lateEarly,
          leaveType: leaveType,
          leaveHalfDay: leaveType !== null && leaveHalfDay,
          note: note.trim() || null,
          shiftOverrideId: shiftOverrideId,
        };
        await upsertDayEntry(database, localDate, patch);
      }
      router.back();
    } catch {
      setSaving(false);
    }
  }, [database, localDate, overtimeHours, lateEarlyHours, leaveType, leaveHalfDay, shiftOverrideId, note, router]);

  const handleReset = useCallback(() => {
    setQuickMode(null);
    setOvertimeHours(0);
    setLateEarlyHours(0);
    setLeaveType(null);
    setLeaveHalfDay(false);
    setLeaveHourly(0);
    setLeaveDeducted(false);
    setShiftOverrideId(null);
    setNote('');
    setNoteExpanded(false);
    setIsDirty(false);
  }, []);

  const toggleMode = (m: QuickMode) => setQuickMode((prev) => prev === m ? null : m);

  if (!localDate) return null;

  const plannedTemplate = plannedTemplateId ? templates.find((t) => t.id === plannedTemplateId) : null;
  const headerPalette = shiftPalette.day[mode];

  const overtimeEstimate = settings && overtimeHours > 0
    ? calculateOvertime(Math.round(overtimeHours * 60), settings.salaryMinor)
    : null;
  const lateEarlyEstimate = settings && lateEarlyHours > 0
    ? calculateOvertime(Math.round(lateEarlyHours * 60), settings.salaryMinor)
    : null;
  const leaveInfo = leaveType ? LEAVE_OPTIONS.find((o) => o.value === leaveType) : null;

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: theme.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Handle */}
      <View style={styles.handle} accessibilityElementsHidden>
        <View style={[styles.handleBar, { backgroundColor: theme.border }]} />
      </View>

      {/* Header: vardiya renginde tarih + başlık */}
      <View style={[styles.header, { backgroundColor: headerPalette.background }]}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ fontFamily: fonts.extraBold, fontSize: layout.type.section, color: headerPalette.text }}>
            {formatDisplayDate(localDate)}
          </Text>
          <Text style={{ fontFamily: fonts.medium, fontSize: 13, color: headerPalette.textSecondary }}>
            {plannedTemplate
              ? `${plannedTemplate.name} · ${plannedTemplate.startLocalTime} – ${plannedTemplate.endLocalTime}`
              : 'Bu gün ne oldu?'}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Kapat"
          onPress={() => router.back()}
          style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.1)' }}
        >
          <Ionicons name="close" size={20} color={headerPalette.text} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
        {/* 2×2 QuickTile */}
        <QuickTileGrid>
          <View style={{ flex: 1, minWidth: '45%' }}>
            <QuickTile icon="timer-outline" label="Mesai yaptım" selected={quickMode === 'overtime'} onPress={() => toggleMode('overtime')} />
          </View>
          <View style={{ flex: 1, minWidth: '45%' }}>
            <QuickTile icon="trending-down-outline" label="Geç / erken çıktım" selected={quickMode === 'lateEarly'} onPress={() => toggleMode('lateEarly')} />
          </View>
          <View style={{ flex: 1, minWidth: '45%' }}>
            <QuickTile icon="bed-outline" label="İzinliydim" selected={quickMode === 'leave'} onPress={() => toggleMode('leave')} />
          </View>
          <View style={{ flex: 1, minWidth: '45%' }}>
            <QuickTile icon="swap-horizontal-outline" label="Vardiya farklıydı" selected={quickMode === 'shiftOverride'} onPress={() => toggleMode('shiftOverride')} />
          </View>
        </QuickTileGrid>

        {/* Mesai kartı */}
        {quickMode === 'overtime' && (
          <Card>
            <Text style={[styles.cardTitle, { color: theme.ink }]}>Fazla mesai</Text>
            <QuickChips
              options={[{ value: 1, label: '+1' }, { value: 2, label: '+2' }, { value: 3, label: '+3' }, { value: 4, label: '+4' }]}
              selected={Number.isInteger(overtimeHours) && overtimeHours >= 1 && overtimeHours <= 4 ? overtimeHours : null}
              onSelect={(v) => setOvertimeHours(v)}
            />
            <Stepper value={overtimeHours} onValueChange={setOvertimeHours} min={0} max={12} step={0.5} />
            {overtimeEstimate !== null && (
              <Text style={[styles.estimate, { color: theme.muted }]}>
                ≈ +{formatTryMinor(overtimeEstimate)} bu döneme eklenecek
              </Text>
            )}
          </Card>
        )}

        {/* Geç/erken kartı */}
        {quickMode === 'lateEarly' && (
          <Card>
            <Text style={[styles.cardTitle, { color: theme.ink }]}>Geç kalma / erken çıkış</Text>
            <QuickChips
              options={[{ value: 1, label: '+1' }, { value: 2, label: '+2' }, { value: 3, label: '+3' }, { value: 4, label: '+4' }]}
              selected={Number.isInteger(lateEarlyHours) && lateEarlyHours >= 1 && lateEarlyHours <= 4 ? lateEarlyHours : null}
              onSelect={(v) => setLateEarlyHours(v)}
            />
            <Stepper value={lateEarlyHours} onValueChange={setLateEarlyHours} min={0} max={8} step={0.5} />
            {lateEarlyEstimate !== null && (
              <Text style={[styles.estimate, { color: theme.muted }]}>
                ≈ −{formatTryMinor(lateEarlyEstimate)} bu dönemden düşülecek
              </Text>
            )}
          </Card>
        )}

        {/* İzin kartı */}
        {quickMode === 'leave' && (
          <Card>
            <Text style={[styles.cardTitle, { color: theme.ink }]}>İzin türü</Text>
            <ChoiceGroup
              options={LEAVE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
              selected={leaveType ?? ''}
              onSelect={(v) => {
                setLeaveType(v as LeaveType);
                setLeaveDeducted(LEAVE_OPTIONS.find((o) => o.value === v)?.deducted ?? false);
              }}
            />
            {leaveInfo ? (
              <View style={{ gap: 10, marginTop: 8 }}>
                <Text style={{ fontFamily: fonts.semiBold, fontSize: layout.type.caption, color: theme.muted }}>
                  {leaveInfo.deducted ? 'Maaştan kesilir' : 'Maaştan kesilmez'}
                </Text>
                {/* Tam / Yarım segment */}
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {(['Tam gün', 'Yarım gün'] as const).map((label) => {
                    const isHalf = label === 'Yarım gün';
                    const active = leaveHalfDay === isHalf;
                    return (
                      <Pressable
                        key={label}
                        accessibilityRole="button"
                        accessibilityState={{ selected: active }}
                        onPress={() => setLeaveHalfDay(isHalf)}
                        style={{ flex: 1, minHeight: 44, borderRadius: layout.radius.control, borderWidth: active ? 2 : 1, borderColor: active ? theme.ink : theme.border, alignItems: 'center', justifyContent: 'center', backgroundColor: active ? theme.ink : theme.surface }}
                      >
                        <Text style={{ fontFamily: fonts.semiBold, fontSize: layout.type.body, color: active ? theme.onInk : theme.ink }}>{label}</Text>
                      </Pressable>
                    );
                  })}
                </View>
                {/* Saatlik giriş */}
                {leaveType === 'HOURLY' && (
                  <Stepper value={leaveHourly} onValueChange={setLeaveHourly} min={0} max={8} step={0.5} />
                )}
                {/* Maaştan kesilsin */}
                {!leaveInfo.deducted && (
                  <Pressable
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: leaveDeducted }}
                    onPress={() => setLeaveDeducted((v) => !v)}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 }}
                  >
                    <View style={{ width: 22, height: 22, borderWidth: 2, borderRadius: 6, alignItems: 'center', justifyContent: 'center', borderColor: leaveDeducted ? theme.ink : theme.border, backgroundColor: leaveDeducted ? theme.ink : 'transparent' }}>
                      {leaveDeducted && <Ionicons name="checkmark" size={14} color={theme.onInk} />}
                    </View>
                    <Text style={{ fontFamily: fonts.semiBold, color: theme.ink, fontSize: layout.type.body }}>Maaştan kesilsin</Text>
                  </Pressable>
                )}
              </View>
            ) : null}
          </Card>
        )}

        {/* Vardiya seçimi kartı */}
        {quickMode === 'shiftOverride' && templates.length > 0 && (
          <Card>
            <Text style={[styles.cardTitle, { color: theme.ink }]}>Hangi vardiyaydı?</Text>
            <ChoiceGroup
              options={templates.map((t) => ({ value: t.id, label: `${t.name}  ${t.startLocalTime} – ${t.endLocalTime}` }))}
              selected={shiftOverrideId ?? ''}
              onSelect={(v) => setShiftOverrideId(v)}
            />
          </Card>
        )}

        {/* Not — katlanabilir */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={noteExpanded ? 'Notu gizle' : 'Not ekle'}
          onPress={() => setNoteExpanded((v) => !v)}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 }}
        >
          <Ionicons accessible={false} name={noteExpanded ? 'chevron-up' : 'chatbubble-outline'} size={18} color={theme.muted} />
          <Text style={{ fontFamily: fonts.semiBold, fontSize: layout.type.body, color: theme.muted }}>
            {noteExpanded ? 'Notu gizle' : (note ? `Not: ${note.slice(0, 40)}` : 'Not ekle')}
          </Text>
        </Pressable>
        {noteExpanded && (
          <Card>
            <TextInput
              style={[styles.noteInput, { color: theme.ink, borderColor: theme.border, backgroundColor: theme.surface, fontFamily: fonts.regular }]}
              value={note}
              onChangeText={setNote}
              placeholder="Bugüne dair not"
              placeholderTextColor={theme.muted}
              multiline
              accessibilityLabel="Gün notu"
            />
          </Card>
        )}
      </ScrollView>

      {/* Footer */}
      <View style={[styles.footer, { borderTopColor: theme.border }]}>
        {isDirty ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Varsayılana döndür"
            onPress={handleReset}
            style={[styles.resetButton, { borderColor: theme.border }]}
          >
            <Ionicons name="refresh" size={18} color={theme.muted} />
          </Pressable>
        ) : null}
        <View style={{ flex: 1 }}>
          <ActionButton label={saving ? 'Kaydediliyor…' : 'Kaydet'} onPress={handleSave} disabled={saving} loading={saving} icon="checkmark" />
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  handle: { alignItems: 'center', paddingTop: 12, paddingBottom: 4 },
  handleBar: { width: 36, height: 4, borderRadius: layout.radius.handle },
  header: { paddingHorizontal: layout.screen.horizontal, paddingVertical: 16, flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  form: { paddingHorizontal: layout.screen.horizontal, paddingBottom: 16, gap: layout.space.md, paddingTop: layout.space.sm },
  cardTitle: { fontFamily: fonts.bold, fontSize: layout.type.body, marginBottom: 4 },
  estimate: { fontFamily: fonts.medium, fontSize: layout.type.caption, lineHeight: 18 },
  noteInput: { borderWidth: 1, borderRadius: layout.radius.input, paddingHorizontal: 14, paddingVertical: 12, fontSize: layout.type.body, minHeight: 80, textAlignVertical: 'top' },
  footer: { flexDirection: 'row', gap: 12, paddingHorizontal: layout.screen.horizontal, paddingBottom: layout.screen.bottom, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth },
  resetButton: { width: 48, height: layout.control.minHeight, borderWidth: 1.5, borderRadius: layout.radius.control, alignItems: 'center', justifyContent: 'center' },
});
