import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { ActionButton } from '@/src/components/ui/ActionButton';
import { PageHeading } from '@/src/components/ui/PageHeading';
import { validateAccountForm, type AccountMode } from '@/src/features/account/validation';
import { useAppTheme } from '@/src/theme/AppThemeProvider';
import { colors, layout } from '@/src/theme/tokens';

type Theme = (typeof colors)['light'] | (typeof colors)['dark'];

export default function AccountScreen() {
  const router = useRouter();
  const { theme } = useAppTheme();
  const [mode, setMode] = useState<AccountMode>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [attempted, setAttempted] = useState(false);

  const errors = validateAccountForm(mode, email, password, confirmation);
  const formValid = !errors.email && !errors.password && !errors.confirmation;

  const submit = () => {
    setAttempted(true);
    if (!formValid) return;
    Alert.alert(
      'Hesap hizmeti henüz bağlı değil',
      'Bu ekranda girilen e-posta ve parola gönderilmedi veya kaydedilmedi. Hesap hizmeti kurulduğunda bu işlem etkinleştirilecek.',
    );
  };

  const explainProvider = (provider: 'Google' | 'Apple') => {
    Alert.alert(
      `${provider} ile devam et`,
      `${provider} kimlik doğrulaması henüz yapılandırılmadı. Hesap bağlanana kadar bilgiler gönderilmez; uygulamayı yerel olarak kullanabilirsin.`,
    );
  };

  const changeMode = (next: AccountMode) => {
    setMode(next);
    setAttempted(false);
    setConfirmation('');
  };

  return (
    <ScrollView
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={styles.screen}
      keyboardShouldPersistTaps="handled"
    >
      <PageHeading
        eyebrow="İSTEĞE BAĞLI HESAP"
        title={mode === 'sign-in' ? 'Tekrar hoş geldin' : 'Hesap oluştur'}
        subtitle="Hesap açmadan da Vardiyam’ı cihazında ve çevrimdışı kullanabilirsin."
      />

      <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <View accessibilityRole="tablist" style={[styles.modeSwitch, { backgroundColor: theme.background }]}>
          <ModeTab label="Giriş yap" selected={mode === 'sign-in'} theme={theme} onPress={() => changeMode('sign-in')} />
          <ModeTab label="Kayıt ol" selected={mode === 'sign-up'} theme={theme} onPress={() => changeMode('sign-up')} />
        </View>

        <View style={styles.field}>
          <Text style={[styles.label, { color: theme.foreground }]}>E-posta</Text>
          <TextInput
            accessibilityLabel="E-posta adresi"
            autoCapitalize="none"
            autoComplete="email"
            autoCorrect={false}
            keyboardType="email-address"
            onChangeText={setEmail}
            placeholder="ornek@eposta.com"
            placeholderTextColor={theme.muted}
            returnKeyType="next"
            style={[styles.input, { backgroundColor: theme.background, borderColor: attempted && errors.email ? theme.danger : theme.border, color: theme.foreground }]}
            textContentType="emailAddress"
            value={email}
          />
          {attempted && errors.email ? <Text accessibilityRole="alert" style={[styles.error, { color: theme.danger }]}>Geçerli bir e-posta adresi gir.</Text> : null}
        </View>

        <View style={styles.field}>
          <Text style={[styles.label, { color: theme.foreground }]}>Parola</Text>
          <View style={[styles.passwordField, { backgroundColor: theme.background, borderColor: attempted && errors.password ? theme.danger : theme.border }]}>
            <TextInput
              accessibilityLabel="Parola"
              autoCapitalize="none"
              autoComplete={mode === 'sign-up' ? 'new-password' : 'current-password'}
              onChangeText={setPassword}
              onSubmitEditing={submit}
              placeholder="Parolan"
              placeholderTextColor={theme.muted}
              secureTextEntry={!showPassword}
              style={[styles.passwordInput, { color: theme.foreground }]}
              textContentType={mode === 'sign-up' ? 'newPassword' : 'password'}
              value={password}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={showPassword ? 'Parolayı gizle' : 'Parolayı göster'}
              hitSlop={8}
              onPress={() => setShowPassword((value) => !value)}
              style={styles.visibilityButton}
            >
              <Ionicons accessible={false} name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={21} color={theme.muted} />
            </Pressable>
          </View>
          {attempted && errors.password ? <Text accessibilityRole="alert" style={[styles.error, { color: theme.danger }]}>Parolanı gir.</Text> : null}
        </View>

        {mode === 'sign-up' ? (
          <View style={styles.field}>
            <Text style={[styles.label, { color: theme.foreground }]}>Parola tekrarı</Text>
            <TextInput
              accessibilityLabel="Parola tekrarı"
              autoCapitalize="none"
              autoComplete="new-password"
              onChangeText={setConfirmation}
              placeholder="Parolanı tekrar gir"
              placeholderTextColor={theme.muted}
              secureTextEntry={!showPassword}
              style={[styles.input, { backgroundColor: theme.background, borderColor: attempted && errors.confirmation ? theme.danger : theme.border, color: theme.foreground }]}
              textContentType="newPassword"
              value={confirmation}
            />
            {attempted && errors.confirmation ? <Text accessibilityRole="alert" style={[styles.error, { color: theme.danger }]}>Parolalar eşleşmiyor.</Text> : null}
          </View>
        ) : null}

        <ActionButton label={mode === 'sign-in' ? 'E-posta ile giriş yap' : 'E-posta ile hesap oluştur'} onPress={submit} />

        <View style={styles.separator}>
          <View style={[styles.separatorLine, { backgroundColor: theme.border }]} />
          <Text style={[styles.separatorText, { color: theme.muted }]}>veya</Text>
          <View style={[styles.separatorLine, { backgroundColor: theme.border }]} />
        </View>

        <ActionButton label="Google ile devam et" icon="logo-google" variant="secondary" onPress={() => explainProvider('Google')} />
        <ActionButton label="Apple ile devam et" icon="logo-apple" variant="secondary" onPress={() => explainProvider('Apple')} />
      </View>

      <View style={[styles.notice, { backgroundColor: theme.accentSurface, borderColor: theme.border }]}>
        <Ionicons accessible={false} name="information-circle-outline" size={20} color={theme.accent} />
        <Text style={[styles.noticeText, { color: theme.foreground }]}>Hesap hizmeti henüz etkin değil. Bu form giriş yapmaz; e-posta ve parola sunucuya gönderilmez veya Vardiyam veritabanına kaydedilmez. Yerel kullanımın etkilenmez.</Text>
      </View>

      <ActionButton label="Şimdilik yerel kullanıma devam et" variant="quiet" onPress={() => router.replace('/(tabs)')} />
    </ScrollView>
  );
}

