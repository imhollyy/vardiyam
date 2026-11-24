import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import Svg, { Circle, G, Polyline, Rect, Text as SvgText } from 'react-native-svg';

import { useAppDatabase } from '@/src/data/AppDatabaseProvider';
import { getSettings } from '@/src/data/settingsRepository';
import { type MonthlyStatement, getPayPeriod, calculateAnnualLeave, calculateSeverance } from '@/src/domain/payroll/index';
import { loadPeriodStatement, type PeriodInfo } from '@/src/features/payroll/loadPeriodStatement';
import { formatTryMinor } from '@/src/domain/money';
import { useAppTheme } from '@/src/theme/AppThemeProvider';
import { fonts, layout, shiftPalette } from '@/src/theme/tokens';
import { Screen } from '@/src/components/ui/Screen';
import { InkCard, InkCardRow, InkCardStat } from '@/src/components/ui/InkCard';
import { Card } from '@/src/components/ui/Card';
import { PageHeading } from '@/src/components/ui/PageHeading';
import { SectionHeader } from '@/src/components/ui/SectionHeader';
import { EmptyState } from '@/src/components/ui/EmptyState';
import { SkeletonCard } from '@/src/components/ui/Skeleton';

const MONTH_NAMES = [
  'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık',
];

function todayStr(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

// ── Sparkline ──────────────────────────────────────────────────────────────────
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
    <Svg width={width} height={height} accessibilityLabel="Aylık net gelir sparkline">
      <Polyline points={pts.join(' ')} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" />
    </Svg>
  );
}

