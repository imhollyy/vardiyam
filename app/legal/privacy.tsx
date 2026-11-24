import { StyleSheet, Text, View, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useAppTheme } from '@/src/theme/AppThemeProvider';
import { APP_NAME } from '@/src/config/app';
import { fonts, layout } from '@/src/theme/tokens';
import { Screen } from '@/src/components/ui/Screen';
import { Card } from '@/src/components/ui/Card';
import { PageHeading } from '@/src/components/ui/PageHeading';

const SECTIONS: { title: string; body: string }[] = [
  {
    title: 'Genel Bakış',
    body: `${APP_NAME}, vardiya takibi ve aylık kazanç hesaplaması yapan bir mobil uygulamadır. Gizliliğinize saygı duyar ve verilerinizi korumayı taahhüt eder.`,
  },
  {
    title: 'Veri Toplama',
    body: `${APP_NAME} hiçbir kişisel veriyi toplamaz, sunucuya göndermez veya üçüncü taraflarla paylaşmaz. Tüm veriler yalnızca cihazınızdaki yerel veritabanında saklanır.`,
  },
  {
    title: 'Yerel Depolama',
    body: `Uygulama SQLite veritabanı kullanır. Verileriniz:\n• Yalnızca cihazınızda tutulur\n• İnternet bağlantısı gerektirmez\n• Şifrelenmemiş olarak saklanır (cihaz güvenliğine bağlıdır)\n• Yedekleme ile dışa aktarılabilir`,
  },
  {
    title: 'Üçüncü Taraf Hizmetleri',
    body: 'Uygulama analitik, reklam veya izleme hizmeti kullanmaz. Hiçbir ağ isteği yapılmaz.',
  },
  {
    title: 'Veri Silme',
    body: `Verilerinizi istediğiniz zaman silebilirsiniz:\n• Ayarlar ekranından "Sıfırla" ile tüm verileri silin\n• Uygulamayı cihazınızdan kaldırarak tüm verileri silin\n\nSilinen veriler kurtarılamaz.`,
  },
  {
    title: 'Çocukların Gizliliği',
    body: 'Uygulama 18 yaş altı kullanıcılara yönelik değildir. Çocuklardan bilerek veri toplanmaz.',
  },
  {
    title: 'Değişiklikler',
    body: 'Bu politika uygulama güncellemeleriyle değişebilir. Önemli değişiklikler uygulama içinden bildirilir.',
  },
];

export default function PrivacyScreen() {
  const { theme } = useAppTheme();
  const router = useRouter();

  return (
    <Screen>
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <PageHeading eyebrow="YASAL" title="Gizlilik Politikası" />
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Kapat" onPress={() => router.back()} style={styles.closeButton}>
          <Ionicons name="close" size={22} color={theme.muted} />
        </Pressable>
      </View>

      {SECTIONS.map((section) => (
        <Card key={section.title}>
          <Text style={[styles.heading, { color: theme.ink }]}>{section.title}</Text>
          <Text style={[styles.body, { color: theme.ink }]}>{section.body}</Text>
        </Card>
      ))}

      <Text style={[styles.draft, { color: theme.muted }]}>
        Bu metin taslak niteliğindedir ve hukuki danışmanlık yerine geçmez.
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', alignItems: 'flex-start' },
  closeButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  heading: { fontSize: layout.type.section, fontFamily: fonts.bold },
  body: { fontSize: layout.type.body, lineHeight: 24 },
  draft: { fontSize: layout.type.caption, fontStyle: 'italic', textAlign: 'center' },
});
