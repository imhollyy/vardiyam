import { Pressable, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useAppTheme } from '@/src/theme/AppThemeProvider';
import { fonts, layout } from '@/src/theme/tokens';

export function ListRow({ icon, label, value, onPress, destructive = false, showChevron = true }: {
  icon?: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  value?: string;
  onPress?: () => void;
  destructive?: boolean;
  showChevron?: boolean;
}) {
  const { theme } = useAppTheme();
  const labelColor = destructive ? theme.danger : theme.ink;

  const inner = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: layout.control.touchTarget, paddingVertical: 4 }}>
      {icon ? (
        <View style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: destructive ? theme.dangerSurface : theme.surfaceMuted, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons accessible={false} name={icon} size={17} color={destructive ? theme.danger : theme.muted} />
        </View>
      ) : null}
      <Text style={{ fontFamily: fonts.semiBold, fontSize: layout.type.body, color: labelColor, flex: 1 }}>{label}</Text>
      {value ? <Text style={{ fontFamily: fonts.medium, fontSize: layout.type.caption, color: theme.muted }}>{value}</Text> : null}
      {onPress && showChevron ? <Ionicons accessible={false} name="chevron-forward" size={16} color={theme.muted} /> : null}
    </View>
  );

  if (!onPress) return inner;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={value ? `${label}: ${value}` : label}
      onPress={onPress}
      style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
    >
      {inner}
    </Pressable>
  );
}
