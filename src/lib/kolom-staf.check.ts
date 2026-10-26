import assert from "node:assert/strict";
import type { RegistrationField, RegistrationFormConfig } from "./domain.ts";
import {
  asalJawaban, ditanyakan, hanyaDiLuarFormulir, kelompokJawaban, kolomBaruDiLuarFormulir, kolomDariTautan, kunciBaru, kunciDariLabel,
  kunciIkutLabel, kunciPensiun, kunciTerpakai, pertanyaanFormulir, rapikanPertanyaan, tambahPertanyaan, tautanDaftarPeserta, wajibDiisi,
} from "./kolom-staf.ts";

const kaos: RegistrationField = { key: "ukuran_kaos", label: "Ukuran kaos", type: "select", required: true, options: ["S", "M"] };
const batch: RegistrationField = { key: "batch", label: "Batch", type: "select", required: false, options: ["Batch 1", "Batch 2"], on_form: false };
const kota: RegistrationField = { key: "kota", label: "Kota asal", type: "text", required: false, on_form: false, participant_update: true };
const ktp: RegistrationField = { key: "ktp", label: "KTP", type: "file", required: true, on_form: false };

// Konfigurasi lama tanpa `on_form` tetap ditanyakan: acara yang sudah ada berubah 0 px.
assert.equal(ditanyakan(kaos), true);
assert.equal(ditanyakan({ ...kaos, on_form: true }), true);
assert.equal(ditanyakan(batch), false);
// Unggahan berkas selalu ditanyakan, walau datanya dipalsukan.
assert.equal(ditanyakan(ktp), true);

// Wajib hanya bila ditanyakan: `required` lama pada kolom staf tidak menahan apa pun.
assert.equal(wajibDiisi(kaos), true);
assert.equal(wajibDiisi({ ...kaos, on_form: false }), false);
assert.equal(wajibDiisi(ktp), true);
assert.deepEqual(pertanyaanFormulir([kaos, batch, kota, ktp]).map((f) => f.key), ["ukuran_kaos", "ktp"]);

// Asal jawaban: kolom yang diisi peserta tidak pernah berlabel staf.
assert.equal(asalJawaban(kaos), "formulir");
assert.equal(asalJawaban(batch), "staf");
assert.equal(asalJawaban(kota), "peserta");
assert.equal(asalJawaban({ ...ktp, participant_update: true }), "formulir");
const kelompok = kelompokJawaban([batch, kaos, kota, ktp]);
assert.deepEqual(kelompok.formulir.map((f) => f.key), ["ukuran_kaos", "ktp"]);
assert.deepEqual(kelompok.peserta.map((f) => f.key), ["kota"]);
assert.deepEqual(kelompok.staf.map((f) => f.key), ["batch"]);

// Disimpan: dinyalakan lagi = tanpa `on_form` (sama persis dengan sebelumnya); mati = tidak wajib.
assert.deepEqual(rapikanPertanyaan({ ...kaos, on_form: true }), kaos);
assert.deepEqual(rapikanPertanyaan({ ...kaos, on_form: undefined }), kaos);
assert.equal("on_form" in rapikanPertanyaan({ ...kaos, on_form: undefined }), false);
assert.deepEqual(rapikanPertanyaan({ ...kaos, on_form: false }), { ...kaos, on_form: false, required: false });
assert.deepEqual(rapikanPertanyaan(ktp), { key: "ktp", label: "KTP", type: "file", required: true });
// Penanda draf tidak pernah ikut disimpan.
assert.equal("kunci_otomatis" in rapikanPertanyaan({ ...kaos, kunci_otomatis: true }), false);
assert.equal("kunci_otomatis" in rapikanPertanyaan({ ...batch, kunci_otomatis: true }), false);

// Kunci dari teks: aturan yang sama dengan sebelum dipindah dari penyunting.
assert.equal(kunciDariLabel("Pertanyaan baru", new Set()), "pertanyaan_baru");
assert.equal(kunciDariLabel("Pertanyaan baru", new Set(["pertanyaan_baru"])), "pertanyaan_baru_2");
assert.equal(kunciDariLabel("2026 Batch!", new Set()), "batch");
assert.equal(kunciDariLabel("", new Set()), "field");

// Pertanyaan baru: kunci yang masih disetujui untuk klien ikut dianggap terpakai.
const awal: RegistrationFormConfig = { fields: [kaos], client_fields: [{ key: "pertanyaan_baru", label: "Lama", type: "text" }] };
assert.deepEqual([...kunciTerpakai(awal)].sort(), ["pertanyaan_baru", "ukuran_kaos"]);
const ditambah = tambahPertanyaan(awal);
assert.deepEqual(ditambah.fields?.[1], { key: "pertanyaan_baru_2", label: "Pertanyaan baru", type: "text", required: false, kunci_otomatis: true });
const kolomBaru = tambahPertanyaan({ fields: [kaos] }, { ditanyakan: false });
const baru = kolomBaru.fields?.[1] as RegistrationField;
assert.deepEqual(baru, { key: "pertanyaan_baru", label: "Pertanyaan baru", type: "text", required: false, on_form: false, kunci_otomatis: true });
assert.equal(asalJawaban(baru), "staf");

