import assert from "node:assert/strict";
import { formatHtml, formatText, isBlank } from "./format.ts";

const o = { linkColor: "#00f", color: "#111" };

// Tag yang diketik panitia atau nama peserta tidak pernah menjadi HTML.
const jahat = formatHtml("<script>alert(1)</script> <img src=x onerror=alert(1)>", { ...o, fill: (t) => t.replace("{nama}", "<b>x</b>") });
assert.ok(!/<script|<img/i.test(jahat), jahat);
assert.ok(formatHtml("Halo {nama}", { ...o, fill: (t) => t.replace("{nama}", "<b>x</b>") }).includes("&lt;b&gt;x&lt;/b&gt;"));

// Hanya https, http, mailto yang menjadi tautan.
assert.ok(!formatHtml("[klik](javascript:alert(1))", o).includes("<a "));
assert.ok(formatHtml("[klik](https://contoh.id/a?b=1&c=2)", o).includes('href="https://contoh.id/a?b=1&amp;c=2"'));
assert.ok(!formatHtml('[x](https://a.id/"onmouseover="alert(1))', o).includes('"onmouseover'));

// Tebal, miring, daftar; garis bawah di dalam kata bukan miring.
const kaya = formatHtml("**tebal** dan _miring_ nama_berkas_x\n- satu\n- dua", o);
assert.ok(kaya.includes("<strong>tebal</strong>") && kaya.includes("<em>miring</em>") && kaya.includes("nama_berkas_x"));
assert.equal((kaya.match(/<li /g) ?? []).length, 2);

assert.equal(formatText("**A** [b](https://c.id)\n- d"), "A b (https://c.id)\n\n- d");
assert.ok(isBlank(" ** _ ") && !isBlank("a"));
console.log("format.check ok");
