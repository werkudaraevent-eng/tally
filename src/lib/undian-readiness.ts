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

export type ReadinessTab = "data" | "prizes" | "rules" | "display" | "history";

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
  pools: Record<number, { candidates: number; broken_rules?: string[] }>;
  groups: Array<{ id: number; entry_count: number }>;
  activeSession: { id: number; name: string } | null;
  /** Judul layar panggung. Kosong berarti tampilan belum pernah disentuh. */
  pageTitle: string | null;
};

/** Sebutkan paling banyak tiga nama, sisanya diringkas. Daftar sepuluh hadiah
 *  yang ditulis penuh membuat satu baris checklist menjadi paragraf. */
function nameList(names: string[]) {
  if (names.length <= 3) return names.join(", ");
  return `${names.slice(0, 3).join(", ")}, and ${names.length - 3} more`;
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

  // Aturan pengecualian yang pertanyaan formnya sudah hilang: undiannya ditolak
  // server, jadi dikunci di sini juga, dengan sebab yang benar. Tanpa ini hadiahnya
  // masuk daftar "tidak ada peserta yang cocok", yang menyuruh melonggarkan syarat.
  const brokenRules = [...new Set(active.flatMap((prize) => input.pools[prize.id]?.broken_rules ?? []))];
  const noCandidates = active.filter((prize) => (input.pools[prize.id]?.candidates ?? 0) === 0 && !input.pools[prize.id]?.broken_rules?.length);

  const sumberDone = brokenGroup.length === 0;
  const hadiahDone = active.length > 0;
  // Sengaja `false` saat belum ada hadiah aktif: mengatakan "semua hadiah punya
  // kandidat" untuk daftar kosong secara teknis benar dan sama sekali tidak
  // membantu — panel akan menampilkan dua centang hijau pada undian yang belum
  // bisa dijalankan.
  const kandidatDone = hadiahDone && noCandidates.length === 0 && brokenRules.length === 0;

  // Dianotasi eksplisit: tanpa itu `.map()` di bawah melebarkan `id` dan `tab`
  // menjadi `string`, dan tipe kembaliannya berhenti cocok dengan ReadinessStep.
  const steps: ReadinessStep[] = [
    {
      id: "sumber",
      label: "Entry lists ready",
      detail: sumberDone
        ? ""
        : `These prizes use entry lists: ${nameList(brokenGroup.map((prize) => prize.name))}. Their lists are empty or have not been selected. Import the lists in the Entry lists tab.`,
      done: sumberDone,
      // Tidak mengunci: pemeriksaan kandidat di bawah pasti ikut gagal untuk
      // hadiah yang sama, dan dua gembok untuk satu sebab hanya membingungkan.
      blocking: false,
      tab: "data",
    },
    {
      id: "hadiah",
      label: "Prizes ready to draw",
      detail: hadiahDone ? "" : "No active prizes have a winner quota of at least one. Add a prize in the Prizes tab.",
      done: hadiahDone,
      blocking: true,
      tab: "prizes",
    },
    {
      id: "kandidat",
      label: "Every prize has candidates",
      detail: !hadiahDone
        ? "Waiting for an active prize."
        : kandidatDone
          ? ""
          : brokenRules.length > 0
            ? `These exclusion rules use a form question that no longer exists: ${nameList(brokenRules)}. Draws are refused until you fix or turn off these rules.`
            : `No participants match the conditions for these prizes: ${nameList(noCandidates.map((prize) => prize.name))}. Draw requests will fail. Relax the conditions or check the exclusion list.`,
      done: kandidatDone,
      blocking: true,
      tab: brokenRules.length > 0 ? "rules" : "prizes",
    },
    {
      id: "sesi",
      label: "Active draw session",
      detail: input.activeSession
        ? ""
        : "No active session. Draws can still run, but results will be ungrouped. You can group them into a session later.",
      done: input.activeSession !== null,
      blocking: false,
      tab: "history",
    },
    {
      id: "panggung",
      label: "Stage screen configured",
      detail: input.pageTitle?.trim()
        ? ""
        : "The stage screen title is empty. The audience will see a screen without an event title.",
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
      ? `${entryTotal} entries from ${input.groups.length} saved entry lists.`
      : step.detail,
  }));
}

/** Benar bila halaman kontrol boleh dibuka. */
export function undianCanRun(steps: ReadinessStep[]) {
  return steps.every((step) => !step.blocking || step.done);
}
