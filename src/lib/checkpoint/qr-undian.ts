/**
 * Apakah pohon syarat undian (undian_prizes.conditions, atau satu aturan tiket
 * tambahan) bisa dipenuhi lewat check-in di sesi ini. Dipakai untuk peringatan
 * di Check-in > Checkpoints saat QR checkpoint sesi itu dibuat tetap (dicetak):
 * siapa pun yang punya foto posternya bisa check-in tanpa datang.
 *
 * Yang dihitung: check-in di sesi ini atau sesi mana pun, jumlah scan, dan
 * semua syarat checkpoint (poin, tujuan poin, semua selesai), karena checkpoint
 * sesi ini ikut di dalamnya. Pohon yang rusak dianggap tidak memakai.
 */
export function undianMemakaiSesi(pohon: unknown, sesiId: number, dalam = 0): boolean {
  if (dalam > 20 || typeof pohon !== "object" || pohon === null) return false;
  const simpul = pohon as Record<string, unknown>;
  if (Array.isArray(simpul.children)) return simpul.children.some((anak) => undianMemakaiSesi(anak, sesiId, dalam + 1));
  if (simpul.children !== undefined) return false;
  switch (simpul.var) {
    case "checked_in":
      return simpul.session_id === undefined || simpul.session_id === null || Number(simpul.session_id) === sesiId;
    case "scan_count":
    case "checkpoint_points":
    case "checkpoint_goal":
    case "checkpoints_all":
      return true;
    default:
      return false;
  }
}

/** Nama hadiah undian yang syarat atau tiket tambahannya memakai kehadiran sesi ini. */
export function hadiahMemakaiSesi(hadiah: { name: string; conditions: unknown; bonus_rules?: unknown }[], sesiId: number): string[] {
  return hadiah
    .filter((h) => {
      if (undianMemakaiSesi(h.conditions, sesiId)) return true;
      const aturan = Array.isArray(h.bonus_rules) ? h.bonus_rules : [];
      return aturan.some((a) => typeof a === "object" && a !== null && (a as { source?: unknown }).source === "conditions" && undianMemakaiSesi((a as { conditions?: unknown }).conditions, sesiId));
    })
    .map((h) => h.name);
}