function ModeTab({ label, selected, onPress, theme }: { label: string; selected: boolean; onPress: () => void; theme: Theme }) {
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.modeTab, selected && { backgroundColor: theme.surface, borderColor: theme.border }]}
    >
      <Text style={{ color: selected ? theme.foreground : theme.muted, fontSize: 14, fontWeight: '800' }}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flexGrow: 1, paddingHorizontal: layout.screen.horizontal, paddingTop: layout.screen.top, paddingBottom: layout.screen.bottom, gap: layout.space.lg },
  card: { borderWidth: 1, borderRadius: layout.radius.card, padding: layout.space.lg, gap: layout.space.md },
  modeSwitch: { flexDirection: 'row', padding: 4, borderRadius: layout.radius.control, gap: 4 },
  modeTab: { minHeight: 44, flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 11, borderWidth: 1, borderColor: 'transparent' },
  field: { gap: 7 },
  label: { fontSize: 14, fontWeight: '700' },
  input: { minHeight: 50, borderWidth: 1, borderRadius: layout.radius.input, paddingHorizontal: 13, fontSize: 16 },
  passwordField: { minHeight: 50, borderWidth: 1, borderRadius: layout.radius.input, flexDirection: 'row', alignItems: 'center' },
  passwordInput: { flex: 1, minHeight: 48, paddingHorizontal: 13, fontSize: 16 },
  visibilityButton: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  error: { fontSize: 13, lineHeight: 18 },
  separator: { flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 2 },
  separatorLine: { flex: 1, height: StyleSheet.hairlineWidth },
  separatorText: { fontSize: 13 },
  notice: { flexDirection: 'row', alignItems: 'flex-start', borderWidth: 1, borderRadius: layout.radius.control, padding: layout.space.md, gap: 9 },
  noticeText: { flex: 1, fontSize: 13, lineHeight: 19 },
});
