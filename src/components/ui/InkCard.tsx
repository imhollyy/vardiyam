import { Pressable, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useAppTheme } from '@/src/theme/AppThemeProvider';
import { AmountText } from './AmountText';
import { fonts, layout } from '@/src/theme/tokens';

type InkCardProps = {
  eyebrow: string;
  amount: string;
  daysLabel?: string;
  children?: React.ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
};

export function InkCard({ eyebrow, amount, daysLabel, children, onPress, style }: InkCardProps) {
  const { theme } = useAppTheme();

  const content = (
    <View style={[{ backgroundColor: theme.inkCard, borderRadius: layout.radius.block, padding: 20, gap: 10 }, style]}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <Text style={{ fontFamily: fonts.semiBold, fontSize: layout.type.caption, color: theme.onInk, opacity: 0.7, letterSpacing: 0.5 }}>
          {eyebrow.toUpperCase()}
        </Text>
        {daysLabel ? (
          <View style={{ backgroundColor: '#FFD166', borderRadius: layout.radius.pill, paddingHorizontal: 10, paddingVertical: 3 }}>
            <Text style={{ fontFamily: fonts.bold, fontSize: 11, color: '#1B1A17' }}>{daysLabel}</Text>
          </View>
        ) : null}
      </View>
      <AmountText value={amount} size="large" color={theme.onInk} />
      {children}
    </View>
  );

  if (!onPress) return content;
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.88 : 1 })}>
      {content}
    </Pressable>
  );
}

export function InkCardRow({ children }: { children: React.ReactNode }) {
  return <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>{children}</View>;
}

export function InkCardStat({ label, value, color }: { label: string; value: string; color?: string }) {
  const { theme } = useAppTheme();
  return (
    <View style={{ gap: 2 }}>
      <Text style={{ fontFamily: fonts.extraBold, fontSize: layout.type.body, color: color ?? theme.onInk, fontVariant: ['tabular-nums'] }}>
        {value}
      </Text>
      <Text style={{ fontFamily: fonts.medium, fontSize: 11, color: theme.onInk, opacity: 0.6 }}>{label}</Text>
    </View>
  );
}
