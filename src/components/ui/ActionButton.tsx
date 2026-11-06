import Ionicons from '@expo/vector-icons/Ionicons';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useAppTheme } from '@/src/theme/AppThemeProvider';
import { layout } from '@/src/theme/tokens';

type Variant = 'primary' | 'success' | 'secondary' | 'destructive' | 'quiet';

export function ActionButton({ label, onPress, variant = 'primary', disabled = false, loading = false, icon, accessibilityLabel, style, compact = false, neutralWhenDisabled = false }: {
  label: string;
  onPress: () => void;
  variant?: Variant;
  disabled?: boolean;
  loading?: boolean;
  icon?: React.ComponentProps<typeof Ionicons>['name'];
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  compact?: boolean;
  neutralWhenDisabled?: boolean;
}) {
  const { theme, mode } = useAppTheme();
  const muted = variant === 'secondary' || variant === 'quiet';
  const inactive = disabled && neutralWhenDisabled;
  const backgroundColor = inactive ? theme.surface : variant === 'primary' ? theme.primaryAction : variant === 'success' ? theme.success : variant === 'destructive' ? theme.danger : theme.surface;
  const foreground = inactive ? theme.muted : muted ? theme.foreground : variant === 'primary' ? theme.onPrimaryAction : mode === 'dark' ? theme.background : '#FFFFFF';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [styles.button, { backgroundColor, borderColor: variant === 'quiet' ? 'transparent' : muted || inactive ? theme.border : backgroundColor,
        opacity: disabled || loading ? (neutralWhenDisabled ? 1 : 0.52) : pressed ? 0.82 : 1 }, compact && styles.compact, style]}
    >
      {loading ? <ActivityIndicator color={foreground} /> : <View style={styles.content}>
        {icon ? <Ionicons accessible={false} name={icon} size={compact ? 20 : 18} color={foreground} /> : null}
        <Text style={[styles.label, compact && styles.compactLabel, { color: foreground }]}>{label}</Text>
      </View>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { minHeight: layout.control.minHeight, paddingHorizontal: layout.space.lg, borderWidth: 1, borderRadius: layout.radius.control, alignItems: 'center', justifyContent: 'center' },
  compact: { minHeight: 64, borderRadius: 16, padding: 8, gap: 3 },
  content: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: layout.space.sm, flexWrap: 'wrap' },
  label: { fontSize: 15, lineHeight: 21, fontWeight: '800', textAlign: 'center', flexShrink: 1 },
  compactLabel: { fontSize: 13, lineHeight: 18 },
});
