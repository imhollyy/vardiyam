import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';

import { useAppDatabase } from '@/src/data/AppDatabaseProvider';
import { getDayEntry, upsertDayEntry, deleteDayEntry } from '@/src/data/dayEntryRepository';
import { getSettings } from '@/src/data/settingsRepository';
import { listShiftTemplates, listShiftCycles } from '@/src/data/shiftCycleRepository';
import { resolvePlannedTemplates, enumerateDays } from '@/src/domain/payroll/index';
import type { LeaveType, HourlyLeavePolicy } from '@/src/domain/payroll/types';
import { HOURLY_LEAVE_POLICY } from '@/src/domain/payroll/types';
import { buildDayEntryPatch, buildSaveSummary, leaveDefaultDeducted, type QuickMode } from '@/src/features/dayEdit/buildDayEntryPatch';
import { HOURLY_RATE_DIVISOR } from '@/src/config/payroll';
import { getCoachmarkDismissed, saveCoachmarkDismissed } from '@/src/data/appPreferencesRepository';
import type { ShiftTemplate } from '@/src/domain/shift-cycle/index';
import { useAppTheme } from '@/src/theme/AppThemeProvider';
import { fonts, layout, shiftPalette } from '@/src/theme/tokens';
import { Card } from '@/src/components/ui/Card';
import { Stepper } from '@/src/components/ui/Stepper';
import { ActionButton } from '@/src/components/ui/ActionButton';
import { ChoiceGroup } from '@/src/components/ui/ChoiceChip';

// --- Leave type config ----------------------------------------------------------

const PRIMARY_LEAVE: { value: LeaveType; label: string }[] = [
  { value: 'ANNUAL', label: 'Yıllık' },
  { value: 'SICK', label: 'Raporlu' },
  { value: 'UNPAID', label: 'Ücretsiz' },
];

const OTHER_LEAVE: { value: LeaveType; label: string }[] = [
  { value: 'EXCUSE', label: 'Mazeret' },
  { value: 'MATERNITY', label: 'Doğum' },
  { value: 'BEREAVEMENT', label: 'Ölüm' },
  { value: 'SOCIAL', label: 'Sosyal' },
  { value: 'HOURLY', label: 'Saatlik' },
];

const OTHER_LEAVE_CODES = new Set<LeaveType>(['EXCUSE', 'MATERNITY', 'BEREAVEMENT', 'SOCIAL', 'HOURLY']);

// --- Helpers -------------------------------------------------------------------

function formatDisplayDate(localDate: string): string {
  const [, m, d] = localDate.split('-');
  const months = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
  return `${Number(d)} ${months[Number(m) - 1] ?? ''}`;
}

// --- Chip component ----------------------------------------------------------

function Chip({ label, selected, onPress, theme }: {
  label: string;
  selected: boolean;
  onPress: () => void;
  theme: ReturnType<typeof useAppTheme>['theme'];
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={{ paddingHorizontal: 14, paddingVertical: 8, minHeight: 44, borderRadius: layout.radius.control, borderWidth: selected ? 0 : 1, borderColor: theme.border, backgroundColor: selected ? theme.ink : theme.surface, alignItems: 'center', justifyContent: 'center' }}
    >
      <Text style={{ fontFamily: fonts.semiBold, fontSize: layout.type.caption, color: selected ? theme.onInk : theme.ink }}>
        {label}
      </Text>
    </Pressable>
  );
}

