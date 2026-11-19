import { Text, View } from 'react-native';
import { useAppTheme } from '@/src/theme/AppThemeProvider';

export default function CalendarScreen() {
  const { theme } = useAppTheme();
  return (
    <View style={{ flex: 1, backgroundColor: theme.background, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <Text style={{ color: theme.foreground, fontSize: 18 }}>Takvim yapım aşamasında</Text>
    </View>
  );
}
