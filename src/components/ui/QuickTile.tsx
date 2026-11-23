import { AccessibilityInfo, Animated, Pressable, Text, View } from 'react-native';
import { useEffect, useState } from 'react';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useAppTheme } from '@/src/theme/AppThemeProvider';
import { fonts, layout, shiftPalette } from '@/src/theme/tokens';

type QuickTileProps = {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  selected: boolean;
  onPress: () => void;
};

export function QuickTile({ icon, label, selected, onPress }: QuickTileProps) {
  const { theme, mode } = useAppTheme();
  const [scale] = useState(() => new Animated.Value(1));
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduced);
  }, []);

  const handlePress = () => {
    if (!reduced) {
      Animated.sequence([
        Animated.timing(scale, { toValue: 0.93, duration: 80, useNativeDriver: true }),
        Animated.timing(scale, { toValue: 1, duration: 150, useNativeDriver: true }),
      ]).start();
    }
    onPress();
  };

  const bg = selected ? shiftPalette.day[mode].background : theme.surface;
  const iconColor = selected ? shiftPalette.day[mode].text : theme.muted;
  const textColor = selected ? shiftPalette.day[mode].text : theme.ink;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      onPress={handlePress}
    >
      <Animated.View style={[{
        flex: 1, minHeight: 80,
        backgroundColor: bg,
        borderRadius: layout.radius.card,
        borderWidth: selected ? 3 : 1,
        borderColor: selected ? theme.ink : theme.border,
        alignItems: 'center', justifyContent: 'center', gap: 8,
        padding: 12,
        transform: [{ scale }],
      }]}>
        <Ionicons accessible={false} name={icon} size={24} color={iconColor} />
        <Text style={{ fontFamily: fonts.bold, fontSize: 12, color: textColor, textAlign: 'center' }}>
          {label}
        </Text>
      </Animated.View>
    </Pressable>
  );
}

export function QuickTileGrid({ children }: { children: React.ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
      {children}
    </View>
  );
}
