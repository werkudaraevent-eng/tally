"use client";

import { createContext, useContext, type ComponentType, type RefCallback } from "react";

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
