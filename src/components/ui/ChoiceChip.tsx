import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useAppTheme } from '@/src/theme/AppThemeProvider';
import { layout } from '@/src/theme/tokens';

type ChoiceChipProps = {
  label: string;
  selected: boolean;
  onPress: () => void;
  icon?: React.ComponentProps<typeof Ionicons>['name'];
  description?: string;
  disabled?: boolean;
};

export function ChoiceChip({ label, selected, onPress, icon, description, disabled }: ChoiceChipProps) {
  const { theme } = useAppTheme();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: selected ? theme.accentSurface : theme.surface,
          borderColor: selected ? theme.accent : theme.border,
          opacity: disabled ? 0.5 : pressed ? 0.82 : 1,
        },
      ]}
    >
      <View style={styles.row}>
        {icon ? <Ionicons accessible={false} name={icon} size={20} color={selected ? theme.accent : theme.muted} /> : null}
        <Text style={[styles.label, { color: selected ? theme.accent : theme.foreground }]}>{label}</Text>
      </View>
      {description ? <Text style={[styles.description, { color: theme.muted }]}>{description}</Text> : null}
    </Pressable>
  );
}

type ChoiceGroupProps<T extends string> = {
  options: { value: T; label: string; icon?: React.ComponentProps<typeof Ionicons>['name']; description?: string }[];
  selected: T;
  onSelect: (value: T) => void;
};

export function ChoiceGroup<T extends string>({ options, selected, onSelect }: ChoiceGroupProps<T>) {
  return (
    <View accessibilityRole="radiogroup" style={styles.group}>
      {options.map((opt) => (
        <ChoiceChip
          key={opt.value}
          label={opt.label}
          selected={opt.value === selected}
          onPress={() => onSelect(opt.value)}
          icon={opt.icon}
          description={opt.description}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    borderWidth: 1.5,
    borderRadius: layout.radius.control,
    paddingHorizontal: layout.space.lg,
    paddingVertical: 14,
    minHeight: layout.control.minHeight,
    justifyContent: 'center',
    gap: 4,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: layout.space.sm },
  label: { fontSize: layout.type.body, fontWeight: '700', flex: 1 },
  description: { fontSize: layout.type.caption, lineHeight: 18 },
  group: { gap: layout.space.sm },
});
