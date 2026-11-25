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
  appendShiftCycleVersion,
} from '@/src/data/shiftCycleRepository';
import { upsertSalaryEntry } from '@/src/data/salaryHistoryRepository';
import type { ShiftCycle, ShiftTemplate } from '@/src/domain/shift-cycle/index';
import { getLocalToday, mondayOfLocalDate } from '@/src/features/shifts/dates';
import { getSettings, updateSettings } from '@/src/data/settingsRepository';
import type { Settings, HourlyLeavePolicy } from '@/src/domain/payroll/types';
import { HOURLY_LEAVE_POLICY } from '@/src/domain/payroll/types';
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
import { BottomSheet } from '@/src/components/ui/BottomSheet';

type Theme = ReturnType<typeof useAppTheme>['theme'];

function Field({
  label, value, onChangeText, theme, placeholder, keyboardType = 'default', maxLength,
}: {
  label: string; value: string; onChangeText: (value: string) => void; theme: Theme;
  placeholder?: string; keyboardType?: 'default' | 'numbers-and-punctuation'; maxLength?: number;
}) {
  return (
    <View style={{ gap: 6, marginBottom: 4 }}>
      <Text style={{ fontFamily: fonts.bold, color: theme.muted, fontSize: layout.type.caption }}>{label}</Text>
      <TextInput
        accessibilityLabel={label} autoCapitalize="none" keyboardType={keyboardType} maxLength={maxLength}
        onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={theme.muted}
        style={[styles.input, { backgroundColor: theme.surface, borderColor: theme.border, color: theme.ink, fontFamily: fonts.medium }]} value={value}
      />
    </View>
  );
}

// iOS-style grouped section label
function GroupLabel({ title, theme }: { title: string; theme: Theme }) {
  return (
    <Text style={{ fontFamily: fonts.semiBold, fontSize: layout.type.caption, color: theme.muted, paddingHorizontal: 4, paddingTop: 8, paddingBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>
      {title}
    </Text>
  );
}

// iOS-style row: label left, value + chevron right
function SettingsRow({
  label, value, onPress, theme, first, last, destructive, rightElement,
}: {
  label: string; value?: string; onPress?: () => void; theme: Theme;
  first?: boolean; last?: boolean; destructive?: boolean;
  rightElement?: React.ReactNode;
}) {
  const topRadius = first ? layout.radius.card : 0;
  const bottomRadius = last ? layout.radius.card : 0;
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : 'none'}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        minHeight: 50,
        paddingHorizontal: 16,
        paddingVertical: 10,
        backgroundColor: pressed && onPress ? theme.surfaceMuted : theme.surface,
        borderTopLeftRadius: topRadius,
        borderTopRightRadius: topRadius,
        borderBottomLeftRadius: bottomRadius,
        borderBottomRightRadius: bottomRadius,
      })}
    >
      <Text style={{ fontFamily: fonts.regular, fontSize: layout.type.body, color: destructive ? theme.danger : theme.ink, flex: 1 }}>
        {label}
      </Text>
      {rightElement ? (
        rightElement
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          {value ? <Text style={{ fontFamily: fonts.regular, fontSize: layout.type.body, color: theme.muted }}>{value}</Text> : null}
          {onPress ? <Ionicons name="chevron-forward" size={16} color={theme.muted} /> : null}
        </View>
      )}
    </Pressable>
  );
}

// Separator between rows in a group
function RowSeparator({ theme }: { theme: Theme }) {
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: theme.border, marginLeft: 16 }} />;
}

