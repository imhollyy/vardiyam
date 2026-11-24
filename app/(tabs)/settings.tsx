import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect, useRouter } from 'expo-router';
import { randomUUID } from 'expo-crypto';
import { useAppDatabase, useNotifyDataReset } from '@/src/data/AppDatabaseProvider';
import { ChoiceChip } from '@/src/components/ui/ChoiceChip';

import {
  listShiftCycles,
  listShiftTemplates,
  saveShiftSchedule,
} from '@/src/data/shiftCycleRepository';
import type { ShiftCycle, ShiftTemplate } from '@/src/domain/shift-cycle/index';
import { getLocalToday, mondayOfLocalDate } from '@/src/features/shifts/dates';
import { getSettings, updateSettings } from '@/src/data/settingsRepository';
import type { Settings } from '@/src/domain/payroll/types';
import { formatMoneyInput, formatTryMinor, parseTryMinor } from '@/src/domain/money';
import { MoneyField } from '@/src/components/ui/MoneyField';
import { fonts, layout } from '@/src/theme/tokens';
import { useAppTheme } from '@/src/theme/AppThemeProvider';
import { PageHeading } from '@/src/components/ui/PageHeading';
import { DateTimePickerField } from '@/src/components/ui/DateTimePickerField';
import { ActionButton } from '@/src/components/ui/ActionButton';
import { DEFAULT_SHIFT_HOURS, shiftNominalMinutes } from '@/src/config/shifts';
import {
  ScheduleEditor,
  type ScheduleEditorValue,
  type ScheduleEditorTemplateDraft,
  isScheduleValueValid,
} from '@/src/components/schedule/ScheduleEditor';
import { planTemplateChanges, resolveTemplateIds } from '@/src/features/schedule/planTemplateChanges';
import { buildCycleEntries, needsCurrentShiftStep } from '@/src/features/setup/buildSetupPayload';

type Theme = ReturnType<typeof useAppTheme>['theme'];

function Field({
  label, value, onChangeText, theme, placeholder, keyboardType = 'default', maxLength,
}: {
  label: string; value: string; onChangeText: (value: string) => void; theme: Theme;
  placeholder?: string; keyboardType?: 'default' | 'numbers-and-punctuation'; maxLength?: number;
}) {
  return (
    <View style={styles.field}>
      <Text style={[styles.fieldLabel, { color: theme.muted }]}>{label}</Text>
      <TextInput
        accessibilityLabel={label} autoCapitalize="none" keyboardType={keyboardType} maxLength={maxLength}
        onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={theme.muted}
        style={[styles.input, { backgroundColor: theme.surface, borderColor: theme.border, color: theme.ink, fontFamily: fonts.medium }]} value={value}
      />
    </View>
  );
}

function SectionHeading({ icon, title, theme }: { icon: React.ComponentProps<typeof Ionicons>['name']; title: string; theme: Theme }) {
  return (
    <View style={styles.sectionHeading}>
      <View style={[styles.sectionIcon, { backgroundColor: theme.surfaceMuted }]}>
        <Ionicons name={icon} size={18} color={theme.ink} />
      </View>
      <Text style={[styles.sectionTitle, { color: theme.ink }]}>{title}</Text>
    </View>
  );
}

function scheduleValueFromSettings(
  settings: Settings,
  storedTemplates: ShiftTemplate[],
  cycle: ShiftCycle | null,
): ScheduleEditorValue {
  const defaults = DEFAULT_SHIFT_HOURS[settings.workSchedule][settings.shiftPattern];
  let templateDrafts: ScheduleEditorTemplateDraft[];
  if (cycle && storedTemplates.length > 0) {
    const seen = new Set<string>();
    const orderedIds: string[] = [];
    for (const entry of cycle.entries) {
      if (entry.kind === 'SHIFT' && !seen.has(entry.templateId)) {
        seen.add(entry.templateId);
        orderedIds.push(entry.templateId);
      }
    }
    const ordered = orderedIds
      .map((id) => storedTemplates.find((t) => t.id === id))
      .filter((t): t is ShiftTemplate => t !== undefined);
    templateDrafts = ordered.map((t) => ({
      code: t.code, name: t.name, startLocalTime: t.startLocalTime,
      endLocalTime: t.endLocalTime, breakMinutes: t.breakMinutes,
    }));
    while (templateDrafts.length < defaults.length) {
      templateDrafts.push({ ...defaults[templateDrafts.length]! });
    }
  } else {
    templateDrafts = defaults.map((d) => ({ ...d }));
  }
  return {
    workSchedule: settings.workSchedule,
    shiftPattern: settings.shiftPattern,
    templateDrafts,
    currentShiftIndex: 0,
  };
}