// ── Mesai çubuk grafik ─────────────────────────────────────────────────────────
function OvertimeBarChart({ values, labels, color, maxVal, width = 280, height = 80 }: {
  values: number[]; labels: string[]; color: string; maxVal: number; width?: number; height?: number;
}) {
  if (values.every((v) => v === 0)) return null;
  const barW = Math.floor((width - (values.length - 1) * 4) / Math.max(values.length, 1));
  return (
    <Svg width={width} height={height + 14} accessibilityLabel="Aylık fazla mesai çubuk grafiği">
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

// ── Donut grafik ───────────────────────────────────────────────────────────────
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

  let offset = 0;
  const paths = slices.map((sl) => {
    const frac = sl.value / total;
    const dash = frac * circumference;
    const gap = circumference - dash;
    const rot = offset * 360 - 90;
    offset += frac;
    return { dash, gap, rot, color: sl.color };
  });

  return (
    <Svg width={size} height={size} accessibilityLabel="Gelir dağılımı donut grafiği">
      {paths.map((p, i) => (
        <Circle
          key={i}
          cx={cx} cy={cy} r={r}
          fill="none"
          stroke={p.color}
          strokeWidth={strokeWidth}
          strokeDasharray={`${p.dash} ${p.gap}`}
          rotation={p.rot}
          origin={`${cx}, ${cy}`}
        />
      ))}
    </Svg>
  );
}

// ── Progress donut ─────────────────────────────────────────────────────────────
function ProgressDonut({ ratio, color, trailColor, size = 80, strokeWidth = 10 }: {
  ratio: number; color: string; trailColor: string; size?: number; strokeWidth?: number;
}) {
  const r = (size - strokeWidth) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * r;
  const filled = Math.min(1, Math.max(0, ratio)) * circumference;

  return (
    <Svg width={size} height={size} accessibilityLabel={`İzin kullanımı: %${Math.round(ratio * 100)}`}>
      <Circle cx={cx} cy={cy} r={r} fill="none" stroke={trailColor} strokeWidth={strokeWidth} />
      <Circle
        cx={cx} cy={cy} r={r}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeDasharray={`${filled} ${circumference - filled}`}
        rotation={-90}
        origin={`${cx},${cy}`}
        strokeLinecap="round"
      />
    </Svg>
  );
}

// ── Ana bileşen ────────────────────────────────────────────────────────────────
export default function ReportsScreen() {
  const { theme, mode } = useAppTheme();
  const database = useAppDatabase();
  const today = useMemo(() => todayStr(), []);
  const currentYear = useMemo(() => Number(today.split('-')[0]), [today]);
  const [year, setYear] = useState(currentYear);
  const [statements, setStatements] = useState<MonthlyStatement[]>([]);
  const [periods, setPeriods] = useState<PeriodInfo[]>([]);
  const [startDate, setStartDate] = useState<string | null>(null);
  const [grossMinor, setGrossMinor] = useState(0);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      setLoading(true);
      void (async () => {
        try {
          const settings = await getSettings(database);
          const maxMonth = year === currentYear ? new Date().getMonth() + 1 : 12;
          const stmts: MonthlyStatement[] = [];
          const pds: PeriodInfo[] = [];
          let cumulativeTaxable = 0;
          for (let m = 1; m <= maxMonth; m++) {
            const { start, end } = getPayPeriod(year, m, settings.payday);
            const period: PeriodInfo = { start, end, label: `${MONTH_NAMES[m - 1]!} ${year}` };
            const stmt = await loadPeriodStatement(database, period, cumulativeTaxable);
            stmts.push(stmt);
            pds.push(period);
            cumulativeTaxable += stmt.grossMinor - stmt.sgkWorkerMinor - stmt.unemploymentWorkerMinor;
          }
          if (active) {
            setStatements(stmts);
            setPeriods(pds);
            setStartDate(settings.startDate ?? null);
            setGrossMinor(settings.salaryMinor ?? 0);
          }
        } finally {
          if (active) setLoading(false);
        }
      })();
      return () => { active = false; };
    }, [database, year, currentYear]),
  );

  const totalNet = statements.reduce((s, st) => s + st.netMinor, 0);
  const totalGross = statements.reduce((s, st) => s + st.grossMinor, 0);
  const totalOvertime = statements.reduce((s, st) => s + st.overtimeMinor, 0);
  const totalOvertimeMin = statements.reduce((s, st) => s + st.scheduledOvertimeMinutes + st.manualOvertimeMinutes, 0);
  const totalWorkedDays = statements.reduce((s, st) => s + st.workedDays, 0);
  const maxOvertimeMin = Math.max(...statements.map((s) => s.scheduledOvertimeMinutes + s.manualOvertimeMinutes), 1);

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

  const sparkValues = statements.map((s) => s.netMinor);
  const overtimeValues = statements.map((s) => s.scheduledOvertimeMinutes + s.manualOvertimeMinutes);
  const monthLabels = statements.map((_, i) => MONTH_NAMES[i]?.slice(0, 3) ?? '');

  const totalDeductions = totalGross - totalNet;
  const donutSlices = [
    { value: totalNet, color: theme.success, label: 'Net' },
    { value: totalDeductions > 0 ? totalDeductions : 0, color: theme.muted, label: 'Kesintiler' },
  ];

  if (loading) {
    return (
      <Screen>
        <SkeletonCard rows={2} />
        <SkeletonCard rows={6} />
      </Screen>
    );
  }

  const hasData = statements.length > 0;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.background }}
      contentContainerStyle={{ paddingHorizontal: layout.screen.horizontal, paddingTop: layout.screen.top, gap: layout.space.md, paddingBottom: 32 }}
    >
      {/* Başlık + yıl seçici */}
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <PageHeading eyebrow="RAPORLAR" title={`${year} Yılı`} subtitle="Yıllık gelir ve çalışma özeti" />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 6 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Önceki yıl"
            onPress={() => setYear((y) => y - 1)}
            style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: layout.radius.control, backgroundColor: theme.surfaceMuted }}
          >
            <Ionicons name="chevron-back" size={16} color={theme.ink} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Sonraki yıl"
            onPress={() => setYear((y) => y + 1)}
            disabled={year >= currentYear}
            style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: layout.radius.control, backgroundColor: theme.surfaceMuted, opacity: year >= currentYear ? 0.3 : 1 }}
          >
            <Ionicons name="chevron-forward" size={16} color={theme.ink} />
          </Pressable>
        </View>
      </View>

      {!hasData ? (
        <EmptyState icon="bar-chart-outline" title="Veri yok" body={`Bu yıl için hesaplama yok.\nVardiya ve maaş ayarlarını tamamla.`} />
      ) : (
        <>
          {/* Yıl özeti + sparkline */}
          <InkCard eyebrow={`${year} Yılı Toplamı`} amount={formatTryMinor(totalNet)} daysLabel={`${totalWorkedDays} gün`}>
            <InkCardRow>
              <InkCardStat label="Brüt" value={formatTryMinor(totalGross)} />
              <InkCardStat label="Fazla mesai" value={formatTryMinor(totalOvertime)} />
            </InkCardRow>
            {sparkValues.length >= 2 ? (
              <View style={{ alignItems: 'center', paddingTop: 8 }}>
                <Sparkline values={sparkValues} color={theme.onInk} />
              </View>
            ) : null}
          </InkCard>

          {/* Fazla mesai çubuk grafik */}
          {totalOvertimeMin > 0 ? (
            <>
              <SectionHeader title="Fazla Mesai" />
              <Card>
                <View style={{ alignItems: 'center', paddingVertical: 8 }}>
                  <OvertimeBarChart
                    values={overtimeValues}
                    labels={monthLabels}
                    color={theme.warning}
                    maxVal={maxOvertimeMin}
                  />
                </View>
                <Text style={{ fontFamily: fonts.regular, fontSize: layout.type.caption, color: theme.muted, textAlign: 'center', marginTop: 4 }}>
                  Toplam: {Math.floor(totalOvertimeMin / 60)}sa {totalOvertimeMin % 60}dk
                </Text>
              </Card>
            </>
          ) : null}

          {/* Gelir dağılımı donut */}
          {totalGross > 0 ? (
            <>
              <SectionHeader title="Gelir Dağılımı" />
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

          {/* Yıllık izin progress */}
          {annualLeave && annualLeave.earnedDays > 0 ? (
            <>
              <SectionHeader title="Yıllık İzin" />
              <Card>
                <View style={styles.donutRow}>
                  <ProgressDonut
                    ratio={annualLeave.usedDays / annualLeave.earnedDays}
                    color={shiftPalette.leave[mode].text}
                    trailColor={shiftPalette.leave[mode].background}
                    size={80}
                  />
                  <View style={{ gap: 6, flex: 1 }}>
                    <Text style={{ fontFamily: fonts.extraBold, fontSize: layout.type.heading, color: theme.ink }}>
                      {annualLeave.remainingDays} gün kaldı
                    </Text>
                    <Text style={{ fontFamily: fonts.regular, fontSize: layout.type.caption, color: theme.muted }}>
                      {annualLeave.usedDays} kullanıldı · {annualLeave.earnedDays} hak
                    </Text>
                    {annualLeave.remainingDays <= 0 ? (
                      <Text style={{ fontFamily: fonts.semiBold, fontSize: layout.type.caption, color: theme.danger }}>
                        İzin hakkı tükendi
                      </Text>
                    ) : null}
                  </View>
                </View>
              </Card>
            </>
          ) : null}

          {/* Kıdem tahmini */}
          {severanceMinor !== null && severanceMinor > 0 ? (
            <>
              <SectionHeader title="Kıdem Tahmini" />
              <Card>
                <View style={{ gap: 6 }}>
                  <Text style={{ fontFamily: fonts.extraBold, fontSize: layout.type.heading, color: theme.ink }}>
                    {formatTryMinor(severanceMinor)}
                  </Text>
                  <Text style={{ fontFamily: fonts.regular, fontSize: layout.type.caption, color: theme.muted }}>
                    {completedYears} yıl çalışmaya göre brüt kıdem tahmini
                  </Text>
                </View>
              </Card>
            </>
          ) : null}

          {/* Aylık dağılım */}
          <SectionHeader title="Aylık Dağılım" />
          <Card>
            {statements.map((stmt, i) => {
              const maxNet = Math.max(...statements.map((s) => s.netMinor), 1);
              const barWidth = Math.max(8, (stmt.netMinor / maxNet) * 100);
              return (
                <View key={i} style={styles.monthRow} accessibilityLabel={`${MONTH_NAMES[i]}: ${formatTryMinor(stmt.netMinor)}, ${stmt.workedDays} gün`}>
                  <Text style={[styles.monthLabel, { color: theme.ink }]}>{MONTH_NAMES[i]?.slice(0, 3)}</Text>
                  <View style={styles.barContainer}>
                    <View style={[styles.bar, { width: `${barWidth}%`, backgroundColor: theme.ink }]} />
                  </View>
                  <View style={styles.monthValues}>
                    <Text style={[styles.monthNet, { color: theme.ink }]}>{formatTryMinor(stmt.netMinor)}</Text>
                    <Text style={{ fontFamily: fonts.regular, color: theme.muted, fontSize: layout.type.caption }}>{stmt.workedDays} gün</Text>
                  </View>
                </View>
              );
            })}
          </Card>

          {statements.length < 3 ? (
            <Text style={{ fontFamily: fonts.regular, fontSize: layout.type.caption, color: theme.muted, textAlign: 'center' }}>
              Daha fazla veri girdikçe grafikler genişler
            </Text>
          ) : null}
        </>
      )}

      <View style={styles.disclaimer}>
        <Ionicons accessible={false} name="information-circle-outline" size={14} color={theme.muted} />
        <Text style={[styles.disclaimerText, { color: theme.muted }]}>
          Tahmini hesaplamadır. Gerçek bordro değerlerinden farklılık gösterebilir.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  donutRow: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingVertical: 8 },
  monthRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
  monthLabel: { width: 32, fontFamily: fonts.bold, fontSize: layout.type.caption },
  barContainer: { flex: 1, height: 8, borderRadius: 4, backgroundColor: 'rgba(128,128,128,0.1)' },
  bar: { height: 8, borderRadius: 4 },
  monthValues: { alignItems: 'flex-end', minWidth: 80 },
  monthNet: { fontFamily: fonts.bold, fontSize: layout.type.caption },
  disclaimer: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, paddingHorizontal: 4 },
  disclaimerText: { fontFamily: fonts.regular, fontSize: layout.type.caption, flex: 1, lineHeight: 18 },
});
