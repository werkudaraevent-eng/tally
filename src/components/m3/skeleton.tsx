import { cx } from "@/lib/m3/cx";

/** Balok abu-abu berkilau pengganti isi yang masih dimuat. Ukurannya dari `className`. */
export function Skeleton({ className }: { className?: string }) {
  return <span aria-hidden className={cx("block rounded bg-surface-container-high shimmer", className)} />;
}
