"use client";

import { useEffect, useState } from "react";
import { BadgeEditor } from "@/components/badge/badge-editor";
import { LabelEditor } from "@/components/admin/label-editor";
import { SegmentedButton } from "@/components/m3";

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
 */
type Jenis = "badge" | "label";

export default function BadgeLabelPage() {
	const [jenis, setJenis] = useState<Jenis>("badge");

	// `?jenis=label` dari tautan lama yang menunjuk penyunting label.
	useEffect(() => {
		const timer = window.setTimeout(() => {
			if (new URLSearchParams(window.location.search).get("jenis") === "label") setJenis("label");
		}, 0);
		return () => window.clearTimeout(timer);
	}, []);

	const pilih = (
		<SegmentedButton<Jenis>
			label="Jenis cetakan"
			value={jenis}
			onChange={setJenis}
			options={[{ value: "badge", label: "Badge kertas" }, { value: "label", label: "Label stiker" }]}
		/>
	);

	return (
		<>
			<BadgeEditor pilihJenis={pilih} hidden={jenis !== "badge"} />
			<LabelEditor pilihJenis={pilih} hidden={jenis !== "label"} />
		</>
	);
}
