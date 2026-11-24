import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import Svg, { Circle, G, Polyline, Rect, Text as SvgText } from 'react-native-svg';

import { useAppDatabase } from '@/src/data/AppDatabaseProvider';
import { getSettings } from '@/src/data/settingsRepository';
import { type MonthlyStatement, type DerivedDay, getPayPeriod, calculateAnnualLeave, calculateSeverance } from '@/src/domain/payroll/index';
import { formatTryMinor } from '@/src/domain/money';
import { loadPeriodDetails, type PeriodInfo } from '@/src/features/payroll/loadPeriodStatement';
import {
  computeShiftDistribution,
  computeDayOfWeekOvertime,
  computePeriodDelta,
  type ShiftDistribution,
  type DowOvertimeEntry,
} from '@/src/features/reports/reportCalculations';
import { useAppTheme } from '@/src/theme/AppThemeProvider';
import { fonts, layout, shiftPalette } from '@/src/theme/tokens';
import { Screen } from '@/src/components/ui/Screen';
import { Card } from '@/src/components/ui/Card';
import { PageHeading } from '@/src/components/ui/PageHeading';
import { InkCard, InkCardRow, InkCardStat } from '@/src/components/ui/InkCard';
import { SectionHeader } from '@/src/components/ui/SectionHeader';
import { EmptyState } from '@/src/components/ui/EmptyState';
import { SkeletonCard } from '@/src/components/ui/Skeleton';

const MONTH_NAMES = [
  'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık',
];

