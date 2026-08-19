"use client";

import { Desktop, Moon, Sun } from "@phosphor-icons/react";
import { useSyncExternalStore } from "react";
import { applyTheme, readTheme, type ThemePreference } from "@/lib/m3/theme";

const OPTIONS: { value: ThemePreference; label: string; Icon: typeof Sun }[] = [
	{ value: "light", label: "Terang", Icon: Sun },
	{ value: "dark", label: "Gelap", Icon: Moon },
	{ value: "system", label: "Sistem", Icon: Desktop },
];

/**
 * Sumber kebenaran tema adalah atribut `data-theme` di <html>, bukan state React.
 *
 * Atribut itu sudah ditulis oleh skrip di <head> sebelum React jalan, dan CSS
 * membacanya langsung. Menyalinnya ke useState berarti ada dua sumber yang bisa
 * berbeda; mengamatinya lewat useSyncExternalStore berarti hanya ada satu, dan
 * tombol ini tetap benar meski ada kode lain yang mengubah tema.
 */
function subscribe(onChange: () => void) {
	const observer = new MutationObserver(onChange);
	observer.observe(document.documentElement, { attributeFilter: ["data-theme"] });
	return () => observer.disconnect();
}

/**
 * Pemilih tema bergaya connected button group M3.
 *
 * Tiga pilihan ditampilkan sekaligus, bukan satu tombol yang berputar. Tombol
 * berputar tidak pernah bisa memberi tahu bahwa pilihan "ikut sistem" ada, dan
 * pengguna yang sudah mengunci terang tidak punya jalan kembali selain menebak
 * berapa kali harus menekan.
 */
export function ThemeToggle({ className = "", compact = false }: { className?: string; compact?: boolean }) {
	// Snapshot server selalu "system": di server tidak ada <html> untuk dibaca,
	// dan menebak akan membuat markup server berbeda dari klien.
	const preference = useSyncExternalStore(subscribe, readTheme, () => "system" as ThemePreference);

	return (
		<div
			role="radiogroup"
			aria-label="Tema tampilan"
			className={`flex items-center gap-1 rounded-2xl bg-surface-container p-1 ${className}`}
		>
			{OPTIONS.map(({ value, label, Icon }) => {
				const selected = preference === value;
				return (
					<button
						key={value}
						type="button"
						role="radio"
						aria-checked={selected}
						onClick={() => applyTheme(value)}
						// Label tetap ada untuk pembaca layar walau teksnya disembunyikan;
						// `title` menanggung penjelasan bagi yang memakai tetikus.
						aria-label={label}
						title={label}
						// Sudut ikut berubah saat terpilih — shape morph M3 Expressive.
						// Ini penanda kedua di samping warna, jadi statusnya masih
						// terbaca ketika warna gagal membedakan (kontras rendah, layar
						// proyektor, penglihatan warna terbatas).
						className={`m3-state flex min-h-11 min-w-0 flex-1 items-center justify-center gap-2 px-2 text-label-large transition-[border-radius,background-color,color] duration-300 ease-emphasized ${
							selected
								? "rounded-lg bg-primary text-on-primary"
								: "rounded-2xl text-on-surface-variant"
						}`}
					>
						<Icon size={20} weight={selected ? "fill" : "regular"} className="shrink-0" aria-hidden />
						{/* Ikon saja di ruang sempit. Tiga label penuh butuh ~306px; rel
						    navigasi admin hanya menyediakan 248px, dan teksnya keluar dari
						    tepi rel alih-alih terpotong.
						
						    Labelnya disembunyikan lewat kelas, bukan dengan merender dua
						    komponen berbeda per lebar layar: dua radiogroup di DOM berarti
						    pembaca layar menemukan dua pemilih tema, dan yang satu tidak
						    pernah terlihat. */}
						<span className={compact ? "sr-only" : "hidden truncate sm:inline"}>{label}</span>
					</button>
				);
			})}
		</div>
	);
}