const WORK_SCHEDULE_LABEL: Record<string, string> = {
  MON_FRI: 'Pazartesi – Cuma',
  MON_SAT: 'Pazartesi – Cumartesi',
  EVERY_DAY: 'Her gün',
};
const SHIFT_PATTERN_LABEL: Record<string, string> = {
  FIXED_DAY: 'Sabit gündüz', FIXED_NIGHT: 'Sabit gece',
  TWO_SHIFT: '2 vardiya', THREE_SHIFT: '3 vardiya',
};

export default function SettingsScreen() {
  const database = useAppDatabase();
  const notifyDataReset = useNotifyDataReset();
  const router = useRouter();
  const { theme, mode, toggleMode } = useAppTheme();
  const [cycle, setCycle] = useState<ShiftCycle | null>(null);
  const [storedTemplates, setStoredTemplates] = useState<ShiftTemplate[]>([]);
  const [scheduleValue, setScheduleValue] = useState<ScheduleEditorValue | null>(null);
  const [editingSchedule, setEditingSchedule] = useState(false);
  const [loading, setLoading] = useState(true);
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [scheduleSuccess, setScheduleSuccess] = useState<string | null>(null);
  const [appSettings, setAppSettings] = useState<Settings | null>(null);
  const [editingSalary, setEditingSalary] = useState(false);
  const [salaryRaw, setSalaryRaw] = useState('');
  const [salaryTypeEdit, setSalaryTypeEdit] = useState<'GROSS' | 'NET'>('GROSS');
  const [paydayRaw, setPaydayRaw] = useState('');
  const [besEnabledEdit, setBesEnabledEdit] = useState(false);
  const [besRateBpRaw, setBesRateBpRaw] = useState('3');
  const [savingSalary, setSavingSalary] = useState(false);
  const [salaryError, setSalaryError] = useState<string | null>(null);
  const [salarySuccess, setSalarySuccess] = useState<string | null>(null);
  const [startDateEdit, setStartDateEdit] = useState('');
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetConfirmText, setResetConfirmText] = useState('');
  const loadedOnce = useRef(false);

  useEffect(() => { loadedOnce.current = false; }, [database]);

  const load = useCallback(async () => {
    setLoading(true);
    setScheduleError(null);
    try {
      const [cycles, templates, settings] = await Promise.all([
        listShiftCycles(database),
        listShiftTemplates(database),
        getSettings(database),
      ]);
      const active = cycles[0] ?? null;
      setCycle(active);
      setStoredTemplates(templates);
      setAppSettings(settings);
      setScheduleValue(scheduleValueFromSettings(settings, templates, active));
    } catch {
      setScheduleError('Ayarlar yüklenemedi. Tekrar deneyin.');
    } finally {
      setLoading(false);
    }
  }, [database]);

  useFocusEffect(useCallback(() => {
    if (loadedOnce.current) return;
    loadedOnce.current = true;
    void load();
  }, [load]));

  const startSalaryEdit = () => {
    if (!appSettings) return;
    setSalaryRaw(formatMoneyInput(String(Math.round(appSettings.salaryMinor / 100))));
    setSalaryTypeEdit(appSettings.salaryType);
    setPaydayRaw(appSettings.payday === 'LAST' ? '' : String(appSettings.payday));
    setBesEnabledEdit(appSettings.besEnabled);
    setBesRateBpRaw(String(appSettings.besRateBp / 100));
    setStartDateEdit(appSettings.startDate ?? '');
    setEditingSalary(true);
    setSalaryError(null);
  };

  const cancelSalaryEdit = () => { setEditingSalary(false); setSalaryError(null); };

  const saveSalaryEdit = async () => {
    let salaryMinor: number;
    try { salaryMinor = parseTryMinor(salaryRaw); } catch { setSalaryError('Maaş tutarı geçersiz.'); return; }
    const paydayNum = paydayRaw.trim() === '' ? undefined : Number(paydayRaw.trim());
    if (paydayRaw.trim() !== '' && (isNaN(paydayNum!) || paydayNum! < 1 || paydayNum! > 31)) {
      setSalaryError('Maaş günü 1–31 arasında olmalı veya boş bırakın (ayın sonu).'); return;
    }
    const payday = (paydayRaw.trim() === '' ? 'LAST' : String(paydayNum!)) as Settings['payday'];
    const besRateBp = Math.round(Number(besRateBpRaw) * 100);
    if (besEnabledEdit && (isNaN(besRateBp) || besRateBp < 100 || besRateBp > 2500)) {
      setSalaryError('BES oranı %1–%25 arasında olmalı.'); return;
    }
    setSavingSalary(true); setSalaryError(null);
    try {
      await updateSettings(database, {
        salaryMinor, salaryType: salaryTypeEdit, payday,
        besEnabled: besEnabledEdit,
        besRateBp: besEnabledEdit ? besRateBp : appSettings?.besRateBp ?? 300,
        startDate: startDateEdit || null,
      });
      const updated = await getSettings(database);
      setAppSettings(updated);
      setEditingSalary(false);
      setSalarySuccess('Ücret bilgileri güncellendi.');
    } catch (err) { setSalaryError(err instanceof Error ? err.message : 'Kaydedilemedi.'); }
    finally { setSavingSalary(false); }
  };

  const startScheduleEdit = () => {
    setScheduleError(null);
    setScheduleSuccess(null);
    setEditingSchedule(true);
  };

  const cancelScheduleEdit = () => {
    if (appSettings && scheduleValue) {
      setScheduleValue(scheduleValueFromSettings(appSettings, storedTemplates, cycle));
    }
    setEditingSchedule(false);
    setScheduleError(null);
  };

  const confirmCancelScheduleEdit = () => {
    Alert.alert('Düzenlemeyi bırak?', 'Kaydedilmemiş değişiklikler kaybolacak.',
      [{ text: 'Düzenlemeye dön', style: 'cancel' }, { text: 'Vazgeç', style: 'destructive', onPress: cancelScheduleEdit }]);
  };

  const saveSchedule = async () => {
    if (!scheduleValue) return;
    if (!isScheduleValueValid(scheduleValue)) { setScheduleError('Vardiya saatlerini kontrol edin.'); return; }
    setSavingSchedule(true); setScheduleError(null);
    try {
      const today = getLocalToday('Europe/Istanbul');
      const effectiveFrom = mondayOfLocalDate(today);
      const result = planTemplateChanges(scheduleValue.templateDrafts, storedTemplates);
      const newTemplates = result.create.map((d) => ({
        id: randomUUID(), code: d.code, name: d.name,
        startLocalTime: d.startLocalTime, endLocalTime: d.endLocalTime,
        breakMinutes: d.breakMinutes,
        standardMinutes: shiftNominalMinutes(d.startLocalTime, d.endLocalTime),
      }));
      const allTemplates = [...result.reuse, ...newTemplates];
      const templateIds = resolveTemplateIds(scheduleValue.templateDrafts, result, newTemplates);
      const entries = buildCycleEntries(scheduleValue.workSchedule, scheduleValue.shiftPattern, templateIds);
      const phaseCount = scheduleValue.shiftPattern === 'THREE_SHIFT' ? 3 : 2;
      const startIndex = needsCurrentShiftStep(scheduleValue.shiftPattern)
        ? Math.round((scheduleValue.currentShiftIndex * entries.length) / phaseCount) % entries.length
        : 0;
      const newCycle = {
        id: cycle?.id ?? randomUUID(),
        name: 'Vardiya düzenim',
        timezone: 'Europe/Istanbul',
        anchorLocalDate: effectiveFrom,
        startIndex,
        entries,
      };
      await saveShiftSchedule(database, allTemplates, newCycle, effectiveFrom);
      await updateSettings(database, {
        workSchedule: scheduleValue.workSchedule,
        shiftPattern: scheduleValue.shiftPattern,
      });
      setCycle(newCycle);
      setStoredTemplates(allTemplates);
      setEditingSchedule(false);
      setScheduleSuccess('Vardiya düzeni kaydedildi.');
    } catch (err) { setScheduleError(err instanceof Error ? err.message : 'Kaydedilemedi.'); }
    finally { setSavingSchedule(false); }
  };

  const handleReset = () => { setResetConfirmText(''); setShowResetModal(true); };

  const confirmReset = async () => {
    setShowResetModal(false);
    try {
      const { resetAllData, cleanupLocalArtifacts } = await import('@/src/data/resetRepository');
      await resetAllData(database);
      await cleanupLocalArtifacts();
      notifyDataReset();
      router.replace('/welcome');
    } catch (err) {
      Alert.alert('Sıfırlama başarısız', err instanceof Error ? err.message : 'Veriler korundu.');
    }
  };

  return (
    <>
      <ScrollView
        contentContainerStyle={[styles.screen, { backgroundColor: theme.background }]}
        keyboardShouldPersistTaps="handled"
      >
        <PageHeading eyebrow="TERCİHLER" title="Ayarlar" subtitle="Vardiya düzenin ve ücret ayarların cihazında saklanır." />

        {/* Quick actions */}
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <SectionHeading icon="color-palette-outline" title="Görünüm ve hızlı erişim" theme={theme} />
          <ActionButton label={mode === 'dark' ? 'Açık temaya geç' : 'Koyu temaya geç'} onPress={() => void toggleMode()} variant="secondary" />
          <ActionButton label="Ek gelirler" onPress={() => router.push('/additional-income' as never)} variant="secondary" />
        </View>

        {/* Payroll summary / edit */}
        {appSettings && (
          <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <SectionHeading icon="wallet-outline" title="Ücret bilgileri" theme={theme} />
            {editingSalary ? (
              <>
                <MoneyField label="Maaş" value={salaryRaw} onChangeText={setSalaryRaw} placeholder="Örn. 25.000" />
                <Text style={[styles.fieldLabel, { color: theme.muted }]}>Maaş türü</Text>
                <View style={styles.chipWrap}>
                  {(['GROSS', 'NET'] as const).map((type) => (
                    <ChoiceChip key={type} label={type === 'GROSS' ? 'Brüt' : 'Net'} selected={salaryTypeEdit === type} onPress={() => setSalaryTypeEdit(type)} />
                  ))}
                </View>
                <Field label="Maaş günü (1–31, boş = ayın sonu)" value={paydayRaw} onChangeText={setPaydayRaw} theme={theme} placeholder="Boş = ayın sonu" keyboardType="numbers-and-punctuation" maxLength={2} />
                <View style={styles.infoRow}>
                  <Text style={[styles.fieldLabel, { color: theme.muted }]}>BES aktif</Text>
                  <Switch value={besEnabledEdit} onValueChange={setBesEnabledEdit} trackColor={{ true: theme.accent }} />
                </View>
                {besEnabledEdit && (
                  <Field label="BES oranı (%)" value={besRateBpRaw} onChangeText={setBesRateBpRaw} theme={theme} placeholder="Örn. 3" keyboardType="numbers-and-punctuation" maxLength={4} />
                )}
                <DateTimePickerField
                  mode="date"
                  label="İşe başlama tarihi"
                  value={startDateEdit}
                  timezone="Europe/Istanbul"
                  maximumDate={new Date()}
                  onChange={setStartDateEdit}
                  onError={setSalaryError}
                />
                {salaryError ? <Text accessibilityRole="alert" style={[styles.error, { color: theme.danger }]}>{salaryError}</Text> : null}
                <View style={styles.actionRow}>
                  <ActionButton label={savingSalary ? 'Kaydediliyor…' : 'Kaydet'} onPress={() => void saveSalaryEdit()} disabled={savingSalary} />
                  <ActionButton label="Vazgeç" onPress={cancelSalaryEdit} variant="secondary" disabled={savingSalary} />
                </View>
              </>
            ) : (
              <>
                <View style={styles.infoRow}>
                  <Text style={{ color: theme.muted }}>Maaş</Text>
                  <Text style={{ fontFamily: fonts.bold, color: theme.ink }}>{formatTryMinor(appSettings.salaryMinor)} ({appSettings.salaryType === 'GROSS' ? 'Brüt' : 'Net'})</Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={{ color: theme.muted }}>Maaş günü</Text>
                  <Text style={{ fontFamily: fonts.bold, color: theme.ink }}>{appSettings.payday === 'LAST' ? 'Ayın sonu' : `Ayın ${appSettings.payday}`}</Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={{ color: theme.muted }}>BES</Text>
                  <Text style={{ fontFamily: fonts.bold, color: theme.ink }}>{appSettings.besEnabled ? `%${(appSettings.besRateBp / 100).toFixed(0)}` : 'Kapalı'}</Text>
                </View>
                {appSettings.startDate ? (
                  <View style={styles.infoRow}>
                    <Text style={{ color: theme.muted }}>İşe başlama</Text>
                    <Text style={{ fontFamily: fonts.bold, color: theme.ink }}>{appSettings.startDate.split('-').reverse().join('.')}</Text>
                  </View>
                ) : null}
                {salarySuccess ? <Text accessibilityLiveRegion="polite" style={[styles.success, { color: theme.accent }]}>{salarySuccess}</Text> : null}
                <ActionButton label="Ücret bilgilerini düzenle" onPress={startSalaryEdit} variant="secondary" />
              </>
            )}
          </View>
        )}

        {/* Shift schedule */}
        {loading ? (
          <View accessibilityLiveRegion="polite" style={styles.statusRow}>
            <ActivityIndicator color={theme.ink} />
            <Text style={{ color: theme.muted }}>Vardiya düzeni yükleniyor…</Text>
          </View>
        ) : (
          <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <SectionHeading icon="repeat-outline" title="Vardiya düzeni" theme={theme} />
            {!editingSchedule ? (
              <>
                {appSettings && (
                  <>
                    <View style={styles.infoRow}>
                      <Text style={{ color: theme.muted }}>Çalışma düzeni</Text>
                      <Text style={{ fontFamily: fonts.bold, color: theme.ink }}>{WORK_SCHEDULE_LABEL[appSettings.workSchedule] ?? appSettings.workSchedule}</Text>
                    </View>
                    <View style={styles.infoRow}>
                      <Text style={{ color: theme.muted }}>Vardiya</Text>
                      <Text style={{ fontFamily: fonts.bold, color: theme.ink }}>{SHIFT_PATTERN_LABEL[appSettings.shiftPattern] ?? appSettings.shiftPattern}</Text>
                    </View>
                    {scheduleValue?.templateDrafts.map((td, i) => (
                      <View key={i} style={styles.infoRow}>
                        <Text style={{ color: theme.muted }}>{td.name}</Text>
                        <Text style={{ fontFamily: fonts.bold, color: theme.ink }}>{td.startLocalTime} – {td.endLocalTime}</Text>
                      </View>
                    ))}
                  </>
                )}
                {scheduleSuccess ? <Text accessibilityLiveRegion="polite" style={[styles.success, { color: theme.accent }]}>{scheduleSuccess}</Text> : null}
                <ActionButton label="Vardiya düzenini düzenle" onPress={startScheduleEdit} variant="secondary" />
                <ActionButton label="Vardiya değişikliği" onPress={() => router.push('/shift-change' as never)} variant="secondary" />
              </>
            ) : scheduleValue ? (
              <>
                <ScheduleEditor value={scheduleValue} onChange={setScheduleValue} />
                {scheduleError ? <Text accessibilityRole="alert" style={[styles.error, { color: theme.danger }]}>{scheduleError}</Text> : null}
                <View style={styles.actionRow}>
                  <ActionButton label={savingSchedule ? 'Kaydediliyor…' : 'Kaydet'} onPress={() => void saveSchedule()} disabled={savingSchedule} />
                  <ActionButton label="Vazgeç" onPress={confirmCancelScheduleEdit} variant="secondary" disabled={savingSchedule} />
                </View>
              </>
            ) : null}
          </View>
        )}

        {/* Data */}
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <SectionHeading icon="shield-checkmark-outline" title="Veri güvenliği" theme={theme} />
          <ActionButton label="Yedekleme ve geri yükleme" onPress={() => router.push('/backup' as never)} />
        </View>

        {/* Legal */}
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <SectionHeading icon="document-text-outline" title="Yasal" theme={theme} />
          <ActionButton label="KVKK Aydınlatma Metni" onPress={() => router.push('/legal/kvkk' as never)} variant="secondary" />
          <ActionButton label="Gizlilik Politikası" onPress={() => router.push('/legal/privacy' as never)} variant="secondary" />
        </View>

        {/* Reset */}
        <View style={[styles.card, { backgroundColor: theme.dangerSurface, borderColor: theme.danger }]}>
          <SectionHeading icon="trash-outline" title="Sıfırla" theme={theme} />
          <Text style={[styles.body, { color: theme.ink }]}>Tüm verilerini sil ve uygulamayı baştan kur.</Text>
          <Pressable
            accessibilityRole="button"
            onPress={handleReset}
            style={[styles.dangerButton, { borderColor: theme.danger }]}
          >
            <Text style={{ color: theme.danger, fontFamily: fonts.bold, fontSize: layout.type.body }}>SIFIRLA</Text>
          </Pressable>
        </View>
      </ScrollView>

      <Modal animationType="fade" transparent visible={showResetModal} onRequestClose={() => setShowResetModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalBackdrop}>
          <View style={[styles.modalSheet, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Text style={[styles.modalTitle, { color: theme.ink }]}>Tüm verileri sil</Text>
            <Text style={[styles.body, { color: theme.muted }]}>Bu işlem geri alınamaz. Onaylamak için aşağıya{' '}
              <Text style={{ fontFamily: fonts.extraBold, color: theme.danger }}>SIFIRLA</Text>
              {' '}yazın.</Text>
            <TextInput
              accessibilityLabel="Onay metni"
              autoCapitalize="characters"
              autoCorrect={false}
              onChangeText={setResetConfirmText}
              placeholder="SIFIRLA"
              placeholderTextColor={theme.muted}
              style={[styles.input, { backgroundColor: theme.background, borderColor: resetConfirmText === 'SIFIRLA' ? theme.danger : theme.border, color: theme.ink }]}
              value={resetConfirmText}
            />
            <Pressable
              accessibilityLabel="Sıfırlamayı onayla"
              accessibilityRole="button"
              disabled={resetConfirmText !== 'SIFIRLA'}
              onPress={() => void confirmReset()}
              style={[styles.dangerButton, { borderColor: theme.danger, opacity: resetConfirmText === 'SIFIRLA' ? 1 : 0.35 }]}
            >
              <Text style={{ color: theme.danger, fontFamily: fonts.bold, fontSize: layout.type.body }}>Onayla ve sıfırla</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={() => setShowResetModal(false)} style={styles.modalCancel}>
              <Text style={{ color: theme.muted, fontSize: layout.type.body }}>İptal</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flexGrow: 1, paddingHorizontal: 20, paddingTop: 24, paddingBottom: 32, gap: 16 },
  card: { borderWidth: 1, borderRadius: 20, padding: 16, gap: 14 },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  sectionIcon: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  sectionTitle: { fontFamily: fonts.extraBold, fontSize: layout.type.section, flexShrink: 1 },
  body: { fontFamily: fonts.regular, fontSize: layout.type.body, lineHeight: 22 },
  field: { gap: 6 },
  fieldLabel: { fontFamily: fonts.bold, marginTop: 2, fontSize: layout.type.caption },
  input: { minHeight: 48, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, fontSize: layout.type.body },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  actionRow: { gap: 10 },
  statusRow: { minHeight: 100, alignItems: 'center', justifyContent: 'center', gap: 12 },
  error: { fontFamily: fonts.bold, fontSize: layout.type.caption, lineHeight: 20 },
  success: { fontFamily: fonts.bold, fontSize: layout.type.caption, lineHeight: 20 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  dangerButton: { borderWidth: 1.5, borderRadius: 14, paddingVertical: 14, alignItems: 'center', minHeight: 48 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end', padding: 16 },
  modalSheet: { borderWidth: 1, borderRadius: 24, padding: 24, gap: 16 },
  modalTitle: { fontFamily: fonts.extraBold, fontSize: layout.type.heading },
  modalCancel: { alignItems: 'center', minHeight: 44, justifyContent: 'center' },
});
