/**
 * Label kelompok baris Agenda di halaman acara sebelum masuk ("Batch 1"),
 * dari AgendaItem.untuk. Garis tipis mengikuti warna teks tema, jadi satu
 * komponen terbaca di semua preset. Inline setelah judul dan tidak terpotong:
 * jawaban panjang turun ke baris berikut bersama judulnya.
 */
export function LabelUntuk({ teks, className = "" }: { teks: string | null | undefined; className?: string }) {
  if (!teks) return null;
  return (
    <span
      className={`ml-2 inline-block rounded-[4px] border border-current/40 px-1.5 align-[1px] text-[12px] font-medium leading-[18px] tracking-normal whitespace-nowrap ${className}`}
    >
      {teks}
    </span>
  );
}
