import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useAppTheme } from '@/src/theme/AppThemeProvider';
import { fonts, layout } from '@/src/theme/tokens';

type CardProps = {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
};

export function Card({ children, style }: CardProps) {
  const { theme } = useAppTheme();
  return (
    <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }, style]}>
      {children}
    </View>
  );
}

type CardHeaderProps = {
  icon?: React.ComponentProps<typeof Ionicons>['name'];
  title: string;
  right?: React.ReactNode;
};

export function CardHeader({ icon, title, right }: CardHeaderProps) {
  const { theme } = useAppTheme();
  return (
    <View style={styles.header}>
      <View style={styles.headerLeft}>
        {icon ? <Ionicons accessible={false} name={icon} size={18} color={theme.muted} /> : null}
        <Text style={[styles.headerTitle, { color: theme.ink }]}>{title}</Text>
      </View>
      {right ?? null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: layout.radius.card,
    padding: layout.space.lg,
    gap: layout.space.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: layout.space.sm,
    flex: 1,
  },
  headerTitle: {
    fontFamily: fonts.bold,
    fontSize: layout.type.section,
    flex: 1,
  },
});
