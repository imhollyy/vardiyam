export type OfficialHoliday = {
  date: string;
  name: string;
};

export const OFFICIAL_HOLIDAYS: readonly OfficialHoliday[] = [
  // 2025
  { date: '2025-01-01', name: 'Yılbaşı' },
  { date: '2025-03-30', name: 'Ramazan Bayramı 1. Gün' },
  { date: '2025-03-31', name: 'Ramazan Bayramı 2. Gün' },
  { date: '2025-04-01', name: 'Ramazan Bayramı 3. Gün' },
  { date: '2025-04-23', name: 'Ulusal Egemenlik ve Çocuk Bayramı' },
  { date: '2025-05-01', name: 'Emek ve Dayanışma Günü' },
  { date: '2025-05-19', name: "Atatürk’ü Anma, Gençlik ve Spor Bayramı" },
  { date: '2025-06-06', name: 'Kurban Bayramı 1. Gün' },
  { date: '2025-06-07', name: 'Kurban Bayramı 2. Gün' },
  { date: '2025-06-08', name: 'Kurban Bayramı 3. Gün' },
  { date: '2025-06-09', name: 'Kurban Bayramı 4. Gün' },
  { date: '2025-07-15', name: 'Demokrasi ve Millî Birlik Günü' },
  { date: '2025-08-30', name: 'Zafer Bayramı' },
  { date: '2025-10-29', name: 'Cumhuriyet Bayramı' },

  // 2026
  { date: '2026-01-01', name: 'Yılbaşı' },
  { date: '2026-03-20', name: 'Ramazan Bayramı 1. Gün' },
  { date: '2026-03-21', name: 'Ramazan Bayramı 2. Gün' },
  { date: '2026-03-22', name: 'Ramazan Bayramı 3. Gün' },
  { date: '2026-04-23', name: 'Ulusal Egemenlik ve Çocuk Bayramı' },
  { date: '2026-05-01', name: 'Emek ve Dayanışma Günü' },
  { date: '2026-05-19', name: "Atatürk’ü Anma, Gençlik ve Spor Bayramı" },
  { date: '2026-05-27', name: 'Kurban Bayramı 1. Gün' },
  { date: '2026-05-28', name: 'Kurban Bayramı 2. Gün' },
  { date: '2026-05-29', name: 'Kurban Bayramı 3. Gün' },
  { date: '2026-05-30', name: 'Kurban Bayramı 4. Gün' },
  { date: '2026-07-15', name: 'Demokrasi ve Millî Birlik Günü' },
  { date: '2026-08-30', name: 'Zafer Bayramı' },
  { date: '2026-10-29', name: 'Cumhuriyet Bayramı' },

  // 2027
  { date: '2027-01-01', name: 'Yılbaşı' },
  { date: '2027-03-09', name: 'Ramazan Bayramı 1. Gün' },
  { date: '2027-03-10', name: 'Ramazan Bayramı 2. Gün' },
  { date: '2027-03-11', name: 'Ramazan Bayramı 3. Gün' },
  { date: '2027-04-23', name: 'Ulusal Egemenlik ve Çocuk Bayramı' },
  { date: '2027-05-01', name: 'Emek ve Dayanışma Günü' },
  { date: '2027-05-16', name: 'Kurban Bayramı 1. Gün' },
  { date: '2027-05-17', name: 'Kurban Bayramı 2. Gün' },
  { date: '2027-05-18', name: 'Kurban Bayramı 3. Gün' },
  { date: '2027-05-19', name: "Kurban Bayramı 4. Gün / Atatürk’ü Anma" },
  { date: '2027-07-15', name: 'Demokrasi ve Millî Birlik Günü' },
  { date: '2027-08-30', name: 'Zafer Bayramı' },
  { date: '2027-10-29', name: 'Cumhuriyet Bayramı' },
] as const;

const holidaySet = new Set(OFFICIAL_HOLIDAYS.map((h) => h.date));

export function isOfficialHoliday(localDate: string): boolean {
  return holidaySet.has(localDate);
}

export function getHolidayName(localDate: string): string | undefined {
  return OFFICIAL_HOLIDAYS.find((h) => h.date === localDate)?.name;
}
