"use client";

import { Info, Printer, Trash } from "@phosphor-icons/react";
import { useState } from "react";
import { Button, Dialog, SelectField, TextField } from "@/components/m3";
import { GESER_MAKS, printerBaru, type ProfilPrinter } from "@/lib/badge/printer";

/**
 * Tambah atau ubah profil printer badge.
 *
 * Kalimat pembukanya jujur tentang batasnya: halaman web tidak memilih printer.
 * Yang disimpan di sini hanya kertasnya, gramatur maksimum (supaya format kertas
 * tebal memperingatkan sebelum kertas macet), dan koreksi geser hasil kalibrasi.
 */
export function PrinterDialog({
	awal, slug, onClose, onSimpan, onHapus,
}: {
	awal: ProfilPrinter | null;
	slug: string;
	onClose: () => void;
	onSimpan: (profil: ProfilPrinter) => void;
	onHapus: (id: string) => void;
}) {
	const [p, setP] = useState<ProfilPrinter>(() => awal ?? printerBaru());
	const [geser, setGeser] = useState({ x: String(p.geser_x).replace(".", ","), y: String(p.geser_y).replace(".", ",") });
	const ubah = (patch: Partial<ProfilPrinter>) => setP((c) => ({ ...c, ...patch }));

	const angka = (teks: string) => {
		const n = Number(teks.replace(",", "."));
		return Number.isFinite(n) ? Math.min(GESER_MAKS, Math.max(-GESER_MAKS, Math.round(n * 2) / 2)) : 0;
	};

	function kalibrasi() {
		// Halaman kalibrasi tidak memakai koreksi apa pun, jadi yang terukur adalah printernya sendiri.
		window.open(`/e/${encodeURIComponent(slug)}/cetak-badge?mode=kalibrasi&kertas=${p.kertas}&cetak=1`, "_blank");
		ubah({ dikalibrasi: true });
	}

	function simpan() {
		const x = angka(geser.x);
		const y = angka(geser.y);
		onSimpan({ ...p, nama: p.nama.trim() || p.model.trim() || "Printer", model: p.model.trim(), geser_x: x, geser_y: y, dikalibrasi: p.dikalibrasi || x !== 0 || y !== 0 });
	}

	return (
		<Dialog
			open
			onClose={onClose}
			size="xl"
			title={awal ? "Ubah printer" : "Tambah printer"}
			description="Badge dicetak lewat dialog cetak di laptop atau ponsel, jadi printer kantor apa pun bisa dipakai. Printernya dipilih di dialog itu; di sini hanya disimpan kertasnya dan koreksi posisinya."
			actions={
				<>
					{awal ? (
						<Button variant="text" size="sm" icon={<Trash size={16} />} className="mr-auto text-error" onClick={() => onHapus(awal.id)}>Hapus</Button>
					) : null}
					<Button variant="outlined" size="sm" onClick={onClose}>Batal</Button>
					<Button size="sm" onClick={simpan}>Simpan printer</Button>
				</>
			}
		>
			<div className="flex flex-col gap-4">
				<div className="grid gap-3 sm:grid-cols-2">
					<TextField label="Nama" placeholder="Meja registrasi 1" value={p.nama} maxLength={60} onChange={(e) => ubah({ nama: e.target.value })} />
					<TextField label="Merek dan model" placeholder="Brother HL-L2370" value={p.model} maxLength={60} onChange={(e) => ubah({ model: e.target.value })} />
				</div>
				<div className="grid gap-3 sm:grid-cols-3">
					<SelectField label="Jenis" value={p.jenis} onChange={(e) => ubah({ jenis: e.target.value === "inkjet" ? "inkjet" : "laser" })}>
						<option value="laser">Laser</option>
						<option value="inkjet">Inkjet</option>
					</SelectField>
					<TextField
						label="Gramatur maksimum (g)"
						type="number"
						min={60}
						max={350}
						value={p.gsm_maks}
						onChange={(e) => ubah({ gsm_maks: Math.min(350, Math.max(60, Number(e.target.value) || 60)) })}
					/>
					<SelectField label="Kertas yang dimasukkan" value={p.kertas} onChange={(e) => ubah({ kertas: e.target.value === "A5" ? "A5" : "A4" })}>
						<option value="A4">A4</option>
						<option value="A5">A5</option>
					</SelectField>
				</div>
				<p className="-mt-2 text-body-medium text-on-surface-variant">Cek gramatur maksimum di manual printer. Ukuran kertas harus sama dengan format badge.</p>

				<p className="flex items-start gap-2 rounded-md bg-warning-soft p-3 text-body-medium text-on-surface">
					<Info size={16} className="mt-0.5 shrink-0 text-warning" />
					{p.jenis === "laser" ? (
						<span>
							<span className="font-semibold">Printer laser:</span> kertas maksimal sesuai spesifikasi printer, di sini {p.gsm_maks} g. Pakai art paper atau ivory doff lewat
							baki manual, dan pilih jenis kertas Tebal/Heavy di pengaturan printer. Kertas foto inkjet jangan dimasukkan ke laser.
						</span>
					) : (
						<span>
							<span className="font-semibold">Printer inkjet:</span> kertas foto doff atau matte paper, bukan glossy, supaya QR tidak memantulkan lampu. Biarkan tinta kering
							satu menit sebelum dilipat, atau lipatannya luntur.
						</span>
					)}
				</p>

				<div>
					<h3 className="text-body-medium font-semibold text-on-surface">Kalibrasi</h3>
					<ol className="mt-2 flex list-decimal flex-col gap-1.5 rounded-md bg-surface-container-high p-4 pl-8 text-body-medium text-on-surface">
						<li><span className="font-semibold">Cetak halaman kalibrasi</span> dengan printer ini. Di dialog cetak pilih Ukuran sebenarnya atau skala 100%.</li>
						<li><span className="font-semibold">Ukur garis 100 mm.</span> Kalau tidak tepat 100 mm, skalanya belum 100%. Ubah setelan itu lalu cetak ulang.</li>
						<li>
							<span className="font-semibold">Ukur tanda sudut.</span> Jaraknya harus 10 mm dari tepi kertas. Tanda kiri 11 mm berarti cetakan bergeser 1 mm ke kanan: isi
							Geser ke kanan −1.
						</li>
					</ol>
					<Button variant="outlined" size="sm" className="mt-3" icon={<Printer size={16} />} onClick={kalibrasi}>Cetak halaman kalibrasi</Button>
				</div>

				<div className="grid gap-3 sm:grid-cols-2">
					<TextField label="Geser ke kanan (mm)" inputMode="decimal" value={geser.x} onChange={(e) => setGeser((g) => ({ ...g, x: e.target.value }))} hint="Minus untuk ke kiri." />
					<TextField label="Geser ke bawah (mm)" inputMode="decimal" value={geser.y} onChange={(e) => setGeser((g) => ({ ...g, y: e.target.value }))} hint="Minus untuk ke atas." />
				</div>
				<p className="text-body-medium text-on-surface-variant">
					Halaman web tidak bisa memilih printer, baki, atau jenis kertas. Atur sekali di laptop meja: printer bawaan, ukuran kertas, baki manual, jenis kertas Tebal.
				</p>
			</div>
		</Dialog>
	);
}
