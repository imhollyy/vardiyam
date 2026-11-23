import { View } from 'react-native';
import { useAppTheme } from '@/src/theme/AppThemeProvider';

export function ProgressDots({ total, current }: { total: number; current: number }) {
  const { theme } = useAppTheme();
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: total, now: current }}
      accessibilityLabel={`Adım ${current} / ${total}`}
      style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}
    >
      {Array.from({ length: total }).map((_, i) => (
        <View
          key={i}
          style={{
            width: i + 1 === current ? 20 : 7,
            height: 7,
            borderRadius: 3.5,
            backgroundColor: i + 1 === current ? theme.ink : i + 1 < current ? theme.muted : theme.border,
          }}
        />
      ))}
    </View>
  );
}
