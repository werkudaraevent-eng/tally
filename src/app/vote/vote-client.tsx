"use client";

import { useCallback, useEffect, useState } from "react";
import { votePercentages, type PublicVoteState } from "@/lib/vote";

// Halaman pemilih. Dibuka di HP lewat QR di layar panggung, tanpa login.
//
// Polling lebih lambat daripada layar panggung: HP-nya ratusan, dan endpoint
// yang dibaca sengaja dapat di-cache CDN sehingga seluruhnya digabungkan
// menjadi sekitar satu permintaan per detik ke origin.
const POLL_MS = 4000;

/**
 * Ingatan lokal "sudah memilih".
 *
 * HANYA untuk tampilan. Penjaga sesungguhnya adalah indeks unik di database,
 * dan localStorage dipilih justru karena ia TIDAK boleh masuk ke balasan
 * `/api/vote/state`: begitu balasan itu berbeda antar-pemilih, cache CDN batal
 * dan endpoint yang dibaca ratusan HP kehilangan satu-satunya hal yang membuatnya
 * sanggup.
 */
const STORAGE_KEY = "vote_sudah";

function readVoted(): number[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((value) => typeof value === "number") : [];
  } catch {
    // Penyimpanan bisa ditolak di mode samaran. Bukan alasan menggagalkan
    // halaman: pemilih tetap bisa memilih, servernya yang menjaga.
    return [];
  }
}