function GroupCard({ children, theme }: { children: React.ReactNode; theme: Theme }) {
  return (
    <View style={{ borderRadius: layout.radius.card, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, borderColor: theme.border, backgroundColor: theme.surface }}>
      {children}
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
  MON_FRI: 'Pzt – Cum',
  MON_SAT: 'Pzt – Cmt',
  EVERY_DAY: 'Her gün',
};
const SHIFT_PATTERN_LABEL: Record<string, string> = {
  FIXED_DAY: 'Sabit gündüz', FIXED_NIGHT: 'Sabit gece',
  TWO_SHIFT: '2 vardiya', THREE_SHIFT: '3 vardiya',
};

type SheetName = 'salary' | 'hourlyLeave' | 'schedule' | 'raise' | null;

export default function SettingsScreen() {
  const database = useAppDatabase();
  const notifyDataReset = useNotifyDataReset();
  const router = useRouter();
  const { theme, mode, toggleMode } = useAppTheme();
  const [cycle, setCycle] = useState<ShiftCycle | null>(null);
  const [storedTemplates, setStoredTemplates] = useState<ShiftTemplate[]>([]);
  const [scheduleValue, setScheduleValue] = useState<ScheduleEditorValue | null>(null);
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [appSettings, setAppSettings] = useState<Settings | null>(null);
  const [salaryRaw, setSalaryRaw] = useState('');
  const [salaryTypeEdit, setSalaryTypeEdit] = useState<'GROSS' | 'NET'>('GROSS');
  const [paydayRaw, setPaydayRaw] = useState('');
  const [besEnabledEdit, setBesEnabledEdit] = useState(false);
  const [besRateBpRaw, setBesRateBpRaw] = useState('3');
  const [savingSalary, setSavingSalary] = useState(false);
  const [salaryError, setSalaryError] = useState<string | null>(null);
  const [startDateEdit, setStartDateEdit] = useState('');
  const [raiseDate, setRaiseDate] = useState('');
  const [raiseSalaryText, setRaiseSalaryText] = useState('');
  const [raiseError, setRaiseError] = useState<string | null>(null);
  const [savingRaise, setSavingRaise] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetConfirmText, setResetConfirmText] = useState('');
  const [openSheet, setOpenSheet] = useState<SheetName>(null);
  const loadedOnce = useRef(false);

  useEffect(() => { loadedOnce.current = false; }, [database]);

  const load = useCallback(async () => {
    setLoading(true);
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
    } finally {
      setLoading(false);
    }
  }, [database]);

  useFocusEffect(useCallback(() => {
    if (loadedOnce.current) return;
    loadedOnce.current = true;
    void load();
  }, [load]));

  const openSalarySheet = () => {
    if (!appSettings) return;
    setSalaryRaw(formatMoneyInput(String(Math.round(appSettings.salaryMinor / 100))));
    setSalaryTypeEdit(appSettings.salaryType);
    setPaydayRaw(appSettings.payday === 'LAST' ? '' : String(appSettings.payday));
    setBesEnabledEdit(appSettings.besEnabled);
    setBesRateBpRaw(String(appSettings.besRateBp / 100));
    setStartDateEdit(appSettings.startDate ?? '');
    setSalaryError(null);
    setOpenSheet('salary');
  };

  const saveSalary = async () => {
    let salaryMinor: number;
    try { salaryMinor = parseTryMinor(salaryRaw); } catch { setSalaryError('Maaş tutarı geçersiz.'); return; }
    const paydayNum = paydayRaw.trim() === '' ? undefined : Number(paydayRaw.trim());
    if (paydayRaw.trim() !== '' && (isNaN(paydayNum!) || paydayNum! < 1 || paydayNum! > 31)) {
      setSalaryError('Maaş günü 1–31 arasında olmalı veya boş bırakın.'); return;
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
      setOpenSheet(null);
    } catch (err) { setSalaryError(err instanceof Error ? err.message : 'Kaydedilemedi.'); }
    finally { setSavingSalary(false); }
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
        id: randomUUID(),
        name: 'Vardiya düzenim',
        timezone: 'Europe/Istanbul',
        anchorLocalDate: effectiveFrom,
        startIndex,
        entries,
      };
      await appendShiftCycleVersion(database, allTemplates, newCycle, effectiveFrom);
      await updateSettings(database, {
        workSchedule: scheduleValue.workSchedule,
        shiftPattern: scheduleValue.shiftPattern,
      });
      setCycle(newCycle);
      setStoredTemplates(allTemplates);
      const updated = await getSettings(database);
      setAppSettings(updated);
      setOpenSheet(null);
    } catch (err) { setScheduleError(err instanceof Error ? err.message : 'Kaydedilemedi.'); }
    finally { setSavingSchedule(false); }
  };

  const confirmReset = async () => {
    setShowResetModal(false);
    try {
      const { resetAllData, cleanupLocalArtifacts } = await import('@/src/data/resetRepository');
      await resetAllData(database);
      await cleanupLocalArtifacts();
      notifyDataReset();
      router.replace('/welcome');
    } catch (err) {
      Alert.alert('Sifirlaima basarisiz', err instanceof Error ? err.message : 'Veriler korundu.');
    }
  };

  return (
    <>
      <ScrollView
        contentContainerStyle={[styles.screen, { backgroundColor: theme.background }]}
        keyboardShouldPersistTaps="handled"
      >
        <PageHeading eyebrow="TERCİHLER" title="Ayarlar" subtitle="Vardiya düzenin ve ücret ayarların cihazında saklanır." />

        {/* Görünüm */}
        <GroupLabel title="Görünüm" theme={theme} />
        <GroupCard theme={theme}>
          <SettingsRow
            theme={theme}
            label="Karanlık Mod"
            first last
            rightElement={
              <Switch
                value={mode === 'dark'}
                onValueChange={() => void toggleMode()}
                trackColor={{ true: theme.accent, false: theme.border }}
              />
            }
          />
        </GroupCard>

        {/* Hızlı Erişim */}
        <GroupLabel title="Hızlı Erişim" theme={theme} />
        <GroupCard theme={theme}>
          <SettingsRow
            theme={theme}
            label="Ek gelirler"
            onPress={() => router.push('/additional-income' as never)}
            first last
          />
        </GroupCard>

        {/* Ücret */}
        <GroupLabel title="Ücret Bilgileri" theme={theme} />
        {loading ? (
          <GroupCard theme={theme}>
            <View style={{ padding: 16, alignItems: 'center' }}>
              <ActivityIndicator color={theme.ink} />
            </View>
          </GroupCard>
        ) : appSettings ? (
          <GroupCard theme={theme}>
            <SettingsRow
              theme={theme}
              label="Maaş"
              value={`${formatTryMinor(appSettings.salaryMinor)} (${appSettings.salaryType === 'GROSS' ? 'Brüt' : 'Net'})`}
              onPress={openSalarySheet}
              first
            />
            <RowSeparator theme={theme} />
            <SettingsRow
              theme={theme}
              label="Maaş günü"
              value={appSettings.payday === 'LAST' ? 'Ayın sonu' : `Ayın ${appSettings.payday}`}
              onPress={openSalarySheet}
            />
            <RowSeparator theme={theme} />
            <SettingsRow
              theme={theme}
              label="BES"
              value={appSettings.besEnabled ? `%${(appSettings.besRateBp / 100).toFixed(0)}` : 'Kapalı'}
              onPress={openSalarySheet}
            />
            {appSettings.startDate ? (
              <>
                <RowSeparator theme={theme} />
                <SettingsRow
                  theme={theme}
                  label="İşe başlama"
                  value={appSettings.startDate.split('-').reverse().join('.')}
                  onPress={openSalarySheet}
                  last
                />
              </>
            ) : (
              <RowSeparator theme={theme} />
            )}
            {!appSettings.startDate && (
              <SettingsRow
                theme={theme}
                label="İşe başlama tarihi ekle"
                onPress={openSalarySheet}
                last
              />
            )}
          </GroupCard>
        ) : null}

        {/* Zam */}
        {appSettings && (
          <>
            <GroupLabel title="" theme={theme} />
            <GroupCard theme={theme}>
              <SettingsRow
                theme={theme}
                label="Zam geldi"
                onPress={() => { setRaiseSalaryText(''); setRaiseDate(''); setRaiseError(null); setOpenSheet('raise'); }}
                first last
              />
            </GroupCard>
          </>
        )}

        {/* Saatlik izin */}
        {appSettings && (
          <>
            <GroupLabel title="Saatlik İzin Kuralı" theme={theme} />
            <GroupCard theme={theme}>
              <SettingsRow
                theme={theme}
                label={appSettings.hourlyLeavePolicy === HOURLY_LEAVE_POLICY.OVERTIME_FIRST ? 'Önce mesaiden düşülsün' : 'Maaşımdan kesilsin'}
                onPress={() => setOpenSheet('hourlyLeave')}
                first last
              />
            </GroupCard>
          </>
        )}

        {/* Vardiya */}
        <GroupLabel title="Vardiya Düzeni" theme={theme} />
        {loading ? (
          <GroupCard theme={theme}>
            <View style={{ padding: 16, alignItems: 'center' }}>
              <ActivityIndicator color={theme.ink} />
            </View>
          </GroupCard>
        ) : appSettings ? (
          <GroupCard theme={theme}>
            <SettingsRow
              theme={theme}
              label="Çalışma düzeni"
              value={WORK_SCHEDULE_LABEL[appSettings.workSchedule] ?? appSettings.workSchedule}
              onPress={() => setOpenSheet('schedule')}
              first
            />
            <RowSeparator theme={theme} />
            <SettingsRow
              theme={theme}
              label="Vardiya tipi"
              value={SHIFT_PATTERN_LABEL[appSettings.shiftPattern] ?? appSettings.shiftPattern}
              onPress={() => setOpenSheet('schedule')}
            />
            <RowSeparator theme={theme} />
            <SettingsRow
              theme={theme}
              label="Vardiya değişikliği"
              onPress={() => router.push('/shift-change' as never)}
              last
            />
          </GroupCard>
        ) : null}

        {/* Veri */}
        <GroupLabel title="Veri" theme={theme} />
        <GroupCard theme={theme}>
          <SettingsRow
            theme={theme}
            label="Yedekleme ve geri yükleme"
            onPress={() => router.push('/backup' as never)}
            first last
          />
        </GroupCard>

        {/* Yasal */}
        <GroupLabel title="Yasal" theme={theme} />
        <GroupCard theme={theme}>
          <SettingsRow
            theme={theme}
            label="KVKK Aydınlatma Metni"
            onPress={() => router.push('/legal/kvkk' as never)}
            first
          />
          <RowSeparator theme={theme} />
          <SettingsRow
            theme={theme}
            label="Gizlilik Politikası"
            onPress={() => router.push('/legal/privacy' as never)}
            last
          />
        </GroupCard>

        {/* Sıfırla */}
        <GroupLabel title="" theme={theme} />
        <GroupCard theme={theme}>
          <SettingsRow
            theme={theme}
            label="Tüm verileri sıfırla"
            onPress={() => { setResetConfirmText(''); setShowResetModal(true); }}
            destructive
            first last
          />
        </GroupCard>
        <View style={{ height: 16 }} />
      </ScrollView>

      {/* Salary BottomSheet */}
      <BottomSheet visible={openSheet === 'salary'} onClose={() => setOpenSheet(null)}>
        <Text style={{ fontFamily: fonts.extraBold, fontSize: layout.type.section, color: theme.ink, marginBottom: 12 }}>
          Ücret Bilgileri
        </Text>
        <MoneyField label="Maaş" value={salaryRaw} onChangeText={setSalaryRaw} placeholder="Örn. 25.000" />
        <Text style={{ fontFamily: fonts.bold, color: theme.muted, fontSize: layout.type.caption, marginBottom: 6 }}>Maaş türü</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
          {(['GROSS', 'NET'] as const).map((type) => (
            <ChoiceChip key={type} label={type === 'GROSS' ? 'Brüt' : 'Net'} selected={salaryTypeEdit === type} onPress={() => setSalaryTypeEdit(type)} />
          ))}
        </View>
        <Field label="Maaş günü (1–31, boş = ayın sonu)" value={paydayRaw} onChangeText={setPaydayRaw} theme={theme} placeholder="Boş = ayın sonu" keyboardType="numbers-and-punctuation" maxLength={2} />
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginVertical: 8 }}>
          <Text style={{ fontFamily: fonts.bold, color: theme.muted, fontSize: layout.type.caption }}>BES aktif</Text>
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
        {salaryError ? <Text accessibilityRole="alert" style={{ fontFamily: fonts.bold, color: theme.danger, fontSize: layout.type.caption, marginTop: 4 }}>{salaryError}</Text> : null}
        <View style={{ gap: 10, marginTop: 12 }}>
          <ActionButton label={savingSalary ? 'Kaydediliyor…' : 'Kaydet'} onPress={() => void saveSalary()} disabled={savingSalary} />
          <ActionButton label="Vazgeç" onPress={() => setOpenSheet(null)} variant="secondary" disabled={savingSalary} />
        </View>
      </BottomSheet>

      {/* Hourly leave policy BottomSheet */}
      {appSettings && (
        <BottomSheet visible={openSheet === 'hourlyLeave'} onClose={() => setOpenSheet(null)}>
          <Text style={{ fontFamily: fonts.extraBold, fontSize: layout.type.section, color: theme.ink, marginBottom: 12 }}>
            Saatlik İzin Kuralı
          </Text>
          {[
            {
              value: HOURLY_LEAVE_POLICY.BASE_PAY as HourlyLeavePolicy,
              title: 'Maaşımdan kesilsin',
              description: 'Mesain etkilenmez, izin saatin maaşından kesilir.',
            },
            {
              value: HOURLY_LEAVE_POLICY.OVERTIME_FIRST as HourlyLeavePolicy,
              title: 'Önce mesaimden düşülsün',
              description: 'Mesain varsa izin saatin oradan düşülür, yetmezse maaşından kesilir.',
            },
          ].map((opt) => {
            const selected = appSettings.hourlyLeavePolicy === opt.value;
            return (
              <Pressable
                key={opt.value}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                accessibilityLabel={opt.title}
                onPress={() => {
                  void updateSettings(database, { hourlyLeavePolicy: opt.value }).then(() =>
                    getSettings(database).then((s) => { setAppSettings(s); setOpenSheet(null); }),
                  );
                }}
                style={{
                  flexDirection: 'row',
                  alignItems: 'flex-start',
                  gap: 10,
                  borderRadius: 12,
                  padding: 12,
                  minHeight: 44,
                  marginBottom: 8,
                  borderWidth: selected ? 2 : StyleSheet.hairlineWidth,
                  borderColor: selected ? theme.ink : theme.border,
                  backgroundColor: selected ? theme.surfaceMuted : theme.surface,
                }}
              >
                <Ionicons name={selected ? 'radio-button-on' : 'radio-button-off'} size={20} color={selected ? theme.ink : theme.muted} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: fonts.semiBold, color: theme.ink, fontSize: layout.type.body }}>{opt.title}</Text>
                  <Text style={{ color: theme.muted, fontSize: layout.type.caption, marginTop: 2 }}>{opt.description}</Text>
                </View>
              </Pressable>
            );
          })}
        </BottomSheet>
      )}

      {/* Schedule BottomSheet */}
      <BottomSheet visible={openSheet === 'schedule'} onClose={() => {
        if (appSettings && scheduleValue) {
          setScheduleValue(scheduleValueFromSettings(appSettings, storedTemplates, cycle));
        }
        setScheduleError(null);
        setOpenSheet(null);
      }}>
        <Text style={{ fontFamily: fonts.extraBold, fontSize: layout.type.section, color: theme.ink, marginBottom: 12 }}>
          Vardiya Düzeni
        </Text>
        {scheduleValue ? (
          <>
            <ScheduleEditor value={scheduleValue} onChange={setScheduleValue} />
            {scheduleError ? <Text accessibilityRole="alert" style={{ fontFamily: fonts.bold, color: theme.danger, fontSize: layout.type.caption, marginTop: 4 }}>{scheduleError}</Text> : null}
            <View style={{ gap: 10, marginTop: 12 }}>
              <ActionButton label={savingSchedule ? 'Kaydediliyor…' : 'Kaydet'} onPress={() => void saveSchedule()} disabled={savingSchedule} />
              <ActionButton label="Vazgeç" onPress={() => {
                if (appSettings && scheduleValue) {
                  setScheduleValue(scheduleValueFromSettings(appSettings, storedTemplates, cycle));
                }
                setScheduleError(null);
                setOpenSheet(null);
              }} variant="secondary" disabled={savingSchedule} />
            </View>
          </>
        ) : null}
      </BottomSheet>

      {/* Raise BottomSheet */}
      <BottomSheet visible={openSheet === 'raise'} onClose={() => setOpenSheet(null)}>
        <Text style={{ fontFamily: fonts.extraBold, fontSize: layout.type.section, color: theme.ink, marginBottom: 12 }}>
          Zam Geldi
        </Text>
        <MoneyField label="Yeni maaş" value={raiseSalaryText} onChangeText={setRaiseSalaryText} placeholder="Örn. 30.000" />
        <DateTimePickerField
          mode="date"
          label="Geçerlilik tarihi"
          value={raiseDate}
          timezone="Europe/Istanbul"
          maximumDate={new Date(new Date().getFullYear() + 1, 11, 31)}
          onChange={setRaiseDate}
          onError={setRaiseError}
        />
        {raiseError ? <Text accessibilityRole="alert" style={{ fontFamily: fonts.bold, color: theme.danger, fontSize: layout.type.caption, marginTop: 4 }}>{raiseError}</Text> : null}
        <View style={{ gap: 10, marginTop: 12 }}>
          <ActionButton
            label={savingRaise ? 'Kaydediliyor…' : 'Kaydet'}
            disabled={savingRaise}
            onPress={async () => {
              let salaryMinor: number;
              try { salaryMinor = parseTryMinor(raiseSalaryText); } catch { setRaiseError('Maaş tutarı geçersiz.'); return; }
              if (!raiseDate) { setRaiseError('Geçerlilik tarihi gerekli.'); return; }
              setSavingRaise(true); setRaiseError(null);
              try {
                await upsertSalaryEntry(database, {
                  id: randomUUID(),
                  effectiveFrom: raiseDate,
                  salaryMinor,
                  createdAt: new Date().toISOString(),
                });
                setOpenSheet(null);
              } catch (err) { setRaiseError(err instanceof Error ? err.message : 'Kaydedilemedi.'); }
              finally { setSavingRaise(false); }
            }}
          />
          <ActionButton label="Vazgeç" onPress={() => setOpenSheet(null)} variant="secondary" disabled={savingRaise} />
        </View>
      </BottomSheet>

      {/* Reset confirmation modal */}
      <Modal animationType="fade" transparent visible={showResetModal} onRequestClose={() => setShowResetModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalBackdrop}>
          <View style={[styles.modalSheet, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Text style={[styles.modalTitle, { color: theme.ink }]}>Tüm verileri sil</Text>
            <Text style={{ fontFamily: fonts.regular, fontSize: layout.type.body, color: theme.muted, lineHeight: 22 }}>
              Bu işlem geri alınamaz. Onaylamak için aşağıya{' '}
              <Text style={{ fontFamily: fonts.extraBold, color: theme.danger }}>SIFIRLA</Text>
              {' '}yazın.
            </Text>
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
              accessibilityLabel="Sifirlamayi onayla"
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
  screen: { flexGrow: 1, paddingHorizontal: 16, paddingTop: 24, paddingBottom: 32, gap: 4 },
  input: { minHeight: 48, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, fontSize: layout.type.body },
  dangerButton: { borderWidth: 1.5, borderRadius: 14, paddingVertical: 14, alignItems: 'center', minHeight: 48 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end', padding: 16 },
  modalSheet: { borderWidth: 1, borderRadius: 24, padding: 24, gap: 16 },
  modalTitle: { fontFamily: fonts.extraBold, fontSize: layout.type.heading },
  modalCancel: { alignItems: 'center', minHeight: 44, justifyContent: 'center' },
});
