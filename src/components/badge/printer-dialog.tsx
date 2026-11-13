"use client";

import { Info, Printer, Trash } from "@phosphor-icons/react";
import { useState } from "react";
import { Button, Dialog, SegmentedField, TextField } from "@/components/m3";
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
			title={awal ? "Edit printer" : "Add printer"}
			description="Badges print through the print dialog on a laptop or phone, so any office printer works. The printer is chosen in that dialog; here you only save its paper and position correction."
			actions={
				<>
					{awal ? (
						<Button variant="text" size="sm" icon={<Trash size={16} />} className="mr-auto text-error" onClick={() => onHapus(awal.id)}>Delete</Button>
					) : null}
					<Button variant="outlined" size="sm" onClick={onClose}>Cancel</Button>
					<Button size="sm" onClick={simpan}>Save printer</Button>
				</>
			}
		>
			<div className="flex flex-col gap-4">
				<div className="grid gap-3 sm:grid-cols-2">
					<TextField label="Name" placeholder="Check-in desk 1" value={p.nama} maxLength={60} onChange={(e) => ubah({ nama: e.target.value })} />
					<TextField label="Make and model" placeholder="Brother HL-L2370" value={p.model} maxLength={60} onChange={(e) => ubah({ model: e.target.value })} />
				</div>
				<div className="grid gap-3 sm:grid-cols-3">
					<SegmentedField
						label="Type"
						value={p.jenis === "inkjet" ? "inkjet" : "laser"}
						onChange={(jenis) => ubah({ jenis })}
						options={[{ value: "laser", label: "Laser" }, { value: "inkjet", label: "Inkjet" }]}
					/>
					<TextField
						label="Max paper weight (g)"
						type="number"
						min={60}
						max={350}
						value={p.gsm_maks}
						onChange={(e) => ubah({ gsm_maks: Math.min(350, Math.max(60, Number(e.target.value) || 60)) })}
					/>
					<SegmentedField
						label="Paper loaded"
						value={p.kertas === "A5" ? "A5" : "A4"}
						onChange={(kertas) => ubah({ kertas })}
						options={[{ value: "A4", label: "A4" }, { value: "A5", label: "A5" }]}
					/>
				</div>
				<p className="-mt-2 text-body-medium text-on-surface-variant">Check the maximum paper weight in the printer manual. The paper size must match the badge format.</p>

				<p className="flex items-start gap-2 rounded-md bg-warning-soft p-3 text-body-medium text-on-surface">
					<Info size={16} className="mt-0.5 shrink-0 text-warning" />
					{p.jenis === "laser" ? (
						<span>
							<span className="font-semibold">Laser printer:</span> paper up to the printer&apos;s spec, here {p.gsm_maks} g. Use art paper or matte ivory through
							the manual tray, and choose the Heavy paper type in the printer settings. Never put inkjet photo paper in a laser printer.
						</span>
					) : (
						<span>
							<span className="font-semibold">Inkjet printer:</span> matte photo paper, not glossy, so the QR doesn&apos;t reflect the lights. Let the ink dry
							for a minute before folding, or the fold smudges.
						</span>
					)}
				</p>

				<div>
					<h3 className="text-body-medium font-semibold text-on-surface">Calibration</h3>
					<ol className="mt-2 flex list-decimal flex-col gap-1.5 rounded-md bg-surface-container-high p-4 pl-8 text-body-medium text-on-surface">
						<li><span className="font-semibold">Print the calibration page</span> on this printer. In the print dialog choose Actual size or 100% scale.</li>
						<li><span className="font-semibold">Measure the 100 mm line.</span> If it isn&apos;t exactly 100 mm, the scale isn&apos;t 100% yet. Change that setting and print again.</li>
						<li>
							<span className="font-semibold">Measure the corner marks.</span> They should be 10 mm from the paper edge. A left mark at 11 mm means the print shifted 1 mm to the right: enter
							Move right −1.
						</li>
					</ol>
					<Button variant="outlined" size="sm" className="mt-3" icon={<Printer size={16} />} onClick={kalibrasi}>Print calibration page</Button>
				</div>

				<div className="grid gap-3 sm:grid-cols-2">
					<TextField label="Move right (mm)" inputMode="decimal" value={geser.x} onChange={(e) => setGeser((g) => ({ ...g, x: e.target.value }))} hint="Negative moves left." />
					<TextField label="Move down (mm)" inputMode="decimal" value={geser.y} onChange={(e) => setGeser((g) => ({ ...g, y: e.target.value }))} hint="Negative moves up." />
				</div>
				<p className="text-body-medium text-on-surface-variant">
					A web page can&apos;t choose the printer, tray or paper type. Set them once on the desk laptop: default printer, paper size, manual tray, Heavy paper type.
				</p>
			</div>
		</Dialog>
	);
}
