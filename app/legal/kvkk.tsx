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
    title: 'Veri Sorumlusu',
    body: `${APP_NAME} uygulaması, kullanıcıların cihazında yerel olarak çalışan bir vardiya takip ve kazanç hesaplama aracıdır. Uygulama herhangi bir sunucuya veri göndermez.`,
  },
  {
    title: 'İşlenen Kişisel Veriler',
    body: `Uygulama aşağıdaki verileri yalnızca cihazınızda saklar:\n• Maaş bilgisi (brüt/net tutar)\n• Çalışma düzeni ve vardiya bilgileri\n• Günlük mesai, izin ve devamsızlık kayıtları\n• Ek gelir bilgileri\n• Uygulama tercihleri`,
  },
  {
    title: 'Verilerin İşlenme Amacı',
    body: 'Verileriniz yalnızca aylık kazanç hesaplaması, vardiya takibi ve raporlama amacıyla işlenir. Hesaplamalar tamamen cihazınızda yapılır.',
  },
  {
    title: 'Veri Aktarımı',
    body: `${APP_NAME} hiçbir kişisel veriyi üçüncü taraflara, sunuculara veya bulut hizmetlerine aktarmaz. Yedekleme dosyaları yalnızca kullanıcının isteğiyle cihazın dosya sistemine kaydedilir.`,
  },
  {
    title: 'Veri Saklama Süresi',
    body: 'Verileriniz uygulamayı silene veya "Sıfırla" işlevini kullanana kadar cihazınızda saklanır. Silme işlemi geri alınamaz.',
  },
  {
    title: 'Haklarınız',
    body: `6698 sayılı Kişisel Verilerin Korunması Kanunu kapsamında:\n• Verilerinizin işlenip işlenmediğini öğrenme\n• Verilerinizin silinmesini isteme\n• Verilerinizi dışa aktarma\n\nTüm bu işlemler uygulama içinden yapılabilir. Verileriniz cihazınızdan çıkmadığı için ayrıca bir başvuru sürecine gerek yoktur.`,
  },
];

export default function KvkkScreen() {
  const { theme } = useAppTheme();
  const router = useRouter();

  return (
    <Screen>
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <PageHeading eyebrow="YASAL" title="KVKK Aydınlatma Metni" />
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
