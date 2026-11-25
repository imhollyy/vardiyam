import { useState, useCallback } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import type { WorkSchedule, ShiftPattern } from '@/src/domain/payroll/types';
import { DEFAULT_SHIFT_HOURS, shiftNominalMinutes, legalMinBreakMinutes } from '@/src/config/shifts';
import { Card, CardHeader } from '@/src/components/ui/Card';
import { ChoiceGroup } from '@/src/components/ui/ChoiceChip';
import { useAppTheme } from '@/src/theme/AppThemeProvider';
import { fonts, layout } from '@/src/theme/tokens';

export type ScheduleEditorTemplateDraft = {
  code: string;
  name: string;
  startLocalTime: string;
  endLocalTime: string;
  breakMinutes: number;
};

export type ScheduleEditorValue = {
  workSchedule: WorkSchedule;
  shiftPattern: ShiftPattern;
  templateDrafts: ScheduleEditorTemplateDraft[];
  currentShiftIndex: number;
};

export function defaultScheduleEditorDrafts(ws: WorkSchedule, sp: ShiftPattern): ScheduleEditorTemplateDraft[] {
  return DEFAULT_SHIFT_HOURS[ws][sp].map((h) => ({ ...h }));
}

export function isScheduleValueValid(value: ScheduleEditorValue): boolean {
  return value.templateDrafts.every(
    (td) => isValidTime(td.startLocalTime) && isValidTime(td.endLocalTime) && td.startLocalTime !== td.endLocalTime,
  );
}

function isValidTime(t: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(t);
}

function formatNetMinutes(net: number): string {
  const h = Math.floor(net / 60);
  const m = net % 60;
  return m === 0 ? `${h} sa` : `${h} sa ${m} dk`;
}

type Props = {
  value: ScheduleEditorValue;
  onChange: (v: ScheduleEditorValue) => void;
  showCurrentShift?: boolean;
};

const WORK_SCHEDULE_OPTIONS: { value: WorkSchedule; label: string }[] = [
  { value: 'MON_FRI', label: 'Pzt–Cum' },
  { value: 'MON_SAT', label: 'Pzt–Cmt' },
  { value: 'EVERY_DAY', label: 'Her gün' },
];

const SHIFT_PATTERN_OPTIONS: {
  value: ShiftPattern;
  label: string;
  hint: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
}[] = [
  { value: 'FIXED_DAY', label: 'Sabit gündüz', hint: 'Hep gündüz', icon: 'sunny-outline' },
  { value: 'FIXED_NIGHT', label: 'Sabit gece', hint: 'Hep gece', icon: 'moon-outline' },
  { value: 'TWO_SHIFT', label: '2 vardiya', hint: 'Dönüşümlü', icon: 'swap-vertical-outline' },
  { value: 'THREE_SHIFT', label: '3 vardiya', hint: 'Tam döngü', icon: 'repeat-outline' },
];

const BREAK_OPTIONS: { label: string; value: number }[] = [
  { label: '15 dk', value: 15 },
  { label: '30 dk', value: 30 },
  { label: '45 dk', value: 45 },
  { label: '60 dk', value: 60 },
  { label: '90 dk', value: 90 },
];

