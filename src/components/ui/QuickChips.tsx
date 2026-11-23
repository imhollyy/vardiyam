import { Pressable, Text, View } from 'react-native';
import { useAppTheme } from '@/src/theme/AppThemeProvider';
import { fonts, layout } from '@/src/theme/tokens';

type QuickChipsProps = {
  options: { value: number; label: string }[];
  selected: number | null;
  onSelect: (value: number) => void;
};

const DEFAULT_OPTIONS = [
  { value: 1, label: '+1' },
  { value: 2, label: '+2' },
  { value: 3, label: '+3' },
  { value: 4, label: '+4' },
];

export function QuickChips({ options = DEFAULT_OPTIONS, selected, onSelect }: QuickChipsProps) {
  const { theme } = useAppTheme();
  return (
    <View style={{ flexDirection: 'row', gap: 8 }}>
      {options.map((opt) => {
        const active = opt.value === selected;
        return (
          <Pressable
            key={opt.value}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            accessibilityLabel={`${opt.label} saat`}
            onPress={() => onSelect(opt.value)}
            style={({ pressed }) => ({
              minWidth: 52, minHeight: layout.control.touchTarget,
              paddingHorizontal: 14,
              borderRadius: layout.radius.control,
              backgroundColor: active ? theme.ink : theme.surfaceMuted,
              alignItems: 'center', justifyContent: 'center',
              opacity: pressed ? 0.8 : 1,
            })}
          >
            <Text style={{
              fontFamily: fonts.extraBold,
              fontSize: layout.type.body,
              color: active ? '#FFD166' : theme.muted,
              fontVariant: ['tabular-nums'],
            }}>
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
