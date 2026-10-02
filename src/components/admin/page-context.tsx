"use client";

import { createContext, useContext, type ComponentType, type ReactNode, type RefCallback } from "react";
import { createPortal } from "react-dom";

/**
 * Identitas halaman ruang kerja yang sedang dibuka.
 *
 * ---- Kenapa context, bukan prop per halaman -------------------------------
 *
 * Judul halaman pindah dari bilah atas ke dalam konten, dan godaannya adalah
 * menyuruh tiap layar menuliskan judulnya sendiri. Itu akan melahirkan daftar
 * judul KEDUA di samping tabel `navigation` yang sudah memberi label menu, dan
 * dua daftar yang "seharusnya sama" akan berpisah pada perubahan pertama yang
 * hanya menyentuh salah satunya. Akibatnya bukan sekadar kosmetik: judul yang
 * tidak cocok dengan menu yang tersorot membuat panitia mengira ia salah
 * halaman.
 *
 * Jadi sumbernya tetap satu — pencarian `currentPage` di AdminShell, tabel yang
 * sama yang menentukan penyorot menu aktif — dan nilainya diturunkan lewat
 * context. `PageHeader` membacanya kalau propnya tidak diisi.
 *
 * Boleh ditimpa per halaman lewat prop, dan itu disengaja: sub-halaman seperti
 * `/admin/undian/kontrol` memang lebih spesifik daripada label induknya.
 */
export type AdminPageMeta = {
	label: string;
	/** Ikon yang sama dengan item menunya. Tidak dipilih ulang per halaman. */
	icon?: ComponentType<{ size?: number; weight?: "fill" | "regular" | "duotone" }>;
	/** Satu kalimat: apa yang dikerjakan di layar ini. */
	description?: string;
	/** Akun yang sedang masuk. Kunci untuk preferensi per akun, mis. kolom tabel. */
	username?: string | null;
	/** Slug acara yang sedang dibuka. Bagian kunci preferensi yang sama. */
	eventSlug?: string | null;
	/**
	 * Acara berstatus selesai atau arsip. Server menolak setiap perubahan, kecuali
	 * dari super_admin (`isWriteBlocked`), jadi `pemilik` membedakan penandanya.
	 */
	kunci?: { status: "completed" | "archived"; pemilik: boolean } | null;
};

const AdminPageContext = createContext<AdminPageMeta | null>(null);

export const AdminPageProvider = AdminPageContext.Provider;

/**
 * Null saat dipakai di luar AdminShell — layar publik memakai `PageHeader` yang
 * sama dengan propnya diisi sendiri, dan tidak boleh gagal hanya karena tidak
 * ada shell di atasnya.
 */
export function useAdminPage() {
	return useContext(AdminPageContext);
}

/**
 * Apakah kontrol yang menyimpan ke server harus nonaktif di sini: acara terkunci
 * dan pemakainya bukan super_admin (sama dengan `isWriteBlocked` di server).
 * Dipakai `Button`, `IconButton`, dan `Switch` lewat prop `simpan`; di luar ruang
 * kerja admin konteksnya tidak ada dan hasilnya selalu false.
 */
export function useTerkunci(simpan?: boolean) {
	const kunci = useContext(AdminPageContext)?.kunci;
	return Boolean(simpan && kunci && !kunci.pemilik);
}

/** Keterangan pada kontrol yang nonaktif karena acaranya terkunci. */
export const KETERANGAN_KUNCI = "Acara sudah ditutup; perubahan tidak disimpan.";


/**
 * Judul halaman yang berpindah ke bilah atas saat kepala halaman tergulir lewat.
 *
 * ---- Kenapa keadaannya hidup di shell ------------------------------------
 *
 * Yang mengamati adalah `PageHeader`, jauh di dalam konten. Yang menampilkan
 * adalah bilah atas, saudara di atasnya. Keduanya tidak bisa saling melihat,
 * jadi keadaannya dipegang leluhur bersama mereka — AdminShell — dan `PageHeader`
 * hanya menyerahkan elemennya untuk diamati.
 *
 * IntersectionObserver, bukan pendengar `scroll`. Pendengar scroll berjalan pada
 * setiap frame sepanjang halaman digulir; observer terbangun dua kali, saat judul
 * meninggalkan layar dan saat ia kembali. Ini layar yang digulir terus-menerus.
 */
export type AdminHeaderScroll = {
	/** Kepala halaman sudah tergulir lewat; bilah atas mengambil alih judulnya. */
	terlewat: boolean;
	/** Diserahkan `PageHeader` ke elemen judulnya. */
	amati: RefCallback<HTMLElement>;
};

const AdminHeaderScrollContext = createContext<AdminHeaderScroll | null>(null);

export const AdminHeaderScrollProvider = AdminHeaderScrollContext.Provider;

export function useAdminHeaderScroll() {
	return useContext(AdminHeaderScrollContext);
}

/**
 * Dua tempat di bilah atas yang boleh diisi halaman: sesudah tombol menu (judul
 * dan keterangannya) dan sebelum menu akun (aksi halaman).
 *
 * Untuk layar yang tingginya habis dipakai kerja, seperti editor Halaman acara:
 * kepala halaman sendiri di bawah bilah memakan satu baris penuh di layar
 * laptop 588px, padahal bilah atas yang 58px itu hampir kosong. Elemennya
 * dipegang shell; halamannya mengisi lewat portal, jadi bilah tidak perlu tahu
 * apa pun tentang halaman yang sedang dibuka.
 */
export type AdminBarSlots = { judul: HTMLElement | null; aksi: HTMLElement | null };

const AdminBarSlotsContext = createContext<AdminBarSlots>({ judul: null, aksi: null });

export const AdminBarSlotsProvider = AdminBarSlotsContext.Provider;

/** Mengisi bilah atas. Di luar shell (atau sebelum shell terpasang) tidak merender apa pun. */
export function AdminBarPortal({ judul, aksi }: { judul?: ReactNode; aksi?: ReactNode }) {
	const slot = useContext(AdminBarSlotsContext);
	return (
		<>
			{slot.judul && judul ? createPortal(judul, slot.judul) : null}
			{slot.aksi && aksi ? createPortal(aksi, slot.aksi) : null}
		</>
	);
}
