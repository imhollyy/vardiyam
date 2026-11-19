import { ScrollView, StyleSheet, Text, View, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { useAppTheme } from '@/src/theme/AppThemeProvider';
import { APP_NAME } from '@/src/config/app';
import { layout } from '@/src/theme/tokens';

export default function PrivacyScreen() {
  const { theme } = useAppTheme();
  const router = useRouter();

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.foreground }]}>Gizlilik Politikası</Text>
        <Pressable accessibilityRole="button" onPress={() => router.back()}>
          <Text style={{ color: theme.accent, fontWeight: '600', fontSize: layout.type.body }}>Kapat</Text>
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.heading, { color: theme.foreground }]}>Genel Bakış</Text>
        <Text style={[styles.body, { color: theme.foreground }]}>
          {APP_NAME}, vardiya takibi ve aylık kazanç hesaplaması yapan bir mobil uygulamadır. Gizliliğinize saygı duyar ve verilerinizi korumayı taahhüt eder.
        </Text>

        <Text style={[styles.heading, { color: theme.foreground }]}>Veri Toplama</Text>
        <Text style={[styles.body, { color: theme.foreground }]}>
          {APP_NAME} hiçbir kişisel veriyi toplamaz, sunucuya göndermez veya üçüncü taraflarla paylaşmaz. Tüm veriler yalnızca cihazınızdaki yerel veritabanında saklanır.
        </Text>

        <Text style={[styles.heading, { color: theme.foreground }]}>Yerel Depolama</Text>
        <Text style={[styles.body, { color: theme.foreground }]}>
          Uygulama SQLite veritabanı kullanır. Verileriniz:{'\n'}
          {'•'} Yalnızca cihazınızda tutulur{'\n'}
          {'•'} İnternet bağlantısı gerektirmez{'\n'}
          {'•'} Şifrelenmemiş olarak saklanır (cihaz güvenliğine bağlıdır){'\n'}
          {'•'} Yedekleme ile dışa aktarılabilir
        </Text>

        <Text style={[styles.heading, { color: theme.foreground }]}>Üçüncü Taraf Hizmetleri</Text>
        <Text style={[styles.body, { color: theme.foreground }]}>
          Uygulama analitik, reklam veya izleme hizmeti kullanmaz. Hiçbir ağ isteği yapılmaz.
        </Text>

        <Text style={[styles.heading, { color: theme.foreground }]}>Veri Silme</Text>
        <Text style={[styles.body, { color: theme.foreground }]}>
          Verilerinizi istediğiniz zaman silebilirsiniz:{'\n'}
          {'•'} Ayarlar ekranından "Sıfırla" ile tüm verileri silin{'\n'}
          {'•'} Uygulamayı cihazınızdan kaldırarak tüm verileri silin{'\n\n'}
          Silinen veriler kurtarılamaz.
        </Text>

        <Text style={[styles.heading, { color: theme.foreground }]}>Çocukların Gizliliği</Text>
        <Text style={[styles.body, { color: theme.foreground }]}>
          Uygulama 18 yaş altı kullanıcılara yönelik değildir. Çocuklardan bilerek veri toplanmaz.
        </Text>

        <Text style={[styles.heading, { color: theme.foreground }]}>Değişiklikler</Text>
        <Text style={[styles.body, { color: theme.foreground }]}>
          Bu politika uygulama güncellemeleriyle değişebilir. Önemli değişiklikler uygulama içinden bildirilir.
        </Text>

        <Text style={[styles.draft, { color: theme.muted }]}>
          Bu metin taslak niteliğindedir ve hukuki danışmanlık yerine geçmez.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 60 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: layout.screen.horizontal, marginBottom: 16 },
  title: { fontSize: layout.type.title, fontWeight: '800' },
  content: { paddingHorizontal: layout.screen.horizontal, paddingBottom: layout.screen.bottom, gap: 8 },
  heading: { fontSize: layout.type.section, fontWeight: '700', marginTop: 16 },
  body: { fontSize: layout.type.body, lineHeight: 24 },
  draft: { fontSize: layout.type.caption, fontStyle: 'italic', marginTop: 24, textAlign: 'center' },
});