// Kunci pertanyaan baru ikut teksnya sampai disimpan.
const tersimpan = new Set(["ukuran_kaos"]);
assert.equal(kunciIkutLabel(kolomBaru, 1, "Batch", tersimpan), "batch");
// Teks yang bentrok dengan pertanyaan lain mendapat angka pembeda, dan angka itu tetap ikut teks berikutnya.
assert.equal(kunciIkutLabel(kolomBaru, 1, "Ukuran kaos", tersimpan), "ukuran_kaos_2");
const bentrok = { fields: [kaos, { ...baru, key: "ukuran_kaos_2", label: "Ukuran kaos" }] };
assert.equal(kunciIkutLabel(bentrok, 1, "Ukuran kaos lengan", tersimpan), "ukuran_kaos_lengan");
// Sudah tersimpan sekali (tandanya dibuang saat disimpan): kunci tidak pernah berubah sendiri.
assert.equal(kunciIkutLabel(kolomBaru, 0, "Ukuran baju", tersimpan), "ukuran_kaos");
assert.equal(kunciIkutLabel({ fields: [kaos, rapikanPertanyaan(baru)] }, 1, "Batch", new Set(["ukuran_kaos", "pertanyaan_baru"])), "pertanyaan_baru");
// Kunci yang diketik sendiri di Data key (tandanya hilang) tidak ditimpa.
const ketik = (field: RegistrationField, key: string): RegistrationField => ({ ...field, key, kunci_otomatis: undefined });
assert.equal(kunciIkutLabel({ fields: [kaos, ketik(baru, "kelompok")] }, 1, "Batch", tersimpan), "kelompok");
// Juga yang bentuknya mirip kunci otomatis bernomor: `tahun_2026` untuk "Tahun", `batch_2026` untuk "Batch".
assert.equal(kunciIkutLabel({ fields: [kaos, { ...ketik(baru, "tahun_2026"), label: "Tahun" }] }, 1, "Tahun lulus", tersimpan), "tahun_2026");
assert.equal(kunciIkutLabel({ fields: [kaos, { ...ketik(baru, "batch_2026"), label: "Batch" }] }, 1, "Batch KSO", tersimpan), "batch_2026");
// Pertanyaan tersimpan yang Data key-nya diganti di draf tidak mulai ikut teksnya.
const q1: RegistrationField = { key: "q1", label: "Batch", type: "text", required: false };
assert.equal(kunciIkutLabel({ fields: [{ ...q1, key: "batch" }] }, 0, "Batch KSO", new Set(["q1"])), "batch");
// Teks dikosongkan lalu diketik lagi tetap diikuti.
const kosong = { fields: [kaos, { ...baru, key: "field", label: "" }] };
assert.equal(kunciIkutLabel(kosong, 1, "B", tersimpan), "b");
// Batch tersimpan lalu dihapus di draf ini: pertanyaan baru bernama Batch tidak
// mewarisi kunci (dan jawaban) lamanya, dan kuncinya tetap ikut teks.
const dihapus = new Set(["ukuran_kaos", "batch"]);
assert.equal(kunciIkutLabel(kolomBaru, 1, "Batch", dihapus), "batch_2");
assert.equal(kunciIkutLabel({ fields: [kaos, { ...baru, key: "batch_2", label: "Batch" }] }, 1, "Batch KSO", dihapus), "batch_kso");
assert.equal(tambahPertanyaan({ fields: [kaos] }, { tersimpan: new Set(["ukuran_kaos", "pertanyaan_baru"]) }).fields?.[1].key, "pertanyaan_baru_2");

// Kunci pensiun: pertanyaan yang dihapus (atau Data key-nya diganti) di Save form sebelumnya.
assert.deepEqual(kunciPensiun({ fields: [kaos, batch] }, [kaos]), ["batch"]);
assert.deepEqual(kunciPensiun({ fields: [batch] }, [{ ...batch, key: "kelompok" }]), ["batch"]);
assert.deepEqual(kunciPensiun({ fields: [kaos], retired_keys: ["catatan"] }, [kaos]), ["catatan"]);
assert.deepEqual(kunciPensiun({ fields: [kaos, batch], retired_keys: ["catatan"] }, [kaos]), ["catatan", "batch"]);
// Tidak ada yang hilang: susunan tersimpan persis seperti dulu (tanpa retired_keys).
assert.equal(kunciPensiun({ fields: [kaos] }, [kaos]), undefined);
assert.equal(kunciPensiun(null, [kaos]), undefined);
// Data key yang diketik sendiri menghidupkan kolom lama dengan sengaja: keluar dari daftar.
assert.equal(kunciPensiun({ fields: [kaos], retired_keys: ["catatan"] }, [kaos, { ...batch, key: "catatan" }]), undefined);
// Bentuk tersimpan yang rusak diabaikan, dan daftarnya dibatasi (yang tertua dilepas).
assert.equal(kunciPensiun({ fields: [kaos], retired_keys: "catatan" as unknown as string[] }, [kaos]), undefined);
assert.deepEqual(kunciPensiun({ retired_keys: [1, "catatan"] as unknown as string[] }, []), ["catatan"]);
const banyak = Array.from({ length: 205 }, (_, n) => `k${n}`);
const dibatasi = kunciPensiun({ retired_keys: banyak }, []) ?? [];
assert.equal(dibatasi.length, 200);
assert.equal(dibatasi[0], "k5");
assert.equal(dibatasi.at(-1), "k204");

