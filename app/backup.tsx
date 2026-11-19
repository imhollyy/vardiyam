import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import { File, Paths } from 'expo-file-system';
import * as SQLite from 'expo-sqlite';
import { CURRENT_SCHEMA_VERSION } from '@/src/data/migrations';

import { useAppDatabase, useDatabaseMaintenance } from '@/src/data/AppDatabaseProvider';
import { applyDataWipe, applyPreparedRestore, createBackupFile, createEmptyDatabaseForWipe, prepareRestoreFile, type RestorePreview } from '@/src/data/backupService';
import { MAX_BACKUP_BYTES, validateBackupPassword } from '@/src/features/backup/backupContainer';
import { colors } from '@/src/theme/tokens';
import { useAppTheme } from '@/src/theme/AppThemeProvider';
import { PageHeading } from '@/src/components/ui/PageHeading';

type Theme = (typeof colors)['light'] | (typeof colors)['dark'];

export default function BackupScreen() {
  const database = useAppDatabase();
  const { runDatabaseMaintenance, busy: maintenanceBusy } = useDatabaseMaintenance();
  const router = useRouter();
  const { theme } = useAppTheme();
  const candidate = useRef<SQLite.SQLiteDatabase | null>(null);
  const [exportPassword, setExportPassword] = useState('');
  const [exportConfirm, setExportConfirm] = useState('');
  const [restorePassword, setRestorePassword] = useState('');
  const [preview, setPreview] = useState<RestorePreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => () => {
    void candidate.current?.closeAsync();
    candidate.current = null;
  }, []);

  const makeBackup = async () => {
    setError(null); setSuccess(null);
    try {
      validateBackupPassword(exportPassword);
      if (exportPassword !== exportConfirm) throw new Error('Parola onayı eşleşmiyor.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Yedekleme parolasını kontrol edin.');
      return;
    }
    setBusy(true);
    let file: File | null = null;
    let bytes: Uint8Array | null = null;
    try {
      bytes = await createBackupFile(database, exportPassword);
      const date = new Date().toISOString().replace(/[:.]/g, '-');
      file = new File(Paths.cache, `vardiyam-${date}.vdybackup`);
      await file.write(bytes);
      bytes.fill(0);
      bytes = null;
      if (!(await Sharing.isAvailableAsync())) throw new Error('Bu cihazda güvenli dosya paylaşımı kullanılamıyor.');
      await Sharing.shareAsync(file.uri, { dialogTitle: 'Şifreli Vardiyam yedeğini kaydet veya paylaş', mimeType: 'application/octet-stream' });
      setSuccess('Sistem paylaşım menüsü kapandı. Yedeği seçtiğin güvenli konuma kaydettiğini doğrula.');
    } catch {
      setError('Yedek oluşturulamadı veya paylaşım açılamadı. Veritabanında değişiklik yapılmadı.');
    } finally {
      bytes?.fill(0);
      if (file?.exists) file.delete();
      setExportPassword(''); setExportConfirm(''); setBusy(false);
    }
  };

  const chooseBackup = async () => {
    setError(null); setSuccess(null); setPreview(null);
    await candidate.current?.closeAsync().catch(() => undefined);
    candidate.current = null;
    const password = restorePassword;
    try {
      validateBackupPassword(password);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Yedekleme parolasını kontrol edin.');
      return;
    }

    setBusy(true);
    let pickedFile: File | null = null;
    let bytes: Uint8Array | null = null;
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true, multiple: false });
      if (result.canceled) return;
      const asset = result.assets[0];
      if (!asset) throw new Error('Yedek dosyası seçilmedi.');
      pickedFile = new File(asset.uri);
      if (!pickedFile.exists || pickedFile.size === null || pickedFile.size <= 0 || pickedFile.size > MAX_BACKUP_BYTES) {
        throw new Error('Yedek dosyası boş veya boyut sınırının dışında.');
      }
      bytes = await pickedFile.bytes();
      const restored = await prepareRestoreFile(bytes, password);
      bytes.fill(0); bytes = null;
      candidate.current = restored.stagedDatabase;
      setPreview(restored.preview);
    } catch (caught) {
      setError(caught instanceof Error && /Parola yanlış|sürümü desteklenmiyor|şema|bütünlük|ilişkisiz|koruma kuralları|biçimi/.test(caught.message)
        ? caught.message
        : 'Yedek okunamadı veya doğrulanamadı. Mevcut veriler değiştirilmedi.');
    } finally {
      bytes?.fill(0);
      if (pickedFile?.exists) pickedFile.delete();
      setBusy(false);
    }
  };

  const restore = async () => {
    const staged = candidate.current;
    const selectedPreview = preview;
    if (!staged || !selectedPreview) return;
    setError(null); setSuccess(null); setBusy(true);
    try {
      await runDatabaseMaintenance((current, controls) => applyPreparedRestore(current, staged, selectedPreview, controls));
      await staged.closeAsync();
      candidate.current = null;
      setPreview(null); setRestorePassword('');
      setSuccess('Yedek geri yüklendi. Uygulama mevcut kayıtlarla yeniden açıldı.');
    } catch {
      setError('Geri yükleme tamamlanmadı. Önceki veriler geri yüklendi veya güvenlik kopyası korundu.');
    } finally {
      setBusy(false);
    }
  };

  const confirmRestore = () => Alert.alert(
    'Mevcut verilerin değişecek',
    `Bu işlem mevcut vardiya, çalışma, ücret, bordro ve ödeme kayıtlarının yerine yedekteki verileri koyar; birleştirme yapmaz. Yedek ${preview?.recordCount ?? 0} kayıt içeriyor. Devam edilsin mi?`,
    [
      { text: 'Vazgeç', style: 'cancel' },
      { text: 'Yedekle değiştir', style: 'destructive', onPress: () => void restore() },
    ],
  );

  const wipe = async () => {
    setError(null); setSuccess(null); setBusy(true);
    await candidate.current?.closeAsync().catch(() => undefined);
    candidate.current = null;
    setPreview(null);
    setRestorePassword('');
    let empty: SQLite.SQLiteDatabase | null = null;
    try {
      empty = await createEmptyDatabaseForWipe();
      await runDatabaseMaintenance((current, controls) => applyDataWipe(current, empty!, controls));
      await empty.closeAsync();
      empty = null;
      setSuccess('Uygulamadaki yerel veriler kaldırıldı; boş veritabanı hazır.');
    } catch {
      setError('Veriler silinemedi. Veritabanı korunmuş veya güvenlik kopyasından geri açılmıştır.');
    } finally {
      await empty?.closeAsync().catch(() => undefined);
      setBusy(false);
    }
  };

  const confirmWipe = () => Alert.alert(
    'Son onay: tüm veriler silinsin mi?',
    'Vardiya planları, çalışma kayıtları, ücret ayarları, onaylı hesaplar, bordro netleri ve ödeme geçmişi bu cihazdan kaldırılacak. Bu işlem geri alınamaz. Cihaz dışına kaydettiğin yedekler etkilenmez.',
    [
      { text: 'Vazgeç', style: 'cancel' },
      { text: 'Tüm verilerimi sil', style: 'destructive', onPress: () => void wipe() },
    ],
  );

  const startWipe = () => Alert.alert(
    'Önce yedek almak ister misin?',
    'Silme işlemi yalnızca bu uygulamadaki yerel verileri kaldırır. İstersen önce şifreli yedek oluşturabilirsin.',
    [
      { text: 'İptal', style: 'cancel' },
      { text: 'Yedekleme ekranında kal', style: 'default' },
      { text: 'Silme adımına geç', style: 'destructive', onPress: confirmWipe },
    ],
  );

  return (
    <ScrollView contentContainerStyle={[styles.screen, { backgroundColor: theme.background }]} keyboardShouldPersistTaps="handled">
      <Pressable accessibilityRole="button" accessibilityLabel="Ayarlar ekranına dön" onPress={() => router.back()} style={styles.back}>
        <Text style={{ color: theme.accent, fontWeight: '700' }}>‹ Ayarlar</Text>
      </Pressable>
      <PageHeading eyebrow="VERİ GÜVENLİĞİ" title="Yedekleme ve veriler" subtitle="Dosyan cihazında oluşturulur; dışa aktarırken güvenli konum seç." />
      <Text style={[styles.body, { color: theme.muted }]}>Yedek cihazında oluşturulur. Vardiya, çalışma, ücret, bordro ve ödeme kayıtların içeride şifrelenir. Parolanı bu dosyadan ayrı ve güvenli yerde sakla; unutursan yedek açılamaz.</Text>

      <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <SectionHeading icon="lock-closed-outline" title="Şifreli yedek oluştur" theme={theme} />
        <Text style={[styles.body, { color: theme.muted }]}>En az 12 karakterlik bir parola belirle. Sonraki sistem menüsünde Dosyalar veya başka bir konuma kaydedebilirsin.</Text>
        <TextInput accessibilityLabel="Yeni yedek parolası" value={exportPassword} onChangeText={setExportPassword} secureTextEntry autoCapitalize="none" autoCorrect={false} style={[styles.input, { borderColor: theme.border, color: theme.foreground }]} placeholder="Yedek parolası" placeholderTextColor={theme.muted} />
        <TextInput accessibilityLabel="Yedek parolası onayı" value={exportConfirm} onChangeText={setExportConfirm} secureTextEntry autoCapitalize="none" autoCorrect={false} style={[styles.input, { borderColor: theme.border, color: theme.foreground }]} placeholder="Parolayı tekrar yaz" placeholderTextColor={theme.muted} />
        <Action label="Şifreli yedek oluştur" disabled={busy || maintenanceBusy} onPress={() => void makeBackup()} theme={theme} />
      </View>

      <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <SectionHeading icon="cloud-download-outline" title="Yedekten geri yükle" theme={theme} />
        <Text style={[styles.body, { color: theme.muted }]}>Yedek dosyanı seçip parolasını gir. Dosya doğrulanmadan mevcut veriler değişmez.</Text>
        <TextInput accessibilityLabel="Yedek dosyasının parolası" value={restorePassword} onChangeText={setRestorePassword} secureTextEntry autoCapitalize="none" autoCorrect={false} style={[styles.input, { borderColor: theme.border, color: theme.foreground }]} placeholder="Yedek parolası" placeholderTextColor={theme.muted} />
        <Action label="Yedek dosyası seç ve doğrula" disabled={busy || maintenanceBusy} onPress={() => void chooseBackup()} theme={theme} />
        {preview ? (
          <View style={[styles.preview, { borderColor: theme.border }]}>
            <Text style={[styles.previewTitle, { color: theme.foreground }]}>Yedek doğrulandı</Text>
            <Text style={[styles.body, { color: theme.muted }]}>Şema v{preview.databaseSchemaVersion} → v{CURRENT_SCHEMA_VERSION} · SQLite {preview.sqliteVersion}</Text>
            <Text style={[styles.body, { color: theme.muted }]}>{new Date(preview.createdAtUtc).toLocaleString('tr-TR')} · {preview.recordCount} kayıt</Text>
            <Text style={[styles.hint, { color: theme.muted }]}>Geri yüklemek mevcut tüm uygulama verilerinin yerine geçer. Devam etmeden önce ikinci onay alınır.</Text>
            <Action label="Bu yedeği geri yükle" disabled={busy || maintenanceBusy} onPress={confirmRestore} theme={theme} destructive />
          </View>
        ) : null}
      </View>

      <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <SectionHeading icon="trash-outline" title="Tüm verilerimi sil" theme={theme} />
        <Text style={[styles.body, { color: theme.muted }]}>Yerel veritabanı kapatılır, uygulama verileri ve SQLite yan dosyaları kaldırılır, ardından boş v{CURRENT_SCHEMA_VERSION} veritabanı açılır. Telefon hafızasındaki fiziksel blokların adli düzeyde üzerine yazılacağı garanti edilemez.</Text>
        <Action label="Tüm verilerimi sil…" disabled={busy || maintenanceBusy} onPress={startWipe} theme={theme} destructive />
      </View>

      {busy || maintenanceBusy ? <View accessibilityLiveRegion="polite" style={styles.status}><ActivityIndicator color={theme.accent} /><Text style={{ color: theme.muted }}>Veri işlemi sürüyor; uygulamayı kapatma…</Text></View> : null}
      {error ? <Text accessibilityRole="alert" style={[styles.feedback, { color: '#A12622' }]}>{error}</Text> : null}
      {success ? <Text accessibilityLiveRegion="polite" style={[styles.feedback, { color: theme.accent }]}>{success}</Text> : null}
    </ScrollView>
  );
}

