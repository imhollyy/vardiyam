import { ScrollView, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '@/src/theme/AppThemeProvider';
import { layout } from '@/src/theme/tokens';

type ScreenProps = {
  children: React.ReactNode;
  scroll?: boolean;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
};

export function Screen({ children, scroll = true, style, contentStyle }: ScreenProps) {
  const { theme } = useAppTheme();
  const insets = useSafeAreaInsets();

  const paddingTop = Math.max(insets.top, layout.screen.top);
  const paddingBottom = Math.max(insets.bottom, layout.screen.bottom);

  if (!scroll) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background, paddingTop, paddingBottom }, style]}>
        <View style={[styles.content, contentStyle]}>{children}</View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }, style]}>
      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingTop, paddingBottom }, contentStyle]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {children}
      </ScrollView>
    </View>
  );
}

const styles = {
  container: { flex: 1 } as const,
  content: { flex: 1, paddingHorizontal: layout.screen.horizontal } as const,
  scrollContent: { paddingHorizontal: layout.screen.horizontal, gap: layout.space.md } as const,
};
