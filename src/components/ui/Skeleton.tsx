import { AccessibilityInfo, Animated, View, type ViewStyle, type StyleProp } from 'react-native';
import { useEffect, useState } from 'react';
import { useAppTheme } from '@/src/theme/AppThemeProvider';
import { layout } from '@/src/theme/tokens';

export function Skeleton({ width, height, radius, style }: {
  width?: number | string;
  height?: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const { theme } = useAppTheme();
  const [opacity] = useState(() => new Animated.Value(1));
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduced);
  }, []);

  useEffect(() => {
    if (reduced) return;
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.4, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [opacity, reduced]);

  return (
    <Animated.View
      accessibilityRole="progressbar"
      accessibilityLabel="Yükleniyor"
      style={[{
        width: width ?? '100%',
        height: height ?? 20,
        borderRadius: radius ?? layout.radius.day,
        backgroundColor: theme.surfaceMuted,
        opacity,
      }, style]}
    />
  );
}

export function SkeletonCard({ rows = 3 }: { rows?: number }) {
  const { theme } = useAppTheme();
  return (
    <View style={{ backgroundColor: theme.surface, borderRadius: layout.radius.card, padding: layout.space.lg, gap: 12 }}>
      <Skeleton height={16} width="50%" />
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} height={14} width={i % 2 === 0 ? '90%' : '70%'} />
      ))}
    </View>
  );
}