function Action({ label, disabled, onPress, theme, destructive = false }: {
  label: string; disabled: boolean; onPress: () => void; theme: Theme; destructive?: boolean;
}) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.action, {
      borderColor: destructive ? '#B3261E' : theme.accent,
      backgroundColor: destructive ? '#B3261E' : theme.accentSurface,
      opacity: disabled ? 0.5 : pressed ? 0.72 : 1,
    }]}>
      <Text style={{ color: destructive ? '#FFFFFF' : theme.accent, fontSize: 15, fontWeight: '800', textAlign: 'center' }}>{label}</Text>
    </Pressable>
  );
}

function SectionHeading({ icon, title, theme }: { icon: React.ComponentProps<typeof Ionicons>['name']; title: string; theme: Theme }) {
  return <View style={styles.sectionHeading} accessibilityRole="header"><View style={[styles.sectionIcon, { backgroundColor: theme.accentSurface }]}><Ionicons accessible={false} name={icon} size={19} color={theme.accent} /></View><Text style={[styles.heading, styles.sectionTitle, { color: theme.foreground }]}>{title}</Text></View>;
}

const styles = StyleSheet.create({
  screen: { padding: 20, gap: 16, paddingBottom: 36 },
  back: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 },
  title: { fontSize: 27, lineHeight: 34, fontWeight: '800' },
  heading: { fontSize: 18, lineHeight: 24, fontWeight: '800' },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  sectionIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  sectionTitle: { flexShrink: 1 },
  body: { fontSize: 14, lineHeight: 21 },
  card: { borderWidth: 1, borderRadius: 18, padding: 16, gap: 12 },
  input: { minHeight: 48, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, fontSize: 16 },
  action: { minHeight: 48, borderWidth: 1, borderRadius: 13, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14, paddingVertical: 10 },
  preview: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 8 },
  previewTitle: { fontSize: 16, fontWeight: '800' },
  hint: { fontSize: 13, lineHeight: 19 },
  feedback: { fontSize: 14, lineHeight: 21, fontWeight: '700' },
  status: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
});