function todayLocal(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function Sparkline({ values, color, width = 220, height = 40 }: {
  values: number[]; color: string; width?: number; height?: number;
}) {
  if (values.length < 2) return null;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * width;
    const y = height - ((v - min) / range) * (height - 4) - 2;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return (
    <Svg width={width} height={height} accessibilityLabel="Aylik net gelir sparkline">
      <Polyline points={pts.join(' ')} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" />
    </Svg>
  );
}

function OvertimeBarChart({ values, labels, color, maxVal, width = 280, height = 80 }: {
  values: number[]; labels: string[]; color: string; maxVal: number; width?: number; height?: number;
}) {
  if (values.every((v) => v === 0)) return null;
  const barW = Math.floor((width - (values.length - 1) * 4) / Math.max(values.length, 1));
  return (
    <Svg width={width} height={height + 14} accessibilityLabel="Aylik fazla mesai cubuk grafigi">
      {values.map((v, i) => {
        const h = maxVal > 0 ? Math.max(2, (v / maxVal) * height) : 2;
        const x = i * (barW + 4);
        const y = height - h;
        return (
          <G key={i}>
            <Rect x={x} y={y} width={barW} height={h} rx={2} fill={color} />
            <SvgText x={x + barW / 2} y={height + 11} fontSize={7} fill={color} textAnchor="middle">
              {labels[i]}
            </SvgText>
          </G>
        );
      })}
    </Svg>
  );
}

function DonutChart({ slices, size = 110, strokeWidth = 18 }: {
  slices: { value: number; color: string; label: string }[];
  size?: number; strokeWidth?: number;
}) {
  const r = (size - strokeWidth) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * r;
  const total = slices.reduce((s, sl) => s + sl.value, 0);
  if (total === 0) return null;
  const paths = slices.reduce<{ dash: number; gap: number; rot: number; color: string }[]>((acc, sl) => {
    const prevOffset = acc.reduce((s, p) => s + (p.dash / circumference), 0);
    const frac = sl.value / total;
    const dash = frac * circumference;
    const gap = circumference - dash;
    const rot = prevOffset * 360 - 90;
    return [...acc, { dash, gap, rot, color: sl.color }];
  }, []);
  return (
    <Svg width={size} height={size} accessibilityLabel="Gelir dagilimi donut grafigi">
      {paths.map((p, i) => (
        <Circle key={i} cx={cx} cy={cy} r={r} fill="none" stroke={p.color} strokeWidth={strokeWidth}
          strokeDasharray={`${p.dash} ${p.gap}`} rotation={p.rot} origin={`${cx}, ${cy}`} />
      ))}
    </Svg>
  );
}

function ProgressDonut({ ratio, color, trailColor, size = 80, strokeWidth = 10 }: {
  ratio: number; color: string; trailColor: string; size?: number; strokeWidth?: number;
}) {
  const r = (size - strokeWidth) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * r;
  const filled = Math.min(1, Math.max(0, ratio)) * circumference;
  return (
    <Svg width={size} height={size} accessibilityLabel={`Izin kullanimi: %${Math.round(ratio * 100)}`}>
      <Circle cx={cx} cy={cy} r={r} fill="none" stroke={trailColor} strokeWidth={strokeWidth} />
      <Circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={strokeWidth}
        strokeDasharray={`${filled} ${circumference - filled}`} rotation={-90} origin={`${cx},${cy}`} strokeLinecap="round" />
    </Svg>
  );
}

export default function AnalysisScreen() {
  const { theme, mode } = useAppTheme();
  const database = useAppDatabase();

  const today = useMemo(() => todayLocal(), []);
  const currentYear = useMemo(() => Number(today.split('-')[0]), [today]);
  const [year, setYear] = useState(currentYear);
  const [statements, setStatements] = useState<MonthlyStatement[]>([]);
  const [startDate, setStartDate] = useState<string | null>(null);
  const [grossMinor, setGrossMinor] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [shiftDist, setShiftDist] = useState<ShiftDistribution>({ day: 0, evening: 0, night: 0, leave: 0, holiday: 0 });
  const [dowOvertime, setDowOvertime] = useState<DowOvertimeEntry[]>([]);

  const loadAnaliz = useCallback(async (yr: number) => {
    setLoading(true);
    try {
      const settings = await getSettings(database);
      const maxMonth = yr === currentYear ? new Date().getMonth() + 1 : 12;
      const stmts: MonthlyStatement[] = [];
      let cumulativeTaxable = 0;
      const allDays: DerivedDay[] = [];
      const mergedTemplateMap: Map<string, { startLocalTime: string }> = new Map();
      for (let m = 1; m <= maxMonth; m++) {
        const { start, end } = getPayPeriod(yr, m, settings.payday);
        const p: PeriodInfo = { start, end, label: `${MONTH_NAMES[m - 1]!} ${yr}` };
        const details = await loadPeriodDetails(database, p, cumulativeTaxable);
        stmts.push(details.statement);
        allDays.push(...details.days);
        details.templateMap.forEach((v, k) => { mergedTemplateMap.set(k, v); });
        cumulativeTaxable += details.statement.grossMinor - details.statement.sgkWorkerMinor - details.statement.unemploymentWorkerMinor;
      }
      const yearStart = `${yr}-01-01`;
      const yearEnd = `${yr}-12-31`;
      setStatements(stmts);
      setStartDate(settings.startDate ?? null);
      setGrossMinor(settings.salaryMinor ?? 0);
      setShiftDist(computeShiftDistribution(allDays, mergedTemplateMap, yearStart, yearEnd));
      setDowOvertime(computeDayOfWeekOvertime(allDays));
      setLoaded(true);
    } finally {
      setLoading(false);
    }
  }, [database, currentYear]);

  useFocusEffect(
    useCallback(() => {
      if (!loaded) void loadAnaliz(year);
    }, [loaded, loadAnaliz, year]),
  );

  const handleYearChange = useCallback((direction: -1 | 1) => {
    const newYear = year + direction;
    if (newYear > currentYear) return;
    setYear(newYear);
    setLoaded(false);
    void loadAnaliz(newYear);
  }, [year, currentYear, loadAnaliz]);

  const totalNet = statements.reduce((s, st) => s + st.netMinor, 0);
  const totalGross = statements.reduce((s, st) => s + st.grossMinor, 0);
  const totalOvertime = statements.reduce((s, st) => s + st.overtimeMinor, 0);
  const totalOvertimeMin = statements.reduce((s, st) => s + st.scheduledOvertimeMinutes + st.manualOvertimeMinutes, 0);
  const totalWorkedDays = statements.reduce((s, st) => s + st.workedDays, 0);
  const maxOvertimeMin = Math.max(...statements.map((s) => s.scheduledOvertimeMinutes + s.manualOvertimeMinutes), 1);
  const sparkValues = statements.map((s) => s.netMinor);
  const overtimeValues = statements.map((s) => s.scheduledOvertimeMinutes + s.manualOvertimeMinutes);
  const monthLabels = statements.map((_, i) => MONTH_NAMES[i]?.slice(0, 3) ?? '');

  const annualLeave = useMemo(() => {
    if (!startDate) return null;
    return calculateAnnualLeave(startDate, today, 0);
  }, [startDate, today]);

  const severanceMinor = useMemo(() => {
    if (!startDate || grossMinor <= 0) return null;
    return calculateSeverance(startDate, today, grossMinor);
  }, [startDate, today, grossMinor]);

  const completedYears = useMemo(() => {
    if (!startDate) return 0;
    const [sy, sm] = startDate.split('-').map(Number) as [number, number];
    const [ty, tm] = today.split('-').map(Number) as [number, number];
    return Math.max(0, Math.floor((ty - sy) + (tm - sm) / 12));
  }, [startDate, today]);

  const totalDeductions = totalGross - totalNet;
  const donutSlices = [
    { value: totalNet, color: theme.success, label: 'Net' },
    { value: totalDeductions > 0 ? totalDeductions : 0, color: theme.muted, label: 'Kesintiler' },
  ];
  const lastNetMinor = statements.length > 0 ? (statements[statements.length - 1]?.netMinor ?? 0) : 0;
  const prevNetMinor = statements.length > 1 ? (statements[statements.length - 2]?.netMinor ?? null) : null;
  const periodDelta = computePeriodDelta(lastNetMinor, prevNetMinor);
  const distItems: { label: string; count: number; color: string }[] = [
    { label: 'Gunduz', count: shiftDist.day, color: shiftPalette.day[mode].background },
    { label: 'Aksam', count: shiftDist.evening, color: shiftPalette.evening[mode].background },
    { label: 'Gece', count: shiftDist.night, color: shiftPalette.night[mode].background },
    { label: 'Izin', count: shiftDist.leave, color: shiftPalette.leave[mode].background },
    { label: 'Tatil', count: shiftDist.holiday, color: shiftPalette.holiday[mode].background },
  ].filter((item) => item.count > 0);
  const maxDowMin = Math.max(...dowOvertime.map((d) => d.totalMinutes), 1);
  const bestDow = dowOvertime.reduce((best, d) => (d.totalMinutes > best.totalMinutes ? d : best), dowOvertime[0] ?? { label: '', totalMinutes: 0 });

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <PageHeading eyebrow="ANALİZ" title={`${year} Yılı`} subtitle="Yıllık gelir ve çalışma özeti" />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 6 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Onceki yil"
            onPress={() => handleYearChange(-1)}
            style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: layout.radius.control, backgroundColor: theme.surfaceMuted }}
          >
            <Ionicons name="chevron-back" size={16} color={theme.ink} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Sonraki yil"
            onPress={() => handleYearChange(1)}
            disabled={year >= currentYear}
            style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: layout.radius.control, backgroundColor: theme.surfaceMuted, opacity: year >= currentYear ? 0.3 : 1 }}
          >
            <Ionicons name="chevron-forward" size={16} color={theme.ink} />
          </Pressable>
        </View>
      </View>

      {loading ? (
        <>
          <SkeletonCard rows={2} />
          <SkeletonCard rows={6} />
        </>
      ) : !loaded ? (
        <Pressable
          onPress={() => void loadAnaliz(year)}
          style={{ alignItems: 'center', paddingVertical: 24 }}
          accessibilityRole="button"
        >
          <Text style={{ fontFamily: fonts.semiBold, color: theme.accent, fontSize: layout.type.body }}>Analizi yukle</Text>
        </Pressable>
      ) : statements.length === 0 ? (
        <EmptyState icon="bar-chart-outline" title="Veri yok" body={`Bu yil icin hesaplama yok.\nVardiya ve maas ayarlarini tamamla.`} />
      ) : (
        <>
          <InkCard eyebrow={`${year} Yili Toplami`} amount={formatTryMinor(totalNet)} daysLabel={`${totalWorkedDays} gun`}>
            <InkCardRow>
              <InkCardStat label="Brut" value={formatTryMinor(totalGross)} />
              <InkCardStat label="Fazla mesai" value={formatTryMinor(totalOvertime)} />
            </InkCardRow>
            {periodDelta !== null ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingTop: 6 }}>
                <Ionicons accessible={false} name={periodDelta >= 0 ? 'trending-up' : 'trending-down'} size={14} color={periodDelta >= 0 ? theme.success : theme.danger} />
                <Text style={{ fontFamily: fonts.semiBold, fontSize: layout.type.caption, color: periodDelta >= 0 ? theme.success : theme.danger }}>
                  {periodDelta >= 0 ? '▲' : '▼'} {Math.abs(periodDelta)}% gecen aya gore
                </Text>
              </View>
            ) : null}
            {sparkValues.length >= 2 ? (
              <View style={{ alignItems: 'center', paddingTop: 8 }}>
                <Sparkline values={sparkValues} color={theme.onInk} />
              </View>
            ) : null}
          </InkCard>

          {totalOvertimeMin > 0 ? (
            <>
              <SectionHeader title="Bu ay ne kadar mesai yaptim?" />
              <Card>
                <View style={{ alignItems: 'center', paddingVertical: 8 }}>
                  <OvertimeBarChart values={overtimeValues} labels={monthLabels} color={theme.warning} maxVal={maxOvertimeMin} />
                </View>
                <Text style={{ fontFamily: fonts.regular, fontSize: layout.type.caption, color: theme.muted, textAlign: 'center', marginTop: 4 }}>
                  Toplam: {Math.floor(totalOvertimeMin / 60)}sa {totalOvertimeMin % 60}dk
                </Text>
              </Card>
            </>
          ) : null}

          {totalGross > 0 ? (
            <>
              <SectionHeader title="Param nereden geliyor?" />
              <Card>
                <View style={styles.donutRow}>
                  <DonutChart slices={donutSlices} />
                  <View style={{ gap: 8, flex: 1 }}>
                    {donutSlices.filter((s) => s.value > 0).map((sl) => (
                      <View key={sl.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: sl.color }} />
                        <View>
                          <Text style={{ fontFamily: fonts.semiBold, fontSize: layout.type.caption, color: theme.ink }}>{sl.label}</Text>
                          <Text style={{ fontFamily: fonts.regular, fontSize: 11, color: theme.muted }}>
                            {formatTryMinor(sl.value)} · %{Math.round((sl.value / totalGross) * 100)}
                          </Text>
                        </View>
                      </View>
                    ))}
                  </View>
                </View>
              </Card>
            </>
          ) : null}

          {distItems.length > 0 ? (
            <>
              <SectionHeader title="Vardiya Dagilimi" />
              <Card>
                <View style={{ gap: 10 }}>
                  <View style={styles.stackedBar}>
                    {distItems.map((item) => (
                      <View key={item.label} style={{ flex: item.count, backgroundColor: item.color, height: 16, borderRadius: 4 }} accessibilityLabel={`${item.label}: ${item.count} gun`} />
                    ))}
                  </View>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                    {distItems.map((item) => (
                      <View key={item.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                        <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: item.color }} />
                        <Text style={{ fontFamily: fonts.regular, fontSize: layout.type.caption, color: theme.muted }}>{item.label} {item.count} gun</Text>
                      </View>
                    ))}
                  </View>
                </View>
              </Card>
            </>
          ) : null}

          {dowOvertime.some((d) => d.totalMinutes > 0) ? (
            <>
              <SectionHeader title="En cok hangi gun kaliyorum fazla?" />
              <Card>
                <View style={{ gap: 8 }}>
                  <OvertimeBarChart values={dowOvertime.map((d) => d.totalMinutes)} labels={dowOvertime.map((d) => d.label)} color={theme.warning} maxVal={maxDowMin} width={280} height={70} />
                  {bestDow.totalMinutes > 0 ? (
                    <Text style={{ fontFamily: fonts.semiBold, fontSize: layout.type.caption, color: theme.muted, textAlign: 'center' }}>
                      En cok mesai yaptigin gun: {bestDow.label} ({Math.floor(bestDow.totalMinutes / 60)}sa {bestDow.totalMinutes % 60}dk)
                    </Text>
                  ) : null}
                </View>
              </Card>
            </>
          ) : null}

          {annualLeave && annualLeave.earnedDays > 0 ? (
            <>
              <SectionHeader title="Yillik Izin" />
              <Card>
                <View style={styles.donutRow}>
                  <ProgressDonut ratio={annualLeave.usedDays / annualLeave.earnedDays} color={shiftPalette.leave[mode].text} trailColor={shiftPalette.leave[mode].background} size={80} />
                  <View style={{ gap: 6, flex: 1 }}>
                    <Text style={{ fontFamily: fonts.extraBold, fontSize: layout.type.heading, color: theme.ink }}>{annualLeave.remainingDays} gun kaldi</Text>
                    <Text style={{ fontFamily: fonts.regular, fontSize: layout.type.caption, color: theme.muted }}>{annualLeave.usedDays} kullanildi · {annualLeave.earnedDays} hak</Text>
                    {annualLeave.remainingDays <= 0 ? (
                      <Text style={{ fontFamily: fonts.semiBold, fontSize: layout.type.caption, color: theme.danger }}>Izin hakki tukendi</Text>
                    ) : null}
                  </View>
                </View>
              </Card>
            </>
          ) : null}

          {severanceMinor !== null && severanceMinor > 0 ? (
            <>
              <SectionHeader title="Kidem Tahmini" />
              <Card>
                <View style={{ gap: 6 }}>
                  <Text style={{ fontFamily: fonts.extraBold, fontSize: layout.type.heading, color: theme.ink }}>{formatTryMinor(severanceMinor)}</Text>
                  <Text style={{ fontFamily: fonts.regular, fontSize: layout.type.caption, color: theme.muted }}>{completedYears} yil calismaya gore brut kidem tahmini</Text>
                </View>
              </Card>
            </>
          ) : null}

          <SectionHeader title="Aylik Dagilim" />
          <Card>
            {statements.map((stmt, i) => {
              const maxNet = Math.max(...statements.map((s) => s.netMinor), 1);
              const barWidth = Math.max(8, (stmt.netMinor / maxNet) * 100);
              return (
                <View key={i} style={styles.monthRow} accessibilityLabel={`${MONTH_NAMES[i]}: ${formatTryMinor(stmt.netMinor)}, ${stmt.workedDays} gun`}>
                  <Text style={[styles.monthLabel, { color: theme.ink }]}>{MONTH_NAMES[i]?.slice(0, 3)}</Text>
                  <View style={styles.barContainer}>
                    <View style={[styles.bar, { width: `${barWidth}%`, backgroundColor: theme.ink }]} />
                  </View>
                  <View style={styles.monthValues}>
                    <Text style={[styles.monthNet, { color: theme.ink }]}>{formatTryMinor(stmt.netMinor)}</Text>
                    <Text style={{ fontFamily: fonts.regular, color: theme.muted, fontSize: layout.type.caption }}>{stmt.workedDays} gun</Text>
                  </View>
                </View>
              );
            })}
          </Card>

          {statements.length < 3 ? (
            <Text style={{ fontFamily: fonts.regular, fontSize: layout.type.caption, color: theme.muted, textAlign: 'center' }}>
              Daha fazla veri girdikce grafikler genisler
            </Text>
          ) : null}
        </>
      )}

      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6, paddingHorizontal: 4 }}>
        <Ionicons accessible={false} name="information-circle-outline" size={14} color={theme.muted} />
        <Text style={{ fontFamily: fonts.regular, color: theme.muted, fontSize: layout.type.caption, flex: 1, lineHeight: 18 }}>
          Tahmini hesaplamadir. Gercek bordro degerlerinden farklilik gosterebilir.
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  donutRow: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingVertical: 8 },
  stackedBar: { flexDirection: 'row', gap: 2, borderRadius: 4, overflow: 'hidden', height: 16 },
  monthRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
  monthLabel: { width: 32, fontFamily: fonts.bold, fontSize: layout.type.caption },
  barContainer: { flex: 1, height: 8, borderRadius: 4, backgroundColor: 'rgba(128,128,128,0.1)' },
  bar: { height: 8, borderRadius: 4 },
  monthValues: { alignItems: 'flex-end', minWidth: 80 },
  monthNet: { fontFamily: fonts.bold, fontSize: layout.type.caption },
});
