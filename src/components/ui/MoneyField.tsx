import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { useAppTheme } from '@/src/theme/AppThemeProvider';
import { formatMoneyInput } from '@/src/domain/money';
import { fonts, layout } from '@/src/theme/tokens';

type Props = {
  label: string;
  value: string;
  onChangeText: (formatted: string) => void;
  placeholder?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  onSubmitEditing?: TextInputProps['onSubmitEditing'];
};

export function MoneyField({ label, value, onChangeText, placeholder = '0', disabled = false, autoFocus = false, onSubmitEditing }: Props) {
  const { theme } = useAppTheme();
  const handleChange = (raw: string) => {
    onChangeText(formatMoneyInput(raw));
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <View style={styles.texts}>
        <Text style={[styles.label, { color: theme.muted }]}>{label}</Text>
        <View style={styles.row}>
          <TextInput
            style={[styles.input, { color: theme.ink }]}
            value={value}
            onChangeText={handleChange}
            keyboardType="decimal-pad"
            placeholder={placeholder}
            placeholderTextColor={theme.muted}
            editable={!disabled}
            autoFocus={autoFocus}
            returnKeyType="done"
            onSubmitEditing={onSubmitEditing}
            accessibilityLabel={`${label}, ₺`}
          />
          <Text style={[styles.currency, { color: theme.muted }]}>₺</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    minHeight: layout.control.minHeight,
    borderWidth: 1,
    borderRadius: layout.radius.control,
    paddingHorizontal: layout.space.md,
    paddingVertical: layout.space.sm,
    justifyContent: 'center',
  },
  texts: { gap: 2 },
  label: { fontFamily: fonts.bold, fontSize: layout.type.caption },
  row: { flexDirection: 'row', alignItems: 'center' },
  input: { flex: 1, fontFamily: fonts.extraBold, fontSize: layout.type.body, padding: 0 },
  currency: { fontFamily: fonts.bold, fontSize: layout.type.body, marginLeft: 4 },
});