// Kolom staf "Catatan" dihapus dan disimpan; pertanyaan baru yang dinamai "Catatan"
// tidak memakai `catatan` lagi, jadi catatan lama tidak sampai ke peserta (QA kolom-staf, M1).
const setelahHapus: RegistrationFormConfig = { fields: [kaos], retired_keys: ["catatan"] };
assert.equal(kunciTerpakai(setelahHapus).has("catatan"), true);
const catatanBaru = tambahPertanyaan(setelahHapus);
assert.equal(kunciIkutLabel(catatanBaru, 1, "Catatan", new Set(["ukuran_kaos"])), "catatan_2");
assert.equal(tambahPertanyaan({ fields: [kaos], retired_keys: ["pertanyaan_baru"] }).fields?.[1].key, "pertanyaan_baru_2");

// Toast Save form: hanya kolom di luar formulir yang berubah = halaman pendaftaran tetap.
assert.equal(hanyaDiLuarFormulir({ fields: [kaos] }, { fields: [kaos, batch] }), true);
assert.equal(hanyaDiLuarFormulir({ fields: [kaos, batch] }, { fields: [batch, kaos] }), true);
assert.equal(hanyaDiLuarFormulir({ fields: [kaos, batch] }, { fields: [kaos, { ...batch, label: "Kelompok" }] }), true);
// Kolom barunya dinyalakan, atau ada yang ditanyakan berubah: halaman pendaftaran ikut berubah.
assert.equal(hanyaDiLuarFormulir({ fields: [kaos] }, { fields: [kaos, { ...batch, on_form: undefined }] }), false);
assert.equal(hanyaDiLuarFormulir({ fields: [kaos] }, { fields: [{ ...kaos, label: "Ukuran baju" }, batch] }), false);
assert.equal(hanyaDiLuarFormulir({ fields: [kaos] }, { fields: [kaos, batch], welcome_text: "Halo" }), false);
assert.equal(hanyaDiLuarFormulir({ fields: [kaos] }, { fields: [kaos, batch], require_phone: false }), false);
// Simpan tanpa perubahan apa pun tetap mendapat kabar seperti dulu.
assert.equal(hanyaDiLuarFormulir({ fields: [kaos] }, { fields: [kaos] }), false);
assert.equal(hanyaDiLuarFormulir({ fields: [kaos], require_email: true }, { fields: [kaos] }), false);

// Mode Add a column: "The new one isn't asked" hanya selama pertanyaan barunya memang tidak ditanyakan.
assert.equal(kolomBaruDiLuarFormulir([kaos], [kaos, baru]), true);
assert.equal(kolomBaruDiLuarFormulir([kaos], [kaos, { ...baru, on_form: undefined }]), false);
assert.equal(kolomBaruDiLuarFormulir([kaos], [kaos, { ...baru, type: "file" }]), false);
assert.equal(kolomBaruDiLuarFormulir([kaos], [kaos]), false);
assert.equal(kolomBaruDiLuarFormulir([kaos], [kaos, baru, { ...baru, key: "kota", on_form: undefined }]), false);

// Kembali ke Participant list dengan kolom baru tercentang.
assert.deepEqual(kunciBaru([kaos], [kaos, batch, kota]), ["batch", "kota"]);
assert.deepEqual(kunciBaru([kaos, batch], [kaos]), []);
assert.equal(tautanDaftarPeserta(["batch"]), "/admin/participants?kolom=batch");
assert.equal(tautanDaftarPeserta([]), "/admin/participants");
assert.deepEqual(kolomDariTautan("batch, kota,batch,hilang", [kaos, batch, kota]), ["field:batch", "field:kota"]);
assert.deepEqual(kolomDariTautan(null, [batch]), []);

console.log("kolom-staf.check: ok");

// "Show answers in the public agenda" hanya tersimpan di dropdown/radio yang menyalakannya.
assert.equal(rapikanPertanyaan({ ...batch, agenda_label: true }).agenda_label, true);
assert.equal("agenda_label" in rapikanPertanyaan({ ...batch, agenda_label: false }), false);
assert.equal("agenda_label" in rapikanPertanyaan({ ...kota, agenda_label: true }), false);
