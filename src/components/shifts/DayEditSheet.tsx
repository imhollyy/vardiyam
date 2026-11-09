import { useEffect, useState } from 'react';
import { Alert, BackHandler, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { DateTimePickerField } from '@/src/components/ui/DateTimePickerField';
import { useAppDatabase } from '@/src/data/AppDatabaseProvider';
import { saveDayEdit } from '@/src/data/dayEditRepository';
import type { WorkDayStatusEntry } from '@/src/data/workSessionRepository';
import type { PlannedShift, ShiftCycle, ShiftTemplate } from '@/src/domain/shift-cycle';
import { formatDuration, getRecordRangeDifferenceMinutes, utcToLocalDateTime } from '@/src/domain/work-record';
import type { WorkRecordWithTimedBreaks } from '@/src/data/workRecordRepository';
import { formatLocalDate } from '@/src/features/shifts/dates';
import { useAppTheme } from '@/src/theme/AppThemeProvider';

const STATUS_OPTIONS = [
  { value: 'LEAVE', label: 'İzin', icon: 'sunny-outline' },
  { value: 'SICK_REPORT', label: 'Rapor', icon: 'medkit-outline' },
  { value: 'NOT_WORKED', label: 'Devamsızlık', icon: 'alert-circle-outline' },
] as const;

type Draft = {
  status: WorkDayStatusEntry['status'] | null;
  note: string;
  useCycle: boolean;
  planKind: 'SHIFT' | 'OFF' | 'LEAVE';
  templateId: string;
  startTime: string;
  endTime: string;
};

export function DayEditSheet({
  localDate, cycle, plan, templates, statusEntry, note: savedNote, records, onClose, onSaved, onEditRecord, onCreateCycle,
}: {
  localDate: string;
  cycle: ShiftCycle | null;
  plan?: PlannedShift;
  templates: readonly ShiftTemplate[];
  statusEntry?: WorkDayStatusEntry;
  note?: string;
  records: readonly WorkRecordWithTimedBreaks[];
  onClose: () => void;
  onSaved: () => Promise<void> | void;
  onEditRecord: (recordId: string) => void;
  onCreateCycle: () => void;
}) {
  const database = useAppDatabase();
  const { theme } = useAppTheme();
  const templateForPlan = plan?.kind === 'SHIFT' ? templates.find((item) => item.id === plan.templateId) : undefined;
  const initialDraft: Draft = {
    status: statusEntry?.status ?? null,
    note: savedNote ?? statusEntry?.note ?? '',
    useCycle: plan?.source !== 'OVERRIDE',
    planKind: plan?.kind === 'OFF' || plan?.kind === 'LEAVE' ? plan.kind : 'SHIFT',
    templateId: templateForPlan?.id ?? templates[0]?.id ?? '',
    startTime: plan?.kind === 'SHIFT' ? plan.startLocalTime ?? templateForPlan?.startLocalTime ?? '08:00' : templates[0]?.startLocalTime ?? '08:00',
    endTime: plan?.kind === 'SHIFT' ? plan.endLocalTime ?? templateForPlan?.endLocalTime ?? '16:00' : templates[0]?.endLocalTime ?? '16:00',
  };
  const [draft, setDraft] = useState(initialDraft);
  const [baseline] = useState(() => JSON.stringify(initialDraft));
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const timezone = cycle?.timezone ?? 'Europe/Istanbul';
  const isDirty = JSON.stringify(draft) !== baseline;

  const requestClose = (afterClose?: () => void) => {
    if (saving) return;
    const close = () => { onClose(); afterClose?.(); };
    if (!isDirty) { close(); return; }
    Alert.alert('Kaydedilmemiş değişiklikler', 'Bu gün için yaptığın değişiklikleri kaydetmeden kapatmak istiyor musun?', [
      { text: 'Düzenlemeye devam et', style: 'cancel' },
      { text: 'Değişiklikleri at', style: 'destructive', onPress: close },
    ]);
  };

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => { requestClose(); return true; });
    return () => subscription.remove();
  });

  const changeTime = (field: 'startTime' | 'endTime', value: string) => setDraft((current) => ({
    ...current, [field]: value, useCycle: false, planKind: 'SHIFT',
  }));

  const save = async () => {
    if (!cycle && (draft.startTime !== initialDraft.startTime || draft.endTime !== initialDraft.endTime)) {
      setError('Planlı saati saklamak için önce vardiya düzeni oluştur.');
      return;
    }
    if (draft.planKind === 'SHIFT' && !draft.useCycle && !templates.some((item) => item.id === draft.templateId)) {
      setError('Tek günlük vardiya için kullanılabilir bir şablon seçmelisin.');
      setAdvancedOpen(true);
      return;
    }
    setSaving(true); setError(null); setNotice(null);
    try {
      const override = cycle && !draft.useCycle ? draft.planKind === 'SHIFT'
        ? { localDate, kind: 'SHIFT' as const, templateId: draft.templateId }
        : { localDate, kind: draft.planKind } : null;
      const minute = new Date();
      minute.setSeconds(0, 0);
      await saveDayEdit(database, {
        cycleId: cycle?.id ?? null, localDate, override,
        plannedTimes: override?.kind === 'SHIFT' ? { startLocalTime: draft.startTime, endLocalTime: draft.endTime } : null,
        status: draft.status, note: draft.note.trim() || null, updatedAtUtc: minute.toISOString(),
      });
      setNotice('Değişiklikler kaydedildi. Fiilî çalışma kayıtların değişmedi.');
      await onSaved();
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Değişiklikler kaydedilemedi. Taslağın korunuyor.');
    } finally { setSaving(false); }
  };

  return <View style={styles.overlay}>
    <Pressable accessibilityRole="button" accessibilityLabel="Paneli kapat" onPress={() => requestClose()} style={styles.scrim} />
    <View accessibilityViewIsModal style={[styles.sheet, { backgroundColor: theme.background, borderColor: theme.border }]}>
      <View style={styles.handle} />
      <View style={styles.header}>
        <View style={styles.flex}>
          <Text accessibilityRole="header" style={[styles.title, { color: theme.foreground }]}>{formatLocalDate(localDate, { weekday: 'long', day: 'numeric', month: 'long' })}</Text>
          <Text style={[styles.caption, { color: theme.muted }]}>Planlanan saat ve gün notu · fiilî çalışmadan ayrı</Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Gün panelini kapat" accessibilityState={{ disabled: saving }} disabled={saving} onPress={() => requestClose()} style={[styles.close, { borderColor: theme.border, backgroundColor: theme.surface, opacity: saving ? 0.5 : 1 }]}>
          <Ionicons name="close" size={20} color={theme.foreground} />
        </Pressable>
      </View>

      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent} keyboardShouldPersistTaps="handled">
        {cycle ? <>
          <View style={styles.fieldGroup}>
            <Text style={[styles.fieldLabel, { color: theme.foreground }]}>Planlanan saatler</Text>
            <View style={styles.timeRow}>
              <DateTimePickerField mode="time" label="Başlangıç" value={draft.startTime} timezone={timezone} localDate={localDate} onChange={(value) => changeTime('startTime', value)} onError={setError} />
              <DateTimePickerField mode="time" label="Bitiş" value={draft.endTime} timezone={timezone} localDate={localDate} onChange={(value) => changeTime('endTime', value)} onError={setError} />
            </View>
          </View>
        </> : <View style={[styles.noCycle, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Text style={[styles.caption, { color: theme.muted }]}>Bu gün için planlı saat kaydetmek üzere önce bir vardiya düzeni oluştur.</Text>
          <Pressable accessibilityRole="button" onPress={() => requestClose(onCreateCycle)} style={styles.linkButton}>
            <Text style={{ color: theme.accent, fontWeight: '800' }}>Vardiya düzeni oluştur</Text>
          </Pressable>
        </View>}

        <View style={styles.fieldGroup}>
          <Text style={[styles.fieldLabel, { color: theme.foreground }]}>Gün etiketi <Text style={{ color: theme.muted, fontWeight: '500' }}>(isteğe bağlı)</Text></Text>
          <View style={styles.choices}>
            {STATUS_OPTIONS.map((option) => {
              const selected = draft.status === option.value;
              const tint = option.value === 'NOT_WORKED' ? theme.danger : theme.warning;
              const surface = option.value === 'NOT_WORKED' ? theme.dangerSurface : theme.warningSurface;
              return <Pressable key={option.value} accessibilityRole="button" accessibilityLabel={option.label} accessibilityState={{ selected }} onPress={() => setDraft((current) => ({ ...current, status: selected ? null : option.value }))}
                style={[styles.statusChoice, { backgroundColor: selected ? surface : theme.surface, borderColor: selected ? tint : theme.border }]}>
                <Ionicons accessible={false} name={option.icon} size={17} color={selected ? tint : theme.muted} />
                <Text style={{ color: theme.foreground, fontWeight: '700' }}>{option.label}</Text>
              </Pressable>;
            })}
          </View>
        </View>

        <View style={styles.fieldGroup}>
          <Text style={[styles.fieldLabel, { color: theme.foreground }]}>Not <Text style={{ color: theme.muted, fontWeight: '500' }}>(isteğe bağlı)</Text></Text>
          <TextInput accessibilityLabel="Gün notu" value={draft.note} onChangeText={(note) => setDraft((current) => ({ ...current, note }))} maxLength={2000} multiline
            placeholder="Bu gün için not ekle" placeholderTextColor={theme.muted} textAlignVertical="top"
            style={[styles.note, { backgroundColor: theme.surface, borderColor: theme.border, color: theme.foreground }]} />
        </View>

        {cycle ? <View style={styles.fieldGroup}>
          <Pressable accessibilityRole="button" accessibilityState={{ expanded: advancedOpen }} onPress={() => setAdvancedOpen((open) => !open)} style={[styles.advancedToggle, { borderColor: theme.border, backgroundColor: theme.surface }]}>
            <View style={styles.flex}><Text style={{ color: theme.foreground, fontWeight: '800' }}>Gelişmiş vardiya planı</Text><Text style={[styles.caption, { color: theme.muted }]}>Döngü veya tek günlük şablon seçimi</Text></View>
            <Ionicons accessible={false} name={advancedOpen ? 'chevron-up' : 'chevron-down'} size={18} color={theme.muted} />
          </Pressable>
          {advancedOpen ? <View style={styles.advancedContent}>
            <View style={styles.choices}>
              <Choice label="Döngü planı" selected={draft.useCycle} onPress={() => setDraft((current) => ({ ...current, useCycle: true }))} />
              <Choice label="Tek günlük plan" selected={!draft.useCycle} onPress={() => setDraft((current) => ({ ...current, useCycle: false }))} />
            </View>
            {!draft.useCycle ? <>
              <Text style={[styles.caption, { color: theme.muted }]}>Bu seçim yalnızca seçilen günü değiştirir.</Text>
              <View style={styles.choices}>{(['SHIFT', 'OFF', 'LEAVE'] as const).map((kind) => <Choice key={kind} label={kind === 'SHIFT' ? 'Vardiya' : kind === 'OFF' ? 'Boş gün' : 'Planlı izin'} selected={draft.planKind === kind} onPress={() => setDraft((current) => ({ ...current, planKind: kind }))} />)}</View>
              {draft.planKind === 'SHIFT' ? <View style={styles.choices}>{templates.map((template) => <Choice key={template.id} label={`${template.name} · ${template.startLocalTime}–${template.endLocalTime}`} selected={draft.templateId === template.id} onPress={() => setDraft((current) => ({ ...current, templateId: template.id, startTime: template.startLocalTime, endTime: template.endLocalTime }))} />)}</View> : null}
            </> : <Text style={[styles.caption, { color: theme.muted }]}>Ana saat alanlarını değiştirirsen bu gün için tek günlük plan oluşturulur.</Text>}
          </View> : null}
        </View> : null}

        {records.length ? <View style={styles.fieldGroup}>
          <Text style={[styles.fieldLabel, { color: theme.foreground }]}>Fiilî çalışma kayıtları</Text>
          <Text style={[styles.caption, { color: theme.muted }]}>Bunlar planlı saatlerden ayrıdır.</Text>
          {records.map((item) => {
            const start = utcToLocalDateTime(item.record.startedAtUtc, item.record.timezone);
            const end = utcToLocalDateTime(item.record.endedAtUtc, item.record.timezone);
            const delta = getRecordRangeDifferenceMinutes(item.record);
            return <View key={item.record.id} style={[styles.record, { borderColor: theme.border, backgroundColor: theme.surface }]}>
              <View style={styles.flex}><Text style={{ color: theme.foreground, fontWeight: '800' }}>{start.slice(11)}–{end.slice(11)}{end.slice(0, 10) !== localDate ? ' · ertesi gün' : ''}</Text>
                <Text style={[styles.caption, { color: theme.muted }]}>{item.timedBreaks.length ? `${item.timedBreaks.length} zamanlı mola` : item.record.breakMinutes ? `${item.record.breakMinutes} dk · saati belirtilmemiş mola` : 'Mola yok'}{delta === null || delta === 0 ? '' : ` · ${delta > 0 ? '+' : '−'}${formatDuration(Math.abs(delta))}`}</Text></View>
              <Pressable accessibilityRole="button" accessibilityLabel="Fiilî çalışma kaydını düzenle" onPress={() => requestClose(() => onEditRecord(item.record.id))} style={styles.recordAction}><Text style={{ color: theme.accent, fontWeight: '800' }}>Fiilî kaydı düzenle</Text></Pressable>
            </View>;
          })}
        </View> : <Text style={[styles.caption, { color: theme.muted }]}>Bu tarih için tamamlanmış fiilî çalışma kaydı yok.</Text>}
        {error ? <Text accessibilityRole="alert" style={{ color: theme.danger }}>{error}</Text> : null}
        {notice ? <Text accessibilityLiveRegion="polite" style={{ color: theme.accent }}>{notice}</Text> : null}
      </ScrollView>

      <View style={[styles.footer, { borderTopColor: theme.border }]}>
        <Pressable accessibilityRole="button" disabled={saving} onPress={() => void save()} style={[styles.saveButton, { backgroundColor: theme.primaryAction, opacity: saving ? 0.6 : 1 }]}>
          <Text style={[styles.saveText, { color: theme.onPrimaryAction }]}>{saving ? 'Kaydediliyor…' : 'Değişiklikleri Kaydet'}</Text>
        </Pressable>
      </View>
    </View>
  </View>;
}

function Choice({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const { theme } = useAppTheme();
  return <Pressable accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress} style={[styles.choice, { backgroundColor: selected ? theme.accentSurface : theme.surface, borderColor: selected ? theme.accent : theme.border }]}>
    <Text style={{ color: theme.foreground, fontWeight: '700' }}>{label}</Text>
  </Pressable>;
}

const styles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFill, zIndex: 20, justifyContent: 'flex-end' },
  scrim: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(8, 15, 30, 0.48)' },
  sheet: { maxHeight: '90%', borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, paddingTop: 8, paddingBottom: 8 },
  handle: { width: 38, height: 4, borderRadius: 2, backgroundColor: '#8A93A2', opacity: 0.55, alignSelf: 'center', marginBottom: 10 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, paddingBottom: 12 },
  flex: { flex: 1, gap: 3 },
  title: { fontSize: 20, lineHeight: 26, fontWeight: '900', textTransform: 'capitalize' },
  caption: { fontSize: 12, lineHeight: 17 },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 14, borderWidth: 1 },
  body: { flexShrink: 1 },
  bodyContent: { paddingHorizontal: 18, paddingBottom: 14, gap: 16 },
  fieldGroup: { gap: 9 },
  fieldLabel: { fontSize: 14, fontWeight: '800' },
  timeRow: { flexDirection: 'row', gap: 10 },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  statusChoice: { minHeight: 44, borderWidth: 1, borderRadius: 14, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 7 },
  note: { minHeight: 86, maxHeight: 150, borderWidth: 1, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
  advancedToggle: { minHeight: 56, borderWidth: 1, borderRadius: 14, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', gap: 10 },
  advancedContent: { gap: 10, paddingTop: 10 },
  choice: { minHeight: 42, borderWidth: 1, borderRadius: 13, paddingHorizontal: 11, justifyContent: 'center' },
  record: { borderWidth: 1, borderRadius: 14, padding: 11, gap: 9 },
  recordAction: { alignSelf: 'flex-start', minHeight: 42, justifyContent: 'center' },
  noCycle: { borderWidth: 1, borderRadius: 14, padding: 12, gap: 8 },
  linkButton: { minHeight: 40, justifyContent: 'center', alignSelf: 'flex-start' },
  footer: { borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 18, paddingTop: 10, paddingBottom: 8 },
  saveButton: { minHeight: 50, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  saveText: { fontSize: 15, fontWeight: '900' },
});
