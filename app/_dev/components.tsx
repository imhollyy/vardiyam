import type Ionicons from '@expo/vector-icons/Ionicons';
import { Text, View } from 'react-native';
import { Screen } from '@/src/components/ui/Screen';
import { PageHeading } from '@/src/components/ui/PageHeading';
import { Card, CardHeader } from '@/src/components/ui/Card';
import { ActionButton } from '@/src/components/ui/ActionButton';
import { StatTile } from '@/src/components/ui/StatTile';
import { ChoiceGroup } from '@/src/components/ui/ChoiceChip';
import { Stepper } from '@/src/components/ui/Stepper';
import { AmountText } from '@/src/components/ui/AmountText';
import { InkCard, InkCardRow, InkCardStat } from '@/src/components/ui/InkCard';
import { ShiftBlock } from '@/src/components/ui/ShiftBlock';
import { DayBlock } from '@/src/components/ui/DayBlock';
import { QuickTile, QuickTileGrid } from '@/src/components/ui/QuickTile';
import { QuickChips } from '@/src/components/ui/QuickChips';
import { ListRow } from '@/src/components/ui/ListRow';
import { SegmentedControl } from '@/src/components/ui/SegmentedControl';
import { EmptyState } from '@/src/components/ui/EmptyState';
import { SkeletonCard } from '@/src/components/ui/Skeleton';
import { SectionHeader } from '@/src/components/ui/SectionHeader';
import { ProgressDots } from '@/src/components/ui/ProgressDots';
import { useAppTheme } from '@/src/theme/AppThemeProvider';
import { fonts, layout } from '@/src/theme/tokens';
import { useState } from 'react';

