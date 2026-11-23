import { Text, View } from 'react-native';
import { useAppTheme } from '@/src/theme/AppThemeProvider';
import { fonts, layout } from '@/src/theme/tokens';

export function SectionHeader({ title, right }: { title: string; right?: React.ReactNode }) {
  const { theme } = useAppTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 2 }}>
      <Text style={{ fontFamily: fonts.bold, fontSize: layout.type.label, color: theme.mutedSoft, letterSpacing: 1, textTransform: 'uppercase' }}>
        {title}
      </Text>
      {right ?? null}
    </View>
  );
}
