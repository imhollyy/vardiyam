export type SalaryHistoryEntry = {
  id: string;
  effectiveFrom: string;
  salaryMinor: number;
  createdAt: string;
};

/**
 * Returns the salary_minor for the given date.
 * history must be sorted ASC by effectiveFrom.
 * Returns the latest entry with effectiveFrom <= date, or the first entry if none match.
 */
export function salaryOn(date: string, history: SalaryHistoryEntry[]): number {
  if (history.length === 0) return 0;
  let result = history[0]!.salaryMinor;
  for (const entry of history) {
    if (entry.effectiveFrom <= date) {
      result = entry.salaryMinor;
    } else {
      break;
    }
  }
  return result;
}

/**
 * Day-weighted pro-rated salary for a period.
 * Splits the period into slices by salary changes, weighing each slice
 * by its days / total period days.
 *
 * history must be sorted ASC by effectiveFrom.
 * periodStart and periodEnd are inclusive date strings 'YYYY-MM-DD'.
 */
export function proRatedSalary(
  periodStart: string,
  periodEnd: string,
  history: SalaryHistoryEntry[],
): number {
  if (history.length === 0) return 0;

  const start = dateToMs(periodStart);
  const end = dateToMs(periodEnd);
  const totalDays = Math.round((end - start) / MS_PER_DAY) + 1;
  if (totalDays <= 0) return salaryOn(periodStart, history);

  // Build slice boundaries: collect all salary change dates within the period
  const boundaries: string[] = [periodStart];
  for (const entry of history) {
    if (entry.effectiveFrom > periodStart && entry.effectiveFrom <= periodEnd) {
      boundaries.push(entry.effectiveFrom);
    }
  }
  boundaries.push(addDay(periodEnd)); // exclusive end

  let weightedSum = 0;
  for (let i = 0; i < boundaries.length - 1; i++) {
    const sliceStart = boundaries[i]!;
    const sliceEnd = boundaries[i + 1]!;
    const sliceDays = Math.round((dateToMs(sliceEnd) - dateToMs(sliceStart)) / MS_PER_DAY);
    if (sliceDays <= 0) continue;
    const salary = salaryOn(sliceStart, history);
    weightedSum += salary * sliceDays;
  }

  return Math.round(weightedSum / totalDays);
}

/**
 * Returns salary slices for display (only when there are multiple different salaries in the period).
 */
export type SalarySlice = { from: string; to: string; salaryMinor: number };

export function getSalarySlices(
  periodStart: string,
  periodEnd: string,
  history: SalaryHistoryEntry[],
): SalarySlice[] {
  if (history.length === 0) return [];

  const slices: SalarySlice[] = [];
  const boundaries: string[] = [periodStart];
  for (const entry of history) {
    if (entry.effectiveFrom > periodStart && entry.effectiveFrom <= periodEnd) {
      boundaries.push(entry.effectiveFrom);
    }
  }
  boundaries.push(addDay(periodEnd));

  for (let i = 0; i < boundaries.length - 1; i++) {
    const sliceStart = boundaries[i]!;
    const sliceEndExcl = boundaries[i + 1]!;
    const sliceEnd = subtractDay(sliceEndExcl);
    const salary = salaryOn(sliceStart, history);
    if (slices.length > 0 && slices[slices.length - 1]!.salaryMinor === salary) {
      slices[slices.length - 1]!.to = sliceEnd;
    } else {
      slices.push({ from: sliceStart, to: sliceEnd, salaryMinor: salary });
    }
  }

  return slices;
}

const MS_PER_DAY = 86400000;

function dateToMs(localDate: string): number {
  const [y, m, d] = localDate.split('-').map(Number) as [number, number, number];
  return new Date(y, m - 1, d).getTime();
}

function addDay(localDate: string): string {
  const [y, m, d] = localDate.split('-').map(Number) as [number, number, number];
  const next = new Date(y, m - 1, d + 1);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${next.getFullYear()}-${pad(next.getMonth() + 1)}-${pad(next.getDate())}`;
}

function subtractDay(localDate: string): string {
  const [y, m, d] = localDate.split('-').map(Number) as [number, number, number];
  const prev = new Date(y, m - 1, d - 1);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${prev.getFullYear()}-${pad(prev.getMonth() + 1)}-${pad(prev.getDate())}`;
}
