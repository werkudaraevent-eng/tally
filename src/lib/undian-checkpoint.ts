/**
 * Status checkpoint satu peserta untuk syarat undian. Modul murni (tanpa
 * server dan tanpa alias @/) supaya bisa diuji di undian-checkpoint.check.ts.
 *
 * Hitungannya sama dengan kartu checkpoint peserta (loadCheckpointPeserta):
 * selesai = pernah dipindai di sesinya atau barangnya sudah diserahkan; poin
 * hanya dihitung saat Points menyala.
 */

export type CheckpointRule = { session_id: number | null; item_id: number | null; points: number | null };

export type CheckpointSettings = { points_enabled: boolean; goal: { points: number } | null };

export function checkpointState(
  settings: CheckpointSettings,
  checkpoints: CheckpointRule[],
  attended: number[],
  picked: Set<number> | undefined,
): { checkpoint_points: number; checkpoint_goal_met: boolean; checkpoints_all_done: boolean } {
  let done = 0;
  let points = 0;
  for (const cp of checkpoints) {
    const finished = cp.session_id !== null ? attended.includes(cp.session_id) : cp.item_id !== null && picked?.has(cp.item_id) === true;
    if (!finished) continue;
    done += 1;
    if (settings.points_enabled) points += cp.points ?? 0;
  }
  return {
    checkpoint_points: points,
    checkpoint_goal_met: settings.points_enabled && settings.goal !== null && points >= settings.goal.points,
    checkpoints_all_done: checkpoints.length > 0 && done === checkpoints.length,
  };
}
