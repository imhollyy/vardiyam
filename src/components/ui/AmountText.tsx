import { Text, type TextStyle, type StyleProp } from 'react-native';
import { useAppTheme } from '@/src/theme/AppThemeProvider';
import { fonts, layout } from '@/src/theme/tokens';

type Size = 'large' | 'medium' | 'small';

export function AmountText({ value, size = 'medium', color, style }: {
  value: string;
  size?: Size;
  color?: string;
  style?: StyleProp<TextStyle>;
}) {
  const { theme } = useAppTheme();
  const c = color ?? theme.ink;
  const fontSize = size === 'large' ? layout.type.amount : size === 'medium' ? layout.type.section : layout.type.body;
  return (
    <Text
      accessibilityLabel={value}
      style={[{
        fontFamily: fonts.extraBold,
        fontSize,
        color: c,
        fontVariant: ['tabular-nums'],
        letterSpacing: size === 'large' ? -1 : 0,
      }, style]}
    >
      {value}
    </Text>
  );
}
