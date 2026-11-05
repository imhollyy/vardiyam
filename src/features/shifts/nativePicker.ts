import { getLocalDateTimeCandidates } from '../../domain/work-record.ts';

export type NativePickerMode = 'date' | 'time';

export function formatPickerValue(mode: NativePickerMode, value: string): string {
  if (mode === 'time') return value;
  const [year, month, day] = value.split('-').map(Number);
  return new Intl.DateTimeFormat('tr-TR', { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(Date.UTC(year!, month! - 1, day!, 12)));
}

export function localDateForPicker(value: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(value);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function localTimeForPicker(value: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(value);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? '';
  return `${get('hour')}:${get('minute')}`;
}

function addOneLocalDay(value: string): string {
  const [year, month, day] = value.split('-').map(Number);
  const next = new Date(Date.UTC(year!, month! - 1, day! + 1));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-${String(next.getUTCDate()).padStart(2, '0')}`;
}

export function pickerDateValue(mode: NativePickerMode, value: string, timezone: string, selectedDate?: string): Date {
  if (mode === 'date') {
    const candidate = getLocalDateTimeCandidates(`${value}T12:00`, timezone)[0];
    if (!candidate) throw new Error('Bu zaman diliminde tarih seçici açılamadı.');
    return new Date(candidate);
  }
  const date = selectedDate ?? localDateForPicker(new Date(), timezone);
  const candidates = getLocalDateTimeCandidates(`${date}T${value}`, timezone);
  if (candidates[0]) return new Date(candidates[0]);
  const [hour, minute] = value.split(':').map(Number);
  const start = hour! * 60 + minute!;
  for (let offset = 1; offset <= 180; offset += 1) {
    const total = start + offset;
    const nextDate = total >= 1440 ? addOneLocalDay(date) : date;
    const nextTime = `${String(Math.floor((total % 1440) / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
    const nextCandidate = getLocalDateTimeCandidates(`${nextDate}T${nextTime}`, timezone)[0];
    if (nextCandidate) return new Date(nextCandidate);
  }
  throw new Error('Bu zaman diliminde saat seçici açılamadı.');
}

export function normalizePickerDraft(mode: NativePickerMode, value: string, timezone: string, selectedDate?: string): string {
  const resolved = pickerDateValue(mode, value, timezone, selectedDate);
  return mode === 'date' ? localDateForPicker(resolved, timezone) : localTimeForPicker(resolved, timezone);
}
