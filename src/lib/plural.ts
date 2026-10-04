/**
 * "1 participant" / "2 participants". Bentuk jamak tak beraturan diberikan
 * lewat argumen ketiga ("1 entry" / "2 entries"). Dipakai di semua teks admin
 * English supaya tidak ada "participant(s)".
 */
export function plural(n: number, singular: string, pluralForm = `${singular}s`): string {
  return `${n.toLocaleString("en-GB")} ${n === 1 ? singular : pluralForm}`;
}
