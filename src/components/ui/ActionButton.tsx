import Ionicons from '@expo/vector-icons/Ionicons';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useAppTheme } from '@/src/theme/AppThemeProvider';
import { layout } from '@/src/theme/tokens';

type Variant = 'primary' | 'secondary' | 'destructive' | 'quiet';

export function ActionButton({ label, onPress, variant = 'primary', disabled = false, loading = false, icon, accessibilityLabel }: {
  label: string;
  onPress: () => void;
  variant?: Variant;
  disabled?: boolean;
  loading?: boolean;
  icon?: React.ComponentProps<typeof Ionicons>['name'];
  accessibilityLabel?: string;
}) {
  const { theme } = useAppTheme();
  const muted = variant === 'secondary' || variant === 'quiet';
  const backgroundColor = variant === 'primary' ? theme.primaryAction : variant === 'destructive' ? theme.danger : theme.surface;
  const foreground = muted ? theme.foreground : variant === 'primary' ? theme.onPrimaryAction : theme.background;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [styles.button, { backgroundColor, borderColor: variant === 'quiet' ? 'transparent' : variant === 'secondary' ? theme.border : backgroundColor,
        opacity: disabled || loading ? 0.52 : pressed ? 0.82 : 1 }]}
    >
      {loading ? <ActivityIndicator color={foreground} /> : <View style={styles.content}>
        {icon ? <Ionicons accessible={false} name={icon} size={18} color={foreground} /> : null}
        <Text style={[styles.label, { color: foreground }]}>{label}</Text>
      </View>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { minHeight: layout.control.minHeight, paddingHorizontal: layout.space.lg, borderWidth: 1, borderRadius: layout.radius.control, alignItems: 'center', justifyContent: 'center' },
  content: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: layout.space.sm, flexWrap: 'wrap' },
  label: { fontSize: 15, lineHeight: 21, fontWeight: '800', textAlign: 'center', flexShrink: 1 },
});