// --- Main screen ---------------------------------------------------------------

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

  const [leaveOtherExpanded, setLeaveOtherExpanded] = useState(false);
  const [otherSectionOpen, setOtherSectionOpen] = useState(false);
  const [overtimeDiger, setOvertimeDiger] = useState(false);
  const [lateEarlyDiger, setLateEarlyDiger] = useState(false);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [templates, setTemplates] = useState<ShiftTemplate[]>([]);
  const [plannedTemplateId, setPlannedTemplateId] = useState<string | null>(null);

  const [hourlyLeavePolicy, setHourlyLeavePolicy] = useState<HourlyLeavePolicy>(HOURLY_LEAVE_POLICY.BASE_PAY);
  const [salaryMinorForRate, setSalaryMinorForRate] = useState(0);
  const [dayEditCoachmark, setDayEditCoachmark] = useState(false);
  const coachmarkTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (coachmarkTimer.current) clearTimeout(coachmarkTimer.current);
    };
  }, []);

  useEffect(() => {
    if (!localDate) return;
    void (async () => {
      const dismissed = await getCoachmarkDismissed(database, 'coachmark_dayedit_v1');
      if (!dismissed) {
        setDayEditCoachmark(true);
        coachmarkTimer.current = setTimeout(() => {
          setDayEditCoachmark(false);
          void saveCoachmarkDismissed(database, 'coachmark_dayedit_v1');
        }, 3000);
      }
    })();
  }, [database, localDate]);

  useEffect(() => {
    if (!localDate) return;
    let active = true;
    void (async () => {
      const [entry, tmpl, cycles, settings] = await Promise.all([
        getDayEntry(database, localDate),
        listShiftTemplates(database),
        listShiftCycles(database),
        getSettings(database),
      ]);
      if (active) {
        setHourlyLeavePolicy(settings.hourlyLeavePolicy);
        setSalaryMinorForRate(settings.salaryMinor);
      }
      if (!active) return;
      setTemplates(tmpl);
      const entryMap = entry ? new Map([[localDate, entry]]) : new Map<string, typeof entry>();
      const planned = resolvePlannedTemplates(enumerateDays(localDate, localDate), cycles, tmpl, entryMap as Map<string, NonNullable<typeof entry>>);
      setPlannedTemplateId(planned.get(localDate) ?? null);

      if (entry) {
        setIsDirty(true);

        // Always load these
        setNote(entry.note ?? '');
        setShiftOverrideId(entry.shiftOverrideId);

        if (entry.overtimeMinutes > 0) {
          const h = entry.overtimeMinutes / 60;
          setOvertimeHours(h);
          setQuickMode('overtime');
          if (![1, 2, 3].includes(h)) setOvertimeDiger(true);
        } else if (entry.lateEarlyMinutes > 0) {
          const h = entry.lateEarlyMinutes / 60;
          setLateEarlyHours(h);
          setQuickMode('lateEarly');
          if (![0.5, 1, 2].includes(h)) setLateEarlyDiger(true);
        } else if (entry.leaveType) {
          setLeaveType(entry.leaveType);
          setLeaveHalfDay(entry.leaveHalfDay);
          setLeaveHourly(entry.leaveHours ?? 0);
          setLeaveDeducted(entry.deductOverride ?? leaveDefaultDeducted(entry.leaveType));
          setQuickMode('leave');
          if (OTHER_LEAVE_CODES.has(entry.leaveType)) setLeaveOtherExpanded(true);
        }

        if (entry.shiftOverrideId || entry.note) setOtherSectionOpen(true);
        if (entry.leaveType && (entry.leaveHalfDay || entry.deductOverride !== null)) setOtherSectionOpen(true);
      }
    })();
    return () => { active = false; };
  }, [database, localDate]);

  // --- Save/undo ----------------------------------------------------------------

  const handleSave = useCallback(async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const patch = buildDayEntryPatch({ quickMode, overtimeHours, lateEarlyHours, leaveType, leaveHalfDay, leaveHourly, leaveDeducted, shiftOverrideId, note });
      if (patch === null) {
        await deleteDayEntry(database, localDate);
      } else {
        await upsertDayEntry(database, localDate, patch);
      }
      router.back();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Kaydedilemedi.');
      setSaving(false);
    }
  }, [database, localDate, quickMode, overtimeHours, lateEarlyHours, leaveType, leaveHalfDay, leaveHourly, leaveDeducted, shiftOverrideId, note, router]);

  const handleReset = useCallback(() => {
    setQuickMode(null); setOvertimeHours(0); setLateEarlyHours(0);
    setLeaveType(null); setLeaveHalfDay(false); setLeaveHourly(0); setLeaveDeducted(false);
    setShiftOverrideId(null); setNote('');
    setLeaveOtherExpanded(false); setOvertimeDiger(false); setLateEarlyDiger(false);
    setIsDirty(false);
  }, []);

  // --- Leave selection ---------------------------------------------------------

  const selectLeave = useCallback((type: LeaveType) => {
    const doSelect = () => {
      setOvertimeHours(0); setLateEarlyHours(0);
      setLeaveType(type); setLeaveDeducted(leaveDefaultDeducted(type));
      setQuickMode('leave'); setOvertimeDiger(false); setLateEarlyDiger(false);
    };
    if (overtimeHours > 0 || lateEarlyHours > 0) {
      const h = overtimeHours > 0 ? overtimeHours : lateEarlyHours;
      const kind = overtimeHours > 0 ? 'mesaisi' : 'gec/erkeni';
      Alert.alert('Izin eklenecek', `Bu gunun +${h} sa ${kind} silinecek.`, [
        { text: 'Iptal', style: 'cancel' },
        { text: 'Devam', onPress: doSelect },
      ]);
    } else { doSelect(); }
  }, [overtimeHours, lateEarlyHours]);

  const deselectLeave = useCallback(() => {
    setLeaveType(null); setLeaveHalfDay(false); setLeaveHourly(0); setLeaveDeducted(false);
    setLeaveOtherExpanded(false); setQuickMode(null);
  }, []);

  // --- Derived -----------------------------------------------------------------

  const isLeaveActive = quickMode === 'leave' && leaveType !== null;
  const isFullDayLeave = isLeaveActive && leaveType !== 'HOURLY';
  const isLeaveOtherType = leaveType !== null && OTHER_LEAVE_CODES.has(leaveType);
  const leaveIsDeductedByDefault = leaveType ? leaveDefaultDeducted(leaveType) : false;

  const saveSummary = buildSaveSummary({ quickMode, overtimeHours, lateEarlyHours, leaveType, leaveHalfDay, leaveHourly, leaveDeducted, shiftOverrideId, note });

  const plannedTemplate = plannedTemplateId ? templates.find((t) => t.id === plannedTemplateId) : null;
  const headerPalette = shiftPalette.day[mode];

  const otActivePre = quickMode === 'overtime' && [1, 2, 3].includes(overtimeHours) ? overtimeHours : null;
  const otDigerActive = quickMode === 'overtime' && otActivePre === null;
  const leActivePre = quickMode === 'lateEarly' && [0.5, 1, 2].includes(lateEarlyHours) ? lateEarlyHours : null;
  const leDigerActive = quickMode === 'lateEarly' && leActivePre === null;

  if (!localDate) return null;

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: theme.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Handle */}
      <View style={styles.handle} accessibilityElementsHidden>
        <View style={[styles.handleBar, { backgroundColor: theme.border }]} />
      </View>

      {/* Header */}
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

      {/* Day-edit coachmark banner — shown once, auto-dismisses in 3s */}
      {dayEditCoachmark && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Kapat ipucu"
          onPress={() => {
            if (coachmarkTimer.current) { clearTimeout(coachmarkTimer.current); coachmarkTimer.current = null; }
            setDayEditCoachmark(false);
            void saveCoachmarkDismissed(database, 'coachmark_dayedit_v1');
          }}
          style={{ backgroundColor: theme.accent, paddingHorizontal: layout.screen.horizontal, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 8 }}
        >
          <Ionicons name="information-circle-outline" size={16} color={theme.onInk} accessible={false} />
          <Text style={{ flex: 1, fontFamily: fonts.semiBold, fontSize: layout.type.caption, color: theme.onInk }}>
            İzin veya mesai eklemek için bir satıra dokun
          </Text>
        </Pressable>
      )}

      <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">

        {/* Row 1 — Mesai yaptım */}
        <Card style={{ opacity: isFullDayLeave ? 0.4 : 1 }}>
          <Text style={[styles.rowLabel, { color: theme.ink }]}>Mesai yaptım</Text>
          <View style={styles.chipRow}>
            {([{ v: 1, l: '+1 sa' }, { v: 2, l: '+2 sa' }, { v: 3, l: '+3 sa' }] as const).map(({ v, l }) => (
              <Chip
                key={l}
                label={l}
                selected={quickMode === 'overtime' && overtimeHours === v}
                theme={theme}
                onPress={() => {
                  if (isFullDayLeave) return;
                  if (quickMode === 'overtime' && overtimeHours === v) {
                    setQuickMode(null); setOvertimeHours(0);
                  } else {
                    setLeaveType(null); setLeaveHalfDay(false); setLeaveHourly(0); setLeaveDeducted(false);
                    setOvertimeHours(v); setQuickMode('overtime'); setOvertimeDiger(false);
                  }
                }}
              />
            ))}
            <Chip
              label="Diğer"
              selected={otDigerActive}
              theme={theme}
              onPress={() => {
                if (isFullDayLeave) return;
                if (otDigerActive) {
                  setQuickMode(null); setOvertimeHours(0); setOvertimeDiger(false);
                } else {
                  setLeaveType(null); setLeaveHalfDay(false); setLeaveHourly(0); setLeaveDeducted(false);
                  setQuickMode('overtime'); setOvertimeDiger(true);
                  if (overtimeHours === 0 || [1, 2, 3].includes(overtimeHours)) setOvertimeHours(4);
                }
              }}
            />
          </View>
          {(overtimeDiger || otDigerActive) && quickMode === 'overtime' && (
            <Stepper value={overtimeHours} onValueChange={setOvertimeHours} min={0} max={12} step={0.5} />
          )}
        </Card>

        {/* Row 2 — İzinliydim */}
        <Card>
          <Text style={[styles.rowLabel, { color: theme.ink }]}>İzinliydim</Text>
          <View style={styles.chipRow}>
            {PRIMARY_LEAVE.map(({ value, label }) => (
              <Chip
                key={value}
                label={label}
                selected={quickMode === 'leave' && leaveType === value}
                theme={theme}
                onPress={() => {
                  if (quickMode === 'leave' && leaveType === value) {
                    deselectLeave();
                  } else {
                    selectLeave(value);
                    setLeaveOtherExpanded(false);
                  }
                }}
              />
            ))}
            <Chip
              label="Diğer"
              selected={isLeaveOtherType}
              theme={theme}
              onPress={() => {
                if (isLeaveOtherType) {
                  deselectLeave();
                } else {
                  setLeaveOtherExpanded((v) => !v);
                }
              }}
            />
          </View>
          {(leaveOtherExpanded || isLeaveOtherType) && (
            <View style={styles.chipRow}>
              {OTHER_LEAVE.map(({ value, label }) => (
                <Chip
                  key={value}
                  label={label}
                  selected={quickMode === 'leave' && leaveType === value}
                  theme={theme}
                  onPress={() => {
                    if (quickMode === 'leave' && leaveType === value) {
                      deselectLeave();
                    } else {
                      selectLeave(value);
                    }
                  }}
                />
              ))}
            </View>
          )}
          {isLeaveActive && leaveType !== 'HOURLY' && (
            <Text style={{ fontFamily: fonts.semiBold, fontSize: layout.type.caption, color: theme.muted }}>
              {leaveIsDeductedByDefault ? 'Maaştan kesilir' : 'Maaştan kesilmez'}
            </Text>
          )}
          {isLeaveActive && leaveType === 'HOURLY' && (
            <Text style={{ fontFamily: fonts.semiBold, fontSize: layout.type.caption, color: theme.muted }}>
              {hourlyLeavePolicy === HOURLY_LEAVE_POLICY.OVERTIME_FIRST
                ? 'Önce bu maaştaki mesainden düşülür.'
                : (() => {
                  if (leaveHourly > 0 && salaryMinorForRate > 0) {
                    const rate = Math.round(salaryMinorForRate / HOURLY_RATE_DIVISOR);
                    const amt = (rate * leaveHourly / 100).toFixed(2).replace('.', ',');
                    return `Maaşından kesilir · ≈ −${amt} ₺`;
                  }
                  return 'Maaşından kesilir.';
                })()}
            </Text>
          )}
          {quickMode === 'leave' && leaveType === 'HOURLY' && (
            <Stepper value={leaveHourly} onValueChange={setLeaveHourly} min={0} max={8} step={0.5} />
          )}
        </Card>

        {/* Row 3 — Geç/erken */}
        <Card style={{ opacity: isFullDayLeave ? 0.4 : 1 }}>
          <Text style={[styles.rowLabel, { color: theme.ink }]}>Geç geldim / erken çıktım</Text>
          <View style={styles.chipRow}>
            {([{ v: 0.5, l: '+0,5 sa' }, { v: 1, l: '+1 sa' }, { v: 2, l: '+2 sa' }] as const).map(({ v, l }) => (
              <Chip
                key={l}
                label={l}
                selected={quickMode === 'lateEarly' && lateEarlyHours === v}
                theme={theme}
                onPress={() => {
                  if (isFullDayLeave) return;
                  if (quickMode === 'lateEarly' && lateEarlyHours === v) {
                    setQuickMode(null); setLateEarlyHours(0);
                  } else {
                    setLeaveType(null); setLeaveHalfDay(false); setLeaveHourly(0); setLeaveDeducted(false);
                    setLateEarlyHours(v); setQuickMode('lateEarly'); setLateEarlyDiger(false);
                  }
                }}
              />
            ))}
            <Chip
              label="Diğer"
              selected={leDigerActive}
              theme={theme}
              onPress={() => {
                if (isFullDayLeave) return;
                if (leDigerActive) {
                  setQuickMode(null); setLateEarlyHours(0); setLateEarlyDiger(false);
                } else {
                  setLeaveType(null); setLeaveHalfDay(false); setLeaveHourly(0); setLeaveDeducted(false);
                  setQuickMode('lateEarly'); setLateEarlyDiger(true);
                  if (lateEarlyHours === 0 || [0.5, 1, 2].includes(lateEarlyHours)) setLateEarlyHours(3);
                }
              }}
            />
          </View>
          {(lateEarlyDiger || leDigerActive) && quickMode === 'lateEarly' && (
            <Stepper value={lateEarlyHours} onValueChange={setLateEarlyHours} min={0} max={8} step={0.5} />
          )}
        </Card>

        {/* Diğer seçenekler (collapsible) */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={otherSectionOpen ? 'Diğer seçenekleri gizle' : 'Diğer seçenekler'}
          accessibilityState={{ expanded: otherSectionOpen }}
          onPress={() => setOtherSectionOpen((v) => !v)}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 }}
        >
          <Ionicons name={otherSectionOpen ? 'chevron-up' : 'chevron-down'} size={16} color={theme.muted} />
          <Text style={{ fontFamily: fonts.semiBold, fontSize: layout.type.body, color: theme.muted }}>
            Diğer seçenekler
          </Text>
        </Pressable>

        {otherSectionOpen && (
          <>
            {/* Shift override */}
            {templates.length > 0 && (
              <Card>
                <Text style={[styles.rowLabel, { color: theme.ink }]}>Vardiya farklıydı</Text>
                <ChoiceGroup
                  options={templates.map((t) => ({ value: t.id, label: `${t.name}  ${t.startLocalTime} – ${t.endLocalTime}` }))}
                  selected={shiftOverrideId ?? ''}
                  onSelect={(v) => setShiftOverrideId(v === shiftOverrideId ? null : v)}
                />
              </Card>
            )}

            {/* Half day — only for non-HOURLY leave */}
            {isLeaveActive && leaveType !== 'HOURLY' && (
              <Card>
                <Text style={[styles.rowLabel, { color: theme.ink }]}>İzin süresi</Text>
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
              </Card>
            )}

            {/* Deduct override — only when default is non-deducted */}
            {isLeaveActive && !leaveIsDeductedByDefault && (
              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked: leaveDeducted }}
                onPress={() => setLeaveDeducted((v) => !v)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44, paddingHorizontal: 4 }}
              >
                <View style={{ width: 22, height: 22, borderWidth: 2, borderRadius: 6, alignItems: 'center', justifyContent: 'center', borderColor: leaveDeducted ? theme.ink : theme.border, backgroundColor: leaveDeducted ? theme.ink : 'transparent' }}>
                  {leaveDeducted && <Ionicons name="checkmark" size={14} color={theme.onInk} />}
                </View>
                <Text style={{ fontFamily: fonts.semiBold, color: theme.ink, fontSize: layout.type.body }}>Maaştan kesilsin</Text>
              </Pressable>
            )}

            {/* Note */}
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
          </>
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
        <View style={{ flex: 1, gap: 4 }}>
          {saveSummary ? (
            <Text style={{ fontFamily: fonts.medium, fontSize: layout.type.caption, color: theme.muted, textAlign: 'center' }}>
              {saveSummary}
            </Text>
          ) : null}
          {saveError ? (
            <Text accessibilityRole="alert" style={{ fontFamily: fonts.medium, fontSize: layout.type.caption, color: theme.danger, textAlign: 'center' }}>
              {saveError}
            </Text>
          ) : null}
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
  rowLabel: { fontFamily: fonts.bold, fontSize: layout.type.body },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  footer: { flexDirection: 'row', gap: 12, paddingHorizontal: layout.screen.horizontal, paddingBottom: layout.screen.bottom, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth },
  resetButton: { width: 48, height: layout.control.minHeight, borderWidth: 1.5, borderRadius: layout.radius.control, alignItems: 'center', justifyContent: 'center' },
  noteInput: { borderWidth: 1, borderRadius: layout.radius.input, paddingHorizontal: 14, paddingVertical: 12, fontSize: layout.type.body, minHeight: 80, textAlignVertical: 'top' },
});
