"use client";

import { useCallback, useEffect, useState } from "react";
import { BadgeEditor, type Meja } from "@/components/badge/badge-editor";
import { LabelEditor } from "@/components/admin/label-editor";
import { SegmentedButton } from "@/components/m3";
import { useToast } from "@/components/toast";
import { eventApiPath } from "@/lib/event-url";

/**
 * Badge & label: dua cara mencetak tanda pengenal tamu.
 *
 * Badge kertas dicetak di printer kantor lewat dialog cetak dan dilipat; label
 * stiker dicetak ke printer termal NIIMBOT dari layar pemindai. Satu menu, dua
 * penyunting, karena panitia memilih salah satu per acara dan bertanya di
 * tempat yang sama.
 *
 * Kedua penyunting tetap terpasang saat berpindah, hanya disembunyikan: pindah
 * tab tidak boleh membuang perubahan yang belum disimpan.
 *
 * Pilihan "yang dicetak di meja registrasi" dipegang di sini, bukan di salah
 * satu penyunting, karena keduanya membacanya: label stiker menyimpannya sebagai
 * `enabled` setiap kali Simpan ditekan.
 */
type Jenis = "badge" | "label";

export default function BadgeLabelPage() {
	const [jenis, setJenis] = useState<Jenis>("badge");
	const [meja, setMeja] = useState<Meja | null>(null);
	const [labelUkuran, setLabelUkuran] = useState<string | null>(null);
	const toast = useToast();

	useEffect(() => {
		const timer = window.setTimeout(() => {
			// `?jenis=label` dari tautan lama yang menunjuk penyunting label.
			if (new URLSearchParams(window.location.search).get("jenis") === "label") setJenis("label");
			void fetch(eventApiPath("/api/admin/badge/meja"), { cache: "no-store" })
				.then((r) => (r.ok ? r.json() : null))
				.then((body: { meja: Meja } | null) => { if (body) setMeja(body.meja); })
				.catch(() => undefined);
			void fetch(eventApiPath("/api/admin/label"), { cache: "no-store" })
				.then((r) => (r.ok ? r.json() : null))
				.then((body: { settings: { width_mm: number; height_mm: number } } | null) => {
					if (body) setLabelUkuran(`${body.settings.width_mm} × ${body.settings.height_mm} mm`);
				})
				.catch(() => undefined);
		}, 0);
		return () => window.clearTimeout(timer);
	}, []);

	const ubahMeja = useCallback(async (berikut: Meja) => {
		const sebelum = meja;
		setMeja(berikut);
		const response = await fetch(eventApiPath("/api/admin/badge/meja"), {
			method: "PUT",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ meja: berikut }),
		}).catch(() => null);
		const body = await response?.json().catch(() => null);
		if (!response?.ok) {
			setMeja(sebelum);
			toast.error("Not saved", body?.error?.message ?? "Connection failed. Try again.");
			return;
		}
		setMeja(body.meja as Meja);
		toast.success("Saved", berikut === "label" ? "The scan screen offers label printing after a reload." : "Check-in desk choice updated.");
	}, [meja, toast]);

	const pilih = (
		<SegmentedButton<Jenis>
			label="Print type"
			value={jenis}
			onChange={setJenis}
			options={[{ value: "badge", label: "Paper badge" }, { value: "label", label: "Sticker label", badge: labelUkuran ?? undefined }]}
		/>
	);

	return (
		<>
			<BadgeEditor pilihJenis={pilih} hidden={jenis !== "badge"} meja={meja} ubahMeja={(m) => void ubahMeja(m)} labelUkuran={labelUkuran} />
			<LabelEditor pilihJenis={pilih} hidden={jenis !== "label"} labelDiMeja={meja === "label"} />
		</>
	);
}
