import { useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import DateTimePicker, { DateTimePickerAndroid, type DateTimePickerChangeEvent } from '@react-native-community/datetimepicker';
import Ionicons from '@expo/vector-icons/Ionicons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAppTheme } from '@/src/theme/AppThemeProvider';
import { layout } from '@/src/theme/tokens';
import { formatPickerValue, localDateForPicker, localTimeForPicker, normalizePickerDraft, pickerDateValue } from '@/src/features/shifts/nativePicker';

type Mode = 'date' | 'time';
type Props = { mode: Mode; label: string; value: string; timezone: string; onChange: (value: string) => void; localDate?: string; disabled?: boolean; onError?: (message: string) => void };

export function DateTimePickerField({ mode, label, value, timezone, onChange, localDate: selectedDate, disabled = false, onError }: Props) {
  const { mode: themeMode, theme } = useAppTheme();
  const [visible, setVisible] = useState(false);
  const [draft, setDraft] = useState(value);
  const shownValue = formatPickerValue(mode, value);

  const convert = (date: Date) => mode === 'date' ? localDateForPicker(date, timezone) : localTimeForPicker(date, timezone);
  const handleChange = (_event: DateTimePickerChangeEvent, date: Date) => setDraft(convert(date));
  const open = () => {
    if (disabled) return;
    let initial: Date;
    try {
      initial = pickerDateValue(mode, value, timezone, selectedDate);
      setDraft(normalizePickerDraft(mode, value, timezone, selectedDate));
    }
    catch (cause) { onError?.(cause instanceof Error ? cause.message : 'Saat seçici açılamadı.'); return; }
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: initial, mode, timeZoneName: timezone, is24Hour: mode === 'time',
        onValueChange: (_event, picked) => { if (picked) onChange(convert(picked)); },
        onError: () => onError?.('Yerel tarih/saat seçici açılamadı. Yeniden deneyebilirsin.'),
      });
      return;
    }
    setVisible(true);
  };

  let iosValue: Date | null = null;
  if (visible) {
    try { iosValue = pickerDateValue(mode, draft, timezone, selectedDate); }
    catch { iosValue = null; }
  }

  return <>
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${shownValue}. Seçmek için dokun.`}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={open}
      style={({ pressed }) => [styles.field, { backgroundColor: theme.surface, borderColor: theme.border, opacity: disabled ? 0.5 : pressed ? 0.8 : 1 }]}
    >
      <View style={styles.texts}><Text style={[styles.label, { color: theme.muted }]}>{label}</Text><Text style={[styles.value, { color: theme.foreground }]}>{shownValue}</Text></View>
      <Ionicons accessible={false} name={mode === 'date' ? 'calendar-outline' : 'time-outline'} size={20} color={theme.accent} />
      <Ionicons accessible={false} name="chevron-down" size={15} color={theme.muted} />
    </Pressable>
    {Platform.OS === 'ios' ? <Modal visible={visible} transparent animationType="slide" onRequestClose={() => setVisible(false)}>
      <View style={styles.backdrop}>
        <Pressable accessibilityLabel="Seçiciyi kapat" accessibilityRole="button" onPress={() => setVisible(false)} style={StyleSheet.absoluteFill} />
        <SafeAreaView edges={['bottom']} style={[styles.sheet, { backgroundColor: theme.background, borderColor: theme.border }]}>
          <View style={styles.header}><Text accessibilityRole="header" style={[styles.title, { color: theme.foreground }]}>{label}</Text><Pressable accessibilityRole="button" accessibilityLabel="Seçiciyi kapat" onPress={() => setVisible(false)} hitSlop={8}><Ionicons name="close-circle" size={26} color={theme.muted} /></Pressable></View>
          {iosValue ? <DateTimePicker value={iosValue} mode={mode} display="spinner" locale="tr-TR" timeZoneName={timezone} themeVariant={themeMode} onValueChange={handleChange} style={styles.picker} /> : <Text accessibilityRole="alert" style={[styles.error, { color: theme.danger }]}>Bu tarih/saat düzeninde seçici açılamadı. Önce zamanı dilimini kontrol et.</Text>}
          <View style={styles.actions}><Pressable accessibilityRole="button" onPress={() => setVisible(false)} style={[styles.action, { borderColor: theme.border }]}><Text style={{ color: theme.foreground, fontWeight: '700' }}>Vazgeç</Text></Pressable><Pressable accessibilityRole="button" disabled={!iosValue} onPress={() => { onChange(draft); setVisible(false); }} style={[styles.action, styles.confirm, { backgroundColor: theme.primaryAction, opacity: iosValue ? 1 : 0.5 }]}><Text style={[styles.confirmText, { color: theme.onPrimaryAction }]}>Seç</Text></Pressable></View>
        </SafeAreaView>
      </View>
    </Modal> : null}
  </>;
}

const styles = StyleSheet.create({
  field: { minHeight: layout.control.minHeight, borderWidth: 1, borderRadius: layout.radius.control, paddingHorizontal: layout.space.md, paddingVertical: layout.space.sm, flexDirection: 'row', alignItems: 'center', gap: layout.space.sm },
  texts: { flex: 1, gap: 2 }, label: { fontSize: layout.type.caption, fontWeight: '700' }, value: { fontSize: layout.type.body, fontWeight: '800' },
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: '#0008' }, sheet: { borderTopWidth: 1, borderTopLeftRadius: layout.radius.sheet, borderTopRightRadius: layout.radius.sheet, paddingHorizontal: layout.space.lg, paddingTop: layout.space.lg, gap: layout.space.md },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: layout.space.md }, title: { flex: 1, fontSize: layout.type.section, fontWeight: '800' }, picker: { width: '100%', height: 180 },
  actions: { flexDirection: 'row', gap: layout.space.sm }, action: { minHeight: layout.control.minHeight, flex: 1, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderRadius: layout.radius.control }, confirm: { borderColor: 'transparent' }, confirmText: { color: '#fff', fontWeight: '800' }, error: { fontSize: 14, lineHeight: 20 },
});
