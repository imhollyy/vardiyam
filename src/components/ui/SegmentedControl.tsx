import { Pressable, Text, View } from 'react-native';
import { useAppTheme } from '@/src/theme/AppThemeProvider';
import { fonts, layout } from '@/src/theme/tokens';

export function SegmentedControl<T extends string>({ options, selected, onSelect }: {
  options: { value: T; label: string }[];
  selected: T;
  onSelect: (value: T) => void;
}) {
  const { theme } = useAppTheme();
  return (
    <View
      accessibilityRole="tablist"
      style={{ flexDirection: 'row', backgroundColor: theme.surfaceMuted, borderRadius: layout.radius.control, padding: 3, gap: 2 }}
    >
      {options.map((opt) => {
        const active = opt.value === selected;
        return (
          <Pressable
            key={opt.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => onSelect(opt.value)}
            style={{ flex: 1, minHeight: 36, alignItems: 'center', justifyContent: 'center', borderRadius: layout.radius.control - 2,
              backgroundColor: active ? theme.surface : 'transparent' }}
          >
            <Text style={{ fontFamily: active ? fonts.bold : fonts.semiBold, fontSize: layout.type.caption,
              color: active ? theme.ink : theme.mutedSoft }}>
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