export function ScheduleEditor({ value, onChange, showCurrentShift = true }: Props) {
  const { theme } = useAppTheme();
  const [expanded, setExpanded] = useState(false);

  const setWorkSchedule = useCallback(
    (ws: WorkSchedule) => {
      const drafts = DEFAULT_SHIFT_HOURS[ws][value.shiftPattern].map((h) => ({ ...h }));
      onChange({ ...value, workSchedule: ws, templateDrafts: drafts, currentShiftIndex: 0 });
      setExpanded(false);
    },
    [value, onChange],
  );

  const setShiftPattern = useCallback(
    (sp: ShiftPattern) => {
      const drafts = DEFAULT_SHIFT_HOURS[value.workSchedule][sp].map((h) => ({ ...h }));
      onChange({ ...value, shiftPattern: sp, templateDrafts: drafts, currentShiftIndex: 0 });
      setExpanded(false);
    },
    [value, onChange],
  );

  const updateTime = useCallback(
    (index: number, field: 'startLocalTime' | 'endLocalTime', v: string) => {
      const updated = [...value.templateDrafts];
      const tpl = { ...updated[index]! };
      (tpl as Record<string, unknown>)[field] = v;
      if (
        isValidTime(tpl.startLocalTime) &&
        isValidTime(tpl.endLocalTime) &&
        tpl.startLocalTime !== tpl.endLocalTime
      ) {
        const nominal = shiftNominalMinutes(tpl.startLocalTime, tpl.endLocalTime);
        const legalMin = legalMinBreakMinutes(nominal);
        if (tpl.breakMinutes < legalMin) tpl.breakMinutes = legalMin;
      }
      updated[index] = tpl;
      onChange({ ...value, templateDrafts: updated });
    },
    [value, onChange],
  );

  const updateBreak = useCallback(
    (index: number, v: number) => {
      const updated = [...value.templateDrafts];
      updated[index] = { ...updated[index]!, breakMinutes: v };
      onChange({ ...value, templateDrafts: updated });
    },
    [value, onChange],
  );

  const isMultiShift = value.shiftPattern === 'TWO_SHIFT' || value.shiftPattern === 'THREE_SHIFT';

  return (
    <View style={styles.container}>
      {/* Work schedule segmented control */}
      <Card>
        <CardHeader icon="calendar-outline" title="Çalışma düzeni" />
        <View style={styles.scheduleRow}>
          {WORK_SCHEDULE_OPTIONS.map((opt) => {
            const sel = value.workSchedule === opt.value;
            return (
              <Pressable
                key={opt.value}
                accessibilityRole="button"
                accessibilityState={{ selected: sel }}
                accessibilityLabel={opt.label}
                onPress={() => setWorkSchedule(opt.value)}
                style={[
                  styles.segmentBtn,
                  {
                    backgroundColor: sel ? theme.inverse : theme.surface,
                    borderColor: sel ? theme.inverse : theme.border,
                    flex: 1,
                  },
                ]}
              >
                <Text
                  style={{
                    fontFamily: sel ? fonts.bold : fonts.regular,
                    fontSize: 13,
                    color: sel ? theme.onInverse : theme.ink,
                    textAlign: 'center',
                  }}
                >
                  {opt.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </Card>

      {/* Shift pattern 2×2 grid */}
      <Card>
        <CardHeader icon="git-compare-outline" title="Vardiya düzeni" />
        <View style={styles.patternGrid}>
          {SHIFT_PATTERN_OPTIONS.map((opt) => {
            const sel = value.shiftPattern === opt.value;
            return (
              <Pressable
                key={opt.value}
                accessibilityRole="button"
                accessibilityState={{ selected: sel }}
                accessibilityLabel={`${opt.label}: ${opt.hint}`}
                onPress={() => setShiftPattern(opt.value)}
                style={[
                  styles.patternCard,
                  {
                    backgroundColor: sel ? theme.surfaceMuted : theme.surface,
                    borderColor: sel ? theme.ink : theme.border,
                    borderWidth: sel ? 2 : 1,
                  },
                ]}
              >
                <Ionicons accessible={false} name={opt.icon} size={22} color={sel ? theme.ink : theme.muted} />
                <Text
                  style={{
                    fontFamily: fonts.bold,
                    fontSize: layout.type.body,
                    color: theme.ink,
                    textAlign: 'center',
                  }}
                >
                  {opt.label}
                </Text>
                <Text
                  style={{ fontSize: layout.type.caption, color: theme.muted, textAlign: 'center' }}
                >
                  {opt.hint}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </Card>

      {/* Hours summary / expand */}
      <Card>
        <CardHeader icon="time-outline" title="Vardiya saatleri" />
        {!expanded ? (
          <>
            {value.templateDrafts.map((td, i) => {
              const net =
                isValidTime(td.startLocalTime) &&
                isValidTime(td.endLocalTime) &&
                td.startLocalTime !== td.endLocalTime
                  ? shiftNominalMinutes(td.startLocalTime, td.endLocalTime) - td.breakMinutes
                  : null;
              return (
                <View key={i} style={styles.summaryRow}>
                  <Text style={{ color: theme.muted, fontSize: layout.type.body }}>{td.name}</Text>
                  <Text style={{ fontFamily: fonts.semiBold, color: theme.ink, fontSize: layout.type.body }}>
                    {td.startLocalTime} – {td.endLocalTime}
                    {net !== null ? `, ${formatNetMinutes(net)} net` : ''}
                  </Text>
                </View>
              );
            })}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Saatlerim farklı — düzenle"
              onPress={() => setExpanded(true)}
              style={[styles.expandBtn, { borderColor: theme.border }]}
            >
              <Ionicons name="create-outline" size={16} color={theme.muted} />
              <Text style={{ color: theme.muted, fontSize: layout.type.body }}>Saatlerim farklı</Text>
            </Pressable>
          </>
        ) : (
          <>
            {value.templateDrafts.map((td, i) => {
              const nominal =
                isValidTime(td.startLocalTime) &&
                isValidTime(td.endLocalTime) &&
                td.startLocalTime !== td.endLocalTime
                  ? shiftNominalMinutes(td.startLocalTime, td.endLocalTime)
                  : null;
              const net = nominal !== null ? nominal - td.breakMinutes : null;
              const legalMin = nominal !== null ? legalMinBreakMinutes(nominal) : 0;
              return (
                <View
                  key={i}
                  style={[
                    styles.templateSection,
                    {
                      borderTopColor: theme.border,
                      borderTopWidth: i === 0 ? 0 : StyleSheet.hairlineWidth,
                    },
                  ]}
                >
                  <Text
                    style={{
                      fontFamily: fonts.bold,
                      color: theme.ink,
                      fontSize: layout.type.body,
                      marginBottom: 8,
                    }}
                  >
                    {td.name}
                  </Text>
                  <View style={styles.timeRow}>
                    <TextInput
                      style={[
                        styles.timeInput,
                        { color: theme.ink, borderColor: theme.border, backgroundColor: theme.surface },
                      ]}
                      value={td.startLocalTime}
                      onChangeText={(v) => updateTime(i, 'startLocalTime', v)}
                      placeholder="HH:MM"
                      placeholderTextColor={theme.muted}
                      keyboardType="number-pad"
                      accessibilityLabel={`${td.name} başlangıç saati`}
                      maxLength={5}
                    />
                    <Ionicons name="arrow-forward" size={16} color={theme.muted} />
                    <TextInput
                      style={[
                        styles.timeInput,
                        { color: theme.ink, borderColor: theme.border, backgroundColor: theme.surface },
                      ]}
                      value={td.endLocalTime}
                      onChangeText={(v) => updateTime(i, 'endLocalTime', v)}
                      placeholder="HH:MM"
                      placeholderTextColor={theme.muted}
                      keyboardType="number-pad"
                      accessibilityLabel={`${td.name} bitiş saati`}
                      maxLength={5}
                    />
                  </View>
                  <View style={[styles.breakRow, { borderTopColor: theme.border }]}>
                    <Text
                      style={{
                        fontFamily: fonts.semiBold,
                        color: theme.muted,
                        fontSize: layout.type.caption,
                      }}
                    >
                      Mola
                    </Text>
                    <View style={styles.breakOptions}>
                      {BREAK_OPTIONS.map((opt) => (
                        <Pressable
                          key={opt.value}
                          accessibilityRole="button"
                          accessibilityLabel={`Mola ${opt.label}`}
                          onPress={() => updateBreak(i, opt.value)}
                          style={[
                            styles.breakChip,
                            {
                              backgroundColor:
                                td.breakMinutes === opt.value ? theme.inverse : theme.surface,
                              borderColor:
                                td.breakMinutes === opt.value ? theme.inverse : theme.border,
                            },
                          ]}
                        >
                          <Text
                            style={{
                              fontFamily: fonts.semiBold,
                              color:
                                td.breakMinutes === opt.value ? theme.onInverse : theme.ink,
                              fontSize: 12,
                            }}
                          >
                            {opt.label}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  </View>
                  {net !== null && (
                    <Text style={{ color: theme.muted, fontSize: layout.type.caption }}>
                      Net: {formatNetMinutes(net)}
                      {td.breakMinutes < legalMin ? ` · Önerilen mola: ${legalMin} dk` : ''}
                    </Text>
                  )}
                </View>
              );
            })}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Saatleri kaydet"
              onPress={() => setExpanded(false)}
              style={[styles.expandBtn, { borderColor: theme.border }]}
            >
              <Ionicons name="checkmark-outline" size={16} color={theme.muted} />
              <Text style={{ color: theme.muted, fontSize: layout.type.body }}>Tamam</Text>
            </Pressable>
          </>
        )}
      </Card>

      {/* Current shift selector for multi-shift patterns */}
      {showCurrentShift && isMultiShift && (
        <Card>
          <CardHeader icon="swap-horizontal-outline" title="Bu hafta hangi vardiyadasın?" />
          <ChoiceGroup
            options={value.templateDrafts.map((td, i) => ({
              value: String(i),
              label: td.name,
              description: `${td.startLocalTime} – ${td.endLocalTime}`,
              icon: 'time-outline' as const,
            }))}
            selected={String(value.currentShiftIndex)}
            onSelect={(v) => onChange({ ...value, currentShiftIndex: Number(v) })}
          />
        </Card>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: layout.space.md },
  scheduleRow: { flexDirection: 'row', gap: 6 },
  segmentBtn: {
    borderWidth: 1.5,
    borderRadius: layout.radius.control,
    paddingVertical: 10,
    minHeight: layout.control.minHeight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  patternGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: layout.space.sm,
  },
  patternCard: {
    width: '48%',
    flexGrow: 1,
    borderRadius: layout.radius.card,
    paddingVertical: 14,
    paddingHorizontal: 12,
    alignItems: 'center',
    gap: 6,
    minHeight: 90,
    justifyContent: 'center',
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  expandBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: 4,
    minHeight: layout.control.touchTarget,
  },
  templateSection: { paddingTop: 10, marginTop: 4, gap: layout.space.sm },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  timeInput: {
    borderWidth: 1,
    borderRadius: layout.radius.input,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: layout.type.body,
    flex: 1,
    textAlign: 'center',
    minHeight: layout.control.minHeight,
  },
  breakRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingTop: 10,
    marginTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  breakOptions: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', flex: 1 },
  breakChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
  },
});
