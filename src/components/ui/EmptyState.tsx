import { Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useAppTheme } from '@/src/theme/AppThemeProvider';
import { fonts, layout } from '@/src/theme/tokens';

export function EmptyState({ icon = 'document-outline', title, body }: {
  icon?: React.ComponentProps<typeof Ionicons>['name'];
  title: string;
  body?: string;
}) {
  const { theme } = useAppTheme();
  return (
    <View
      accessibilityRole="summary"
      accessibilityLabel={body ? `${title}. ${body}` : title}
      style={{ alignItems: 'center', paddingVertical: 40, gap: 12 }}
    >
      <View style={{ width: 64, height: 64, borderRadius: 20, backgroundColor: theme.surfaceMuted, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons accessible={false} name={icon} size={28} color={theme.muted} />
      </View>
      <Text style={{ fontFamily: fonts.bold, fontSize: layout.type.body, color: theme.ink, textAlign: 'center' }}>
        {title}
      </Text>
      {body ? (
        <Text style={{ fontFamily: fonts.medium, fontSize: layout.type.caption, color: theme.muted, textAlign: 'center', lineHeight: 18 }}>
          {body}
        </Text>
      ) : null}
    </View>
  );
}
