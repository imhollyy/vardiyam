import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useAppTheme } from '@/src/theme/AppThemeProvider';
import { fonts, layout } from '@/src/theme/tokens';

type StepperProps = {
  value: number;
  onValueChange: (next: number) => void;
  min?: number;
  max?: number;
  step?: number;
  label?: string;
  format?: (value: number) => string;
  accessibilityLabel?: string;
};

function defaultFormat(value: number): string {
  const hours = Math.floor(value);
  const minutes = Math.round((value - hours) * 60);
  if (hours === 0) return `${minutes} dk`;
  if (minutes === 0) return `${hours} sa`;
  return `${hours} sa ${minutes} dk`;
}

export function Stepper({ value, onValueChange, min = 0, max = 24, step = 0.5, label, format = defaultFormat, accessibilityLabel }: StepperProps) {
  const { theme } = useAppTheme();
  const canDecrease = value - step >= min;
  const canIncrease = value + step <= max;

  return (
    <View
      accessibilityRole="adjustable"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityValue={{ text: format(value), min, max, now: value }}
      style={styles.container}
    >
      {label ? <Text style={[styles.label, { color: theme.ink }]}>{label}</Text> : null}
      <View style={[styles.controls, { borderColor: theme.border }]}>
        <Pressable
          accessibilityLabel="Azalt"
          disabled={!canDecrease}
          onPress={() => onValueChange(Math.max(min, value - step))}
          style={({ pressed }) => [styles.button, { opacity: canDecrease ? (pressed ? 0.6 : 1) : 0.3 }]}
        >
          <Ionicons name="remove" size={22} color={theme.accent} />
        </Pressable>
        <Text style={[styles.value, { color: theme.ink }]}>{format(value)}</Text>
        <Pressable
          accessibilityLabel="Artır"
          disabled={!canIncrease}
          onPress={() => onValueChange(Math.min(max, value + step))}
          style={({ pressed }) => [styles.button, { opacity: canIncrease ? (pressed ? 0.6 : 1) : 0.3 }]}
        >
          <Ionicons name="add" size={22} color={theme.accent} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: layout.space.xs },
  label: { fontFamily: fonts.semiBold, fontSize: layout.type.body },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: layout.radius.control,
    overflow: 'hidden',
  },
  button: {
    width: 48,
    height: layout.control.minHeight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  value: {
    flex: 1,
    textAlign: 'center',
    fontFamily: fonts.extraBold,
    fontSize: layout.type.body,
    fontVariant: ['tabular-nums'],
  },
});
