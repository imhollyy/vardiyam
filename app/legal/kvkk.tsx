import { ScrollView, StyleSheet, Text, View, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { useAppTheme } from '@/src/theme/AppThemeProvider';
import { APP_NAME } from '@/src/config/app';
import { layout } from '@/src/theme/tokens';

export default function KvkkScreen() {
  const { theme } = useAppTheme();
  const router = useRouter();

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.foreground }]}>KVKK Aydınlatma Metni</Text>
        <Pressable accessibilityRole="button" onPress={() => router.back()}>
          <Text style={{ color: theme.accent, fontWeight: '600', fontSize: layout.type.body }}>Kapat</Text>
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.heading, { color: theme.foreground }]}>Veri Sorumlusu</Text>
        <Text style={[styles.body, { color: theme.foreground }]}>
          {APP_NAME} uygulaması, kullanıcıların cihazında yerel olarak çalışan bir vardiya takip ve kazanç hesaplama aracıdır. Uygulama herhangi bir sunucuya veri göndermez.
        </Text>

        <Text style={[styles.heading, { color: theme.foreground }]}>İşlenen Kişisel Veriler</Text>
        <Text style={[styles.body, { color: theme.foreground }]}>
          Uygulama aşağıdaki verileri yalnızca cihazınızda saklar:{'\n'}
          {'•'} Maaş bilgisi (brüt/net tutar){'\n'}
          {'•'} Çalışma düzeni ve vardiya bilgileri{'\n'}
          {'•'} Günlük mesai, izin ve devamsızlık kayıtları{'\n'}
          {'•'} Ek gelir bilgileri{'\n'}
          {'•'} Uygulama tercihleri
        </Text>

        <Text style={[styles.heading, { color: theme.foreground }]}>Verilerin İşlenme Amacı</Text>
        <Text style={[styles.body, { color: theme.foreground }]}>
          Verileriniz yalnızca aylık kazanç hesaplaması, vardiya takibi ve raporlama amacıyla işlenir. Hesaplamalar tamamen cihazınızda yapılır.
        </Text>

        <Text style={[styles.heading, { color: theme.foreground }]}>Veri Aktarımı</Text>
        <Text style={[styles.body, { color: theme.foreground }]}>
          {APP_NAME} hiçbir kişisel veriyi üçüncü taraflara, sunuculara veya bulut hizmetlerine aktarmaz. Yedekleme dosyaları yalnızca kullanıcının isteğiyle cihazın dosya sistemine kaydedilir.
        </Text>

        <Text style={[styles.heading, { color: theme.foreground }]}>Veri Saklama Süresi</Text>
        <Text style={[styles.body, { color: theme.foreground }]}>
          Verileriniz uygulamayı silene veya "Sıfırla" işlevini kullanana kadar cihazınızda saklanır. Silme işlemi geri alınamaz.
        </Text>

        <Text style={[styles.heading, { color: theme.foreground }]}>Haklarınız</Text>
        <Text style={[styles.body, { color: theme.foreground }]}>
          6698 sayılı Kişisel Verilerin Korunması Kanunu kapsamında:{'\n'}
          {'•'} Verilerinizin işlenip işlenmediğini öğrenme{'\n'}
          {'•'} Verilerinizin silinmesini isteme{'\n'}
          {'•'} Verilerinizi dışa aktarma{'\n\n'}
          Tüm bu işlemler uygulama içinden yapılabilir. Verileriniz cihazınızdan çıkmadığı için ayrıca bir başvuru sürecine gerek yoktur.
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
