import type { IconProps } from "@phosphor-icons/react";
import { Airplane, Boat, Ticket, Train } from "@phosphor-icons/react/dist/ssr";
import type { ModaTiket } from "@/lib/logistik/types";

type Moda = ModaTiket | "campur" | null | undefined;

/** Ikon tiket per moda di Area peserta; campuran = tiket. Kereta tetap ikon kereta yang sama. */
export function ikonModa(moda: Moda): typeof Train {
  return moda === "flight" ? Airplane : moda === "ship" ? Boat : moda === "campur" ? Ticket : Train;
}

/** Sama dengan `ikonModa`, sebagai komponen untuk dirender langsung. */
export function IkonModa({ moda, ...props }: IconProps & { moda: Moda }) {
  if (moda === "flight") return <Airplane {...props} />;
  if (moda === "ship") return <Boat {...props} />;
  if (moda === "campur") return <Ticket {...props} />;
  return <Train {...props} />;
}
