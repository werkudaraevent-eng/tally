"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/toast";
import { withEventPrefix } from "@/lib/event-path";
import { stayPerPeserta } from "@/lib/logistik/stay";
import { timeZoneOffset } from "@/lib/timezone";
import { useEventTimeZone } from "@/lib/use-event-timezone";
import { plural } from "@/lib/plural";
import type { Kirim } from "./bersama";
import { DialogImpor } from "./dialog-impor";
import { DialogStays, hitungPenghuni } from "./stay";
import { DialogBus, DialogKamar, DialogLepasBus, DialogLepasKamar } from "./tab-penempatan";
import { useLogistik } from "./use-logistik";

/**
 * Dialog Logistik yang dibuka dari Daftar peserta (permintaan Hanung
 * 2026-10-23): hotel, kamar, dan bus diubah tanpa pindah ke halaman Logistics.
 *
 * Satu mesin, banyak pintu. Dialognya PERSIS dialog di tab Assignments
 * (Assign to hotel, Assign to bus, Stays, lepas hotel/bus, impor Excel), dengan
 * data dan cara menulis yang sama (`useLogistik`). Jadi aturan kapasitas kamar,
 * jenis kelamin, dan malam yang bertabrakan hanya ada di satu tempat; Daftar
 * peserta tidak punya aturan logistik sendiri.
 *
 * Datanya dimuat ulang setiap kali sebuah dialog dibuka, supaya sisa tempat
 * kamar dan bus tidak basi sejak halaman dibuka.
 */

export type AksiLogistik =
  | { jenis: "kamar" | "bus" | "lepas-kamar" | "lepas-bus" | "stays"; ids: string[] }
  | { jenis: "impor" };

export function LogistikDariPeserta({ aksi, onClose, onChanged }: {
  aksi: AksiLogistik | null;
  onClose: () => void;
  /** Dipanggil bila ada yang tersimpan: Daftar peserta memuat ulang kolomnya. Stays memanggilnya
   *  sesudah tiap simpan (dialognya tetap terbuka); dialog lain sesudah ditutup. */
  onChanged: () => void;
}) {
  const { data, busy, muat, kirim } = useLogistik();
  const [siapUntuk, setSiapUntuk] = useState<AksiLogistik | null>(null);
  const berubah = useRef(false);
  const toast = useToast();
  const router = useRouter();
  const { zone } = useEventTimeZone();
  const offset = timeZoneOffset(zone);

  // Muat segar setiap kali dialog dibuka; dialognya baru tampil sesudah data siap.
  useEffect(() => {
    if (!aksi || aksi.jenis === "impor") return;
    let batal = false;
    void muat().then(() => { if (!batal) setSiapUntuk(aksi); });
    return () => { batal = true; };
  }, [aksi, muat]);

  const kirimCatat: Kirim = async (path, method, body) => {
    const hasil = await kirim(path, method, body);
    if (hasil === null) return hasil;
    // Stays tetap terbuka untuk beberapa ubahan; kolom daftar langsung ikut, tidak menunggu ditutup.
    if (aksi?.jenis === "stays") onChanged();
    else berubah.current = true;
    return hasil;
  };

  function tutup() {
    setSiapUntuk(null);
    onClose();
    if (berubah.current) { berubah.current = false; onChanged(); }
  }

  const ids = useMemo(() => (aksi && aksi.jenis !== "impor" ? aksi.ids : []), [aksi]);
  const siap = Boolean(data && aksi && aksi.jenis !== "impor" && siapUntuk === aksi);

  const hotelById = useMemo(() => new Map((data?.hotels ?? []).map((h) => [h.id, h])), [data?.hotels]);
  const stayPeserta = useMemo(() => stayPerPeserta(data?.lodging ?? [], hotelById), [data?.lodging, hotelById]);
  const busPeserta = useMemo(
    () => new Map((data?.transport ?? []).filter((b) => b.trip_id === null && b.vehicle_id !== null).map((b) => [b.participant_id, b.vehicle_id as number])),
    [data?.transport],
  );
  // Peserta yang dihapus di sumber tidak ada di data Logistik dan tidak bisa ditempatkan.
  const orang = useMemo(() => {
    const pilih = new Set(ids);
    return (data?.participants ?? []).filter((o) => pilih.has(o.id));
  }, [data?.participants, ids]);

  const lewat = ids.length - orang.length;
  const semuaTerhapus = siap && ids.length > 0 && orang.length === 0;
  useEffect(() => {
    if (!siap || lewat === 0) return;
    if (orang.length === 0) {
      // Tidak ada yang bisa diubah: jangan buka dialog kosong.
      toast.warning(
        ids.length === 1 ? "This participant was deleted at source" : "All selected participants were deleted at source",
        "Deleted participants cannot be placed in hotels or buses.",
      );
      onClose();
      return;
    }
    toast.info(`${plural(lewat, "participant")} skipped`, "Participants deleted at source cannot be placed in hotels or buses.");
  }, [siap, lewat, orang.length, ids.length, toast, onClose]);

  const keLogistik = (tab: "kamar" | "bus") => { tutup(); router.push(withEventPrefix(`/admin/logistik?tab=${tab}`, window.location.pathname)); };
  const selesai = (hasil: unknown) => { if (hasil !== null) tutup(); };

  if (aksi?.jenis === "impor") {
    return <DialogImpor open jenisAwal="kamar" onClose={tutup} onSelesai={async () => { berubah.current = true; }} />;
  }
  if (!siap || !data || !aksi || semuaTerhapus) return null;

  return (
    <>
      <DialogKamar
        open={aksi.jenis === "kamar"}
        orang={orang}
        data={data}
        busy={busy}
        onClose={tutup}
        keTabKamar={() => keLogistik("kamar")}
        stayPeserta={stayPeserta}
        offset={offset}
        simpan={async (tujuan, malam) => {
          const hasil = await kirimCatat("/api/admin/logistik/penghuni", "POST", tujuan.jenis === "kamar"
            ? { room_id: tujuan.kamar.id, participant_ids: orang.map((o) => o.id), ...(malam ?? {}) }
            : { hotel_id: tujuan.hotel.id, participant_ids: orang.map((o) => o.id), ...(malam ?? {}) });
          return hasil !== null;
        }}
      />
      <DialogBus
        open={aksi.jenis === "bus"}
        orang={orang}
        data={data}
        busPeserta={busPeserta}
        busy={busy}
        onClose={tutup}
        keTabBus={() => keLogistik("bus")}
        simpan={async (bus) => (await kirimCatat("/api/admin/logistik/penumpang", "POST", { trip_id: null, vehicle_id: bus.id, participant_ids: orang.map((o) => o.id) })) !== null}
      />
      <DialogStays
        orang={aksi.jenis === "stays" ? orang[0] ?? null : null}
        stays={orang[0] ? stayPeserta.get(orang[0].id) ?? [] : []}
        hotels={data.hotels}
        rooms={data.rooms}
        penghuni={hitungPenghuni(data.lodging, data.participants)}
        offset={offset}
        busy={busy}
        kirim={kirimCatat}
        onClose={tutup}
      />
      <DialogLepasKamar open={aksi.jenis === "lepas-kamar"} orang={orang.filter((o) => stayPeserta.has(o.id))} busy={busy} kirim={kirimCatat} onClose={tutup} onSelesai={selesai} />
      <DialogLepasBus open={aksi.jenis === "lepas-bus"} orang={orang.filter((o) => busPeserta.has(o.id))} busy={busy} kirim={kirimCatat} onClose={tutup} onSelesai={selesai} />
    </>
  );
}