function rememberVoted(pollId: number) {
  try {
    const next = [...new Set([...readVoted(), pollId])];
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch { /* diabaikan, lihat readVoted */ }
}

export default function VoteClient({ eventName, accent }: { eventName: string; accent: string }) {
  const [state, setState] = useState<PublicVoteState>({ poll: null });
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<number[]>([]);
  const [code, setCode] = useState("");
  const [rating, setRating] = useState<number | null>(null);
  const [words, setWords] = useState<string[]>([""]);
  const [name, setName] = useState("");
  // Mode "pilih nama dari daftar": pencarian dijalankan ke endpoint publik yang
  // menolak kueri di bawah tiga huruf.
  const [nameQuery, setNameQuery] = useState("");
  const [nameResults, setNameResults] = useState<Array<{ id: string; name: string; company: string | null }>>([]);
  const [picked, setPicked] = useState<{ id: string; name: string } | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [voted, setVoted] = useState<number[]>([]);

  // Dibaca SETELAH render pertama, bukan lewat inisialisasi state.
  //
  // Dua sebab yang keduanya wajib: React Compiler menolak setState sinkron di
  // badan effect, dan inisialisasi malas akan membuat render server (yang tidak
  // punya localStorage) berbeda dari render klien — ketidakcocokan hidrasi.
  // Pola timeout nol ini sama dengan yang dipakai halaman lain di aplikasi ini.
  useEffect(() => {
    const timer = window.setTimeout(() => setVoted(readVoted()), 0);
    return () => window.clearTimeout(timer);
  }, []);

  const load = useCallback(async () => {
    const response = await fetch("/api/vote/state", { cache: "no-store" }).catch(() => null);
    setLoading(false);
    if (!response?.ok) return;
    setState((await response.json()) as PublicVoteState);
  }, []);

  useEffect(() => {
    const first = window.setTimeout(() => { void load(); }, 0);
    const timer = window.setInterval(() => { void load(); }, POLL_MS);
    return () => { window.clearTimeout(first); window.clearInterval(timer); };
  }, [load]);

  const poll = state.poll;

  // Pilihan dikosongkan saat pertanyaan berganti. Tanpa ini, id opsi dari
  // pertanyaan sebelumnya ikut terkirim dan ditolak server sebagai opsi asing —
  // galat yang membingungkan karena pemilih merasa belum memilih apa pun.
  //
  // `pollId` dinormalkan ke null LEBIH DULU, bukan dibandingkan sebagai
  // `poll?.id !== seenPoll`. Saat belum ada voting, `poll?.id` bernilai
  // `undefined` sementara state-nya `null`: perbandingannya selalu benar,
  // setState-nya tidak pernah mengubah apa pun, dan React berhenti dengan
  // "Too many re-renders".
  const pollId = poll?.id ?? null;
  const [seenPoll, setSeenPoll] = useState<number | null>(pollId);
  if (pollId !== seenPoll) {
    setSeenPoll(pollId);
    setSelected([]);
    setRating(null);
    setWords([""]);
    setError("");
  }

  // Pencarian nama di-debounce 300ms: pengetik cepat memicu satu permintaan per
  // huruf, dan endpoint ini membaca tabel peserta.
  useEffect(() => {
    if (poll?.voter_mode !== "participant_pick") return;
    // Pengosongan hasil ikut masuk timer, bukan dijalankan langsung di badan
    // effect: React Compiler menolak setState sinkron di sana, dan menunda satu
    // tik tidak mengubah apa pun yang terlihat pengguna.
    const timer = window.setTimeout(() => {
      if (nameQuery.trim().length < 3) { setNameResults([]); return; }
      void (async () => {
        const response = await fetch(`/api/vote/participants?q=${encodeURIComponent(nameQuery.trim())}`, { cache: "no-store" }).catch(() => null);
        if (!response?.ok) return;
        const data = await response.json();
        setNameResults(data.participants ?? []);
      })();
    }, 300);
    return () => window.clearTimeout(timer);
  }, [nameQuery, poll?.voter_mode]);

  const alreadyVoted = poll ? voted.includes(poll.id) : false;

  function toggle(optionId: number) {
    setError("");
    if (!poll) return;
    if (poll.type === "single") { setSelected([optionId]); return; }
    setSelected((current) => {
      if (current.includes(optionId)) return current.filter((id) => id !== optionId);
      if (current.length >= poll.max_choices) return current;
      return [...current, optionId];
    });
  }

  /** Jawaban sudah lengkap untuk tipe pertanyaan ini. */
  function answerReady() {
    if (!poll) return false;
    if (poll.type === "rating") return rating !== null;
    if (poll.type === "wordcloud") return words.some((word) => word.trim());
    return selected.length > 0;
  }

  /** Identitas sudah lengkap untuk mode pertanyaan ini. */
  function identityReady() {
    if (!poll) return false;
    if (poll.voter_mode === "participant_code") return Boolean(code.trim());
    if (poll.voter_mode === "participant_pick") return Boolean(picked);
    if (poll.voter_mode === "name_text") return Boolean(name.trim());
    return true;
  }

  async function submit() {
    if (!poll || !answerReady() || !identityReady()) return;
    setSending(true); setError("");
    const response = await fetch("/api/vote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        poll_id: poll.id,
        option_ids: selected,
        rating,
        words: words.map((word) => word.trim()).filter(Boolean),
        code: code.trim() || null,
        participant_id: picked?.id ?? null,
        name: name.trim() || null,
      }),
    }).catch(() => null);
    setSending(false);
    if (!response) { setError("Koneksi terputus. Suara belum terkirim."); return; }
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = body.error?.details?.message ?? body.error?.message ?? "Suara gagal dikirim.";
      setError(message);
      // Sudah pernah memilih tetap dicatat lokal, supaya tombolnya tidak
      // mengundang percobaan ketiga yang pasti ditolak juga.
      if (response.status === 409) { rememberVoted(poll.id); setVoted(readVoted()); }
      return;
    }
    rememberVoted(poll.id);
    setVoted(readVoted());
    void load();
  }

  const counts = poll?.options.map((option) => option.vote_count ?? 0) ?? [];
  const percentages = votePercentages(counts);

  return <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col gap-5 px-5 py-8">
    <header>
      <p className="text-xs font-semibold uppercase tracking-[0.18em]" style={{ color: accent }}>{eventName}</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-[-0.03em]">Voting</h1>
    </header>

    {loading ? <p className="text-sm text-[var(--ink-muted)]">Memuat…</p>
      : !poll ? <p className="border border-[var(--line)] bg-[var(--surface)] p-5 text-sm text-[var(--ink-muted)]">
          Belum ada voting yang dibuka. Biarkan halaman ini terbuka — pertanyaannya akan muncul sendiri.
        </p>
      : <section className="border border-[var(--line)] bg-[var(--surface)] p-5">
          <h2 className="text-lg font-semibold leading-6">{poll.question}</h2>
          {poll.description && <p className="mt-2 text-sm text-[var(--ink-muted)]">{poll.description}</p>}
          <p className="mt-2 text-xs text-[var(--ink-muted)]">
            {poll.type === "multi" ? `Pilih maksimal ${poll.max_choices}.`
              : poll.type === "rating" ? `Beri nilai 1 sampai ${poll.rating_max}.`
              : poll.type === "wordcloud" ? `Ketik maksimal ${poll.max_words} kata.`
              : "Pilih satu."}
            {poll.voter_mode === "participant_code" ? " Butuh kode peserta di badge Anda." : ""}
          </p>

          {alreadyVoted && <p role="status" className="mt-4 border border-[#B9DCC5] bg-[#EEF8F0] p-3 text-sm font-semibold text-[var(--brand-strong)]">
            Suara Anda sudah tercatat. Terima kasih.
          </p>}

          {poll.status !== "open" && !alreadyVoted && <p className="mt-4 border border-[#E6D3AE] bg-[#FDF6E7] p-3 text-sm text-[var(--warning)]">
            {poll.status === "closed" ? "Voting sudah ditutup." : "Voting belum dibuka. Tunggu aba-aba dari panggung."}
          </p>}

          {/* ---- Rating ---- */}
          {poll.type === "rating" && <div className="mt-4">
            <div className="flex flex-wrap gap-2">
              {Array.from({ length: poll.rating_max }, (_, index) => index + 1).map((value) => <button
                key={value}
                type="button"
                onClick={() => { setRating(value); setError(""); }}
                disabled={alreadyVoted || poll.status !== "open" || sending}
                aria-pressed={rating === value}
                className={`min-h-14 flex-1 border text-lg font-bold tabular-nums disabled:opacity-70 ${rating === value ? "border-[var(--brand)] text-white" : "border-[var(--line)]"}`}
                style={rating === value ? { background: accent } : undefined}
              >{value}</button>)}
            </div>
            {(poll.rating_min_label || poll.rating_max_label) && <div className="mt-2 flex justify-between text-xs text-[var(--ink-muted)]">
              <span>{poll.rating_min_label}</span><span>{poll.rating_max_label}</span>
            </div>}
          </div>}

          {/* ---- Word cloud ---- */}
          {poll.type === "wordcloud" && <div className="mt-4 space-y-2">
            {Array.from({ length: poll.max_words }, (_, index) => index).map((index) => <input
              key={index}
              value={words[index] ?? ""}
              onChange={(event) => {
                const next = Array.from({ length: poll.max_words }, (_, position) => words[position] ?? "");
                next[index] = event.target.value;
                setWords(next); setError("");
              }}
              disabled={alreadyVoted || poll.status !== "open" || sending}
              placeholder={index === 0 ? "Kata pertama" : `Kata ke-${index + 1} (opsional)`}
              maxLength={40}
              className="h-12 w-full border border-[var(--line)] bg-[var(--background)] px-3 text-sm outline-none focus:border-[var(--brand)] disabled:opacity-70"
            />)}
            <p className="text-xs text-[var(--ink-muted)]">
              Satu kata per kolom. Tanda baca dan huruf besar-kecil diseragamkan supaya kata yang sama tidak terpecah di layar.
            </p>
          </div>}

          {/* ---- Pilihan tunggal & ganda ---- */}
          {(poll.type === "single" || poll.type === "multi") && <ul className="mt-4 space-y-2">
            {poll.options.map((option, index) => {
              const active = selected.includes(option.id);
              const disabled = alreadyVoted || poll.status !== "open" || sending;
              return <li key={option.id}>
                <button
                  type="button"
                  onClick={() => toggle(option.id)}
                  disabled={disabled}
                  aria-pressed={active}
                  className={`relative flex min-h-14 w-full items-center justify-between gap-3 overflow-hidden border py-2 pl-2 pr-4 text-left text-sm font-semibold disabled:opacity-70 ${active ? "border-[var(--brand)]" : "border-[var(--line)]"}`}
                >
                  {/* Bar hasil digambar DI DALAM tombol, bukan sebagai elemen
                      terpisah di bawahnya: pada layar HP yang sempit, dua baris
                      per opsi membuat daftar lima opsi butuh digulir. */}
                  {poll.results_visible && <span className="absolute inset-y-0 left-0" style={{ width: `${percentages[index]}%`, background: `${accent}26` }} />}
                  {/* `<img>`, bukan next/image: URL-nya dari storage Supabase dan
                      bisa berubah kapan saja lewat CMS, sedangkan next/image butuh
                      host yang terdaftar lebih dulu di konfigurasi. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {option.image_url && <img src={option.image_url} alt="" aria-hidden="true" className="relative size-12 shrink-0 object-cover" />}
                  <span className="relative min-w-0 flex-1 truncate">{option.label}</span>
                  {poll.results_visible
                    ? <span className="relative shrink-0 tabular-nums text-[var(--ink-muted)]">{percentages[index]}%</span>
                    : active && <span className="relative shrink-0" style={{ color: accent }}>✓</span>}
                </button>
              </li>;
            })}
          </ul>}

          {/* ---- Pilih nama dari daftar ---- */}
          {poll.voter_mode === "participant_pick" && !alreadyVoted && poll.status === "open" && <div className="mt-4">
            <label className="block text-sm font-semibold">Nama Anda
              <input
                value={picked ? picked.name : nameQuery}
                onChange={(event) => { setPicked(null); setNameQuery(event.target.value); setError(""); }}
                placeholder="Ketik minimal 3 huruf"
                autoComplete="off"
                className="mt-1.5 h-12 w-full border border-[var(--line)] bg-[var(--background)] px-3 text-sm outline-none focus:border-[var(--brand)]"
              />
            </label>
            {/* Hasil hanya tampil selama belum ada yang dipilih: daftar yang
                tetap terbuka setelah pemilihan membuat orang mengira pilihannya
                belum tersimpan. */}
            {!picked && nameResults.length > 0 && <ul className="mt-2 max-h-52 divide-y divide-[var(--line)] overflow-y-auto border border-[var(--line)]">
              {nameResults.map((person) => <li key={person.id}>
                <button type="button" onClick={() => { setPicked({ id: person.id, name: person.name }); setNameResults([]); }} className="min-h-12 w-full px-3 py-2 text-left text-sm hover:bg-[var(--surface-muted)]">
                  <span className="block font-semibold">{person.name}</span>
                  {person.company && <span className="block text-xs text-[var(--ink-muted)]">{person.company}</span>}
                </button>
              </li>)}
            </ul>}
            {!picked && nameQuery.trim().length >= 3 && nameResults.length === 0 && <p className="mt-2 text-xs text-[var(--ink-muted)]">Tidak ada nama yang cocok.</p>}
          </div>}

          {/* ---- Ketik nama sendiri ---- */}
          {poll.voter_mode === "name_text" && !alreadyVoted && poll.status === "open" && <label className="mt-4 block text-sm font-semibold">Nama Anda
            <input
              value={name}
              onChange={(event) => { setName(event.target.value); setError(""); }}
              placeholder="Nama yang akan tercatat"
              autoComplete="name"
              className="mt-1.5 h-12 w-full border border-[var(--line)] bg-[var(--background)] px-3 text-sm outline-none focus:border-[var(--brand)]"
            />
          </label>}

          {poll.voter_mode === "participant_code" && !alreadyVoted && poll.status === "open" && <label className="mt-4 block text-sm font-semibold">Kode peserta
            <input
              value={code}
              onChange={(event) => setCode(event.target.value)}
              placeholder="Contoh: REG159425"
              autoCapitalize="characters"
              autoComplete="off"
              className="mt-1.5 h-12 w-full border border-[var(--line)] bg-[var(--background)] px-3 font-mono text-sm outline-none focus:border-[var(--brand)]"
            />
          </label>}

          {error && <p role="alert" className="mt-4 border border-[#E9C7C4] bg-[#FFF2F0] p-3 text-sm text-[var(--danger)]">{error}</p>}

          {!alreadyVoted && poll.status === "open" && <button
            type="button"
            onClick={() => void submit()}
            disabled={sending || !answerReady() || !identityReady()}
            className="mt-5 min-h-14 w-full bg-[var(--brand)] px-4 text-base font-semibold text-white disabled:opacity-40"
          >
            {sending ? "Mengirim…" : "Kirim suara"}
          </button>}

          {poll.results_visible && poll.total_ballots !== null && <p className="mt-4 text-center text-xs text-[var(--ink-muted)]">
            {poll.total_ballots} orang sudah memilih
          </p>}
        </section>}
  </main>;
}
