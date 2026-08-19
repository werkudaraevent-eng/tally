// Kesiapan undian: apa yang masih kurang sebelum tombol Undi ditekan di depan
// penonton.
//
// Kenapa modul terpisah dan bukan beberapa `useMemo` di halaman: aturannya
// menentukan apakah tombol "Buka kontrol undian" terkunci, dan aturan yang
// mengunci sesuatu harus bisa diuji tanpa merender React. Berkas
// `undian-readiness.check.ts` menjalankannya lewat `npm run check`.
//
// Prinsip yang dipegang: HANYA dua keadaan yang mengunci, yaitu dua keadaan yang
// membuat tombol Undi PASTI gagal di atas panggung. Sisanya peringatan. Mengunci
// hal yang sebenarnya masih bisa jalan mengajari orang bahwa peringatan di
// aplikasi ini boleh diabaikan, dan pelajaran itu terbawa ke peringatan yang
// benar-benar penting.

export type ReadinessTab = "data" | "prizes" | "display" | "history";

export type ReadinessStep = {
  id: "sumber" | "hadiah" | "kandidat" | "sesi" | "panggung";
  /** Judul singkat; kalimat keadaan, bukan perintah. */
  label: string;
  /** Yang harus dilakukan bila belum beres. Kosong saat sudah beres. */
  detail: string;
  done: boolean;
  /**
   * Menghalangi masuk ke halaman kontrol.
   *
   * `blocking` tidak sama dengan `!done`: langkah sesi dan panggung boleh belum
   * beres tanpa mengunci apa pun.
   */
  blocking: boolean;
  /** Tab yang membereskannya. Panel menautkan ke sini. */
  tab: ReadinessTab;
};

export type ReadinessPrize = {
  id: number;
  name: string;
  is_active: boolean;
  winner_quota: number;
  source: "participants" | "entries";
  entry_group_id: number | null;
};

export type ReadinessInput = {
  prizes: ReadinessPrize[];
  /** Dari `/api/admin/undian/prizes?pool=1`. Kunci = id hadiah. */
  pools: Record<number, { candidates: number }>;
  groups: Array<{ id: number; entry_count: number }>;
  activeSession: { id: number; name: string } | null;
  /** Judul layar panggung. Kosong berarti tampilan belum pernah disentuh. */
  pageTitle: string | null;
};

/** Sebutkan paling banyak tiga nama, sisanya diringkas. Daftar sepuluh hadiah
 *  yang ditulis penuh membuat satu baris checklist menjadi paragraf. */
function nameList(names: string[]) {
  if (names.length <= 3) return names.join(", ");
  return `${names.slice(0, 3).join(", ")}, dan ${names.length - 3} lainnya`;
}

export function undianReadiness(input: ReadinessInput): ReadinessStep[] {
  const active = input.prizes.filter((prize) => prize.is_active && prize.winner_quota > 0);
  const entryTotal = input.groups.reduce((sum, group) => sum + group.entry_count, 0);

  // Hadiah bersumber daftar entri yang grupnya kosong atau belum dipilih.
  // Dipisah dari pemeriksaan kandidat karena jalan keluarnya berbeda: yang ini
  // dibereskan di tab Sumber data, yang itu dengan melonggarkan syarat hadiah.
  const brokenGroup = active.filter((prize) => {
    if (prize.source !== "entries") return false;
    const group = input.groups.find((candidate) => candidate.id === prize.entry_group_id);
    return !group || group.entry_count === 0;
  });

  const noCandidates = active.filter((prize) => (input.pools[prize.id]?.candidates ?? 0) === 0);

  const sumberDone = brokenGroup.length === 0;
  const hadiahDone = active.length > 0;
  // Sengaja `false` saat belum ada hadiah aktif: mengatakan "semua hadiah punya
  // kandidat" untuk daftar kosong secara teknis benar dan sama sekali tidak
  // membantu — panel akan menampilkan dua centang hijau pada undian yang belum
  // bisa dijalankan.
  const kandidatDone = hadiahDone && noCandidates.length === 0;

  // Dianotasi eksplisit: tanpa itu `.map()` di bawah melebarkan `id` dan `tab`
  // menjadi `string`, dan tipe kembaliannya berhenti cocok dengan ReadinessStep.
  const steps: ReadinessStep[] = [
    {
      id: "sumber",
      label: "Sumber peserta tersedia",
      detail: sumberDone
        ? ""
        : `Hadiah ${nameList(brokenGroup.map((prize) => prize.name))} diundi dari daftar entri, tetapi daftarnya belum dipilih atau masih kosong. Impor daftarnya di tab Sumber data.`,
      done: sumberDone,
      // Tidak mengunci: pemeriksaan kandidat di bawah pasti ikut gagal untuk
      // hadiah yang sama, dan dua gembok untuk satu sebab hanya membingungkan.
      blocking: false,
      tab: "data",
    },
    {
      id: "hadiah",
      label: "Ada hadiah siap diundi",
      detail: hadiahDone ? "" : "Belum ada hadiah aktif dengan kuota pemenang minimal satu. Tambahkan di tab Hadiah & syarat.",
      done: hadiahDone,
      blocking: true,
      tab: "prizes",
    },
    {
      id: "kandidat",
      label: "Setiap hadiah punya kandidat",
      detail: !hadiahDone
        ? "Menunggu hadiah aktif."
        : kandidatDone
          ? ""
          : `Syarat hadiah ${nameList(noCandidates.map((prize) => prize.name))} tidak cocok dengan satu peserta pun, jadi tombol Undi akan gagal. Longgarkan syaratnya atau periksa daftar pengecualian.`,
      done: kandidatDone,
      blocking: true,
      tab: "prizes",
    },
    {
      id: "sesi",
      label: "Sesi undian dibuka",
      detail: input.activeSession
        ? ""
        : "Belum ada sesi berjalan. Undian tetap bisa dijalankan — hasilnya saja yang tidak terkelompok, dan bisa dirapikan belakangan lewat adopsi sesi.",
      done: input.activeSession !== null,
      blocking: false,
      tab: "history",
    },
    {
      id: "panggung",
      label: "Layar panggung diatur",
      detail: input.pageTitle?.trim()
        ? ""
        : "Judul layar panggung masih kosong. Penonton akan melihat layar tanpa judul acara.",
      done: Boolean(input.pageTitle?.trim()),
      blocking: false,
      tab: "display",
    },
  ];

  return steps.map((step) => ({
    ...step,
    // Ringkasan entri disisipkan di sini supaya kalimatnya ikut berubah saat
    // daftar bertambah, tanpa menduplikasi logika hitung di komponen.
    detail: step.id === "sumber" && step.done && entryTotal > 0
      ? `${entryTotal} entri dari ${input.groups.length} daftar tersimpan.`
      : step.detail,
  }));
}

/** Benar bila halaman kontrol boleh dibuka. */
export function undianCanRun(steps: ReadinessStep[]) {
  return steps.every((step) => !step.blocking || step.done);
}
