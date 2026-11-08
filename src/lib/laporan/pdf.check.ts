import assert from "node:assert/strict";
import { pdfDariJpeg, ukuranJpeg } from "./pdf.ts";

// JPEG 3×2 kecil (merah), dibuat sekali dengan PIL.
const jpeg = Uint8Array.from(Buffer.from("/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDABALDA4MChAODQ4SERATGCgaGBYWGDEjJR0oOjM9PDkzODdASFxOQERXRTc4UG1RV19iZ2hnPk1xeXBkeFxlZ2P/2wBDARESEhgVGC8aGi9jQjhCY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2P/wAARCAACAAMDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDHooorhPqD/9k=", "base64"));
assert.deepEqual(ukuranJpeg(jpeg), { lebar: 3, tinggi: 2 });
assert.equal(ukuranJpeg(new Uint8Array([0x89, 0x50, 0x4e, 0x47])), null);

const pdf = pdfDariJpeg([{ jpeg, lebarPx: 3, tinggiPx: 2 }, { jpeg, lebarPx: 3, tinggiPx: 2 }], { lebar: 960, tinggi: 540 });
const teks = Buffer.from(pdf).toString("latin1");
assert.ok(teks.startsWith("%PDF-1.4\n"));
assert.ok(teks.endsWith("%%EOF\n"));
assert.equal((teks.match(/\/Type \/Page /g) ?? []).length, 2);
assert.ok(teks.includes("/MediaBox [0 0 960 540]"));
// Tabel xref menunjuk tepat ke awal tiap objek, startxref ke "xref".
const startxref = Number(/startxref\n(\d+)\n/.exec(teks)![1]);
assert.equal(teks.slice(startxref, startxref + 4), "xref");
const baris = teks.slice(startxref).split("\n").slice(3, 3 + 8);
baris.forEach((b, i) => assert.equal(teks.slice(Number(b.slice(0, 10)), Number(b.slice(0, 10)) + String(i + 1).length + 6), `${i + 1} 0 obj`));
// Panjang stream gambar = panjang JPEG.
assert.ok(teks.includes(`/Length ${jpeg.length} >>`));
console.log("pdf ok");