export default function ComponentsDevScreen() {
  const { theme } = useAppTheme();
  const [choice, setChoice] = useState('A');
  const [stepVal, setStepVal] = useState(8);
  const [seg, setSeg] = useState<string>('hafta');
  const [quickHour, setQuickHour] = useState<number | null>(null);
  const [tile, setTile] = useState<string | undefined>(undefined);
  const [dotStep, setDotStep] = useState(2);

  return (
    <Screen>
      <PageHeading eyebrow="Geliştirici" title="Bileşenler" subtitle="Aşama 1 önizleme" />

      <SectionHeader title="Typography" />
      <Card>
        <Text style={{ fontFamily: fonts.extraBold, fontSize: layout.type.title, color: theme.ink }}>Başlık ExtraBold 28</Text>
        <Text style={{ fontFamily: fonts.bold, fontSize: layout.type.section, color: theme.ink }}>Bölüm Bold 17</Text>
        <Text style={{ fontFamily: fonts.medium, fontSize: layout.type.body, color: theme.ink }}>Gövde Medium 15</Text>
        <Text style={{ fontFamily: fonts.regular, fontSize: layout.type.caption, color: theme.muted }}>Küçük Regular 12</Text>
      </Card>

      <SectionHeader title="InkCard" />
      <InkCard eyebrow="Kasım 2026" amount="₺12.450" daysLabel="22 gün">
        <InkCardRow><InkCardStat label="Brüt tahmini" value="₺12.450" /><InkCardStat label="Fazla mesai" value="14 sa" /></InkCardRow>
        <InkCardRow><InkCardStat label="Çalışılan gün" value="18 / 22" /></InkCardRow>
      </InkCard>

      <SectionHeader title="ShiftBlock" />
      <ShiftBlock
        kind="day"
        shiftName="Gündüz"
        timeRange="08:00 – 16:00"
        breakLabel="30 dk mola"
        onChangePress={() => undefined}
        primaryLabel="Kaydet"
        onPrimaryPress={() => undefined}
      />

      <SectionHeader title="DayBlock" />
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
        {(['shift', 'overtime', 'leave', 'holiday', 'off', 'planned'] as const).map((s) => (
          <DayBlock key={s} dayLabel="Pzt" dateNumber="18" code={s === 'shift' ? 'G' : s === 'leave' ? 'İZN' : '—'} status={s} isToday={s === 'shift'} />
        ))}
      </View>

      <SectionHeader title="AmountText" />
      <Card>
        <AmountText value="₺12.450" size="large" />
        <AmountText value="₺3.250,75" size="medium" />
        <AmountText value="₺150" size="small" />
      </Card>

      <SectionHeader title="StatTile" />
      <Card>
        <View style={{ flexDirection: 'row', gap: 24, flexWrap: 'wrap' }}>
          <StatTile value="22" label="Gün" tone="accent" />
          <StatTile value="18" label="Çalışılan" tone="success" />
          <StatTile value="4" label="İzin" tone="warning" />
          <StatTile value="2" label="Eksik" tone="danger" />
        </View>
      </Card>

      <SectionHeader title="QuickTileGrid" />
      <QuickTileGrid>
        {(['Gündüz', 'Akşam', 'Gece', 'İzin'] as const).map((lbl, i) => (
          <QuickTile
            key={lbl}
            icon={(i === 0 ? 'sunny' : i === 1 ? 'partly-sunny' : i === 2 ? 'moon' : 'umbrella') as React.ComponentProps<typeof Ionicons>['name']}
            label={lbl}
            selected={tile === lbl}
            onPress={() => setTile(lbl)}
          />
        ))}
      </QuickTileGrid>

      <SectionHeader title="QuickChips" />
      <QuickChips
        options={[{ value: 1, label: '+1' }, { value: 2, label: '+2' }, { value: 3, label: '+3' }, { value: 4, label: '+4' }]}
        selected={quickHour}
        onSelect={setQuickHour}
      />

      <SectionHeader title="SegmentedControl" />
      <SegmentedControl
        options={[{ value: 'hafta', label: 'Hafta' }, { value: 'ay', label: 'Ay' }, { value: 'yil', label: 'Yıl' }]}
        selected={seg}
        onSelect={setSeg}
      />

      <SectionHeader title="ChoiceGroup" />
      <ChoiceGroup
        options={[
          { value: 'A', label: 'Seçenek A', icon: 'star', description: 'Açıklama metni' },
          { value: 'B', label: 'Seçenek B', icon: 'heart' },
        ]}
        selected={choice}
        onSelect={setChoice}
      />

      <SectionHeader title="Stepper" />
      <Stepper value={stepVal} onValueChange={setStepVal} label="Mola süresi" />

      <SectionHeader title="ListRow" />
      <Card>
        <ListRow icon="person" label="Ad Soyad" value="Ahmet Yılmaz" onPress={() => undefined} />
        <ListRow icon="wallet" label="Maaş" value="₺14.500" onPress={() => undefined} />
        <ListRow icon="trash" label="Tüm verileri sil" destructive onPress={() => undefined} />
      </Card>

      <SectionHeader title="ActionButton" />
      <ActionButton label="Kaydet" onPress={() => undefined} />
      <ActionButton label="İptal" onPress={() => undefined} variant="secondary" />
      <ActionButton label="Sil" onPress={() => undefined} variant="destructive" />
      <ActionButton label="Yükleniyor…" onPress={() => undefined} loading />

      <SectionHeader title="EmptyState" />
      <EmptyState icon="calendar-outline" title="Henüz vardiya yok" body="Ayarlardan vardiya ekleyebilirsin." />

      <SectionHeader title="Skeleton" />
      <SkeletonCard rows={3} />

      <SectionHeader title="ProgressDots" />
      <ProgressDots total={6} current={dotStep} />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <ActionButton label="Geri" compact onPress={() => setDotStep(Math.max(0, dotStep - 1))} variant="secondary" />
        <ActionButton label="İleri" compact onPress={() => setDotStep(Math.min(5, dotStep + 1))} />
      </View>

      <SectionHeader title="Card + CardHeader" />
      <Card>
        <CardHeader icon="settings" title="Kart başlığı" />
        <Text style={{ fontFamily: fonts.regular, fontSize: layout.type.body, color: theme.ink }}>
          Kart içeriği — Surface #FFFFFF üzerinde.
        </Text>
      </Card>

      <View style={{ height: 40 }} />
    </Screen>
  );
}
