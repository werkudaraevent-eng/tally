"use client";

import { useEffect, useRef, useState } from "react";
import type { UndianMusic } from "@/lib/undian";
import { laguSekarang, type SlotMusik } from "@/lib/undian-musik";

/**
 * Musik layar panggung (Stage display > Music).
 *
 * Tiga pemutar <audio>, satu per slot, dibuat begitu musik menyala supaya lagu
 * "saat mengundi" sudah terunduh sebelum operator menekan Draw: jeda unduhan di
 * jaringan venue tepat saat roda mulai berputar terdengar seperti kesalahan.
 *
 * Pergantian lagu memudar 0,4 detik, tidak memotong. Lagu menunggu dilanjutkan
 * dari posisi terakhirnya; lagu mengundi dan lagu pemenang selalu dari awal.
 *
 * Browser menolak memutar suara sebelum ada klik di halaman. Penolakan itu
 * tidak dianggap galat: layar menampilkan ajakan kecil untuk mengeklik, dan
 * klik pertama di mana pun menyalakan lagu yang semestinya sedang terdengar.
 */

const FADE_MS = 400;
const STEP_MS = 40;

type Pemutar = { audio: HTMLAudioElement; url: string; fade: number | null };

export function useStageMusic(music: UndianMusic, phase: "idle" | "spinning" | "revealed", namesShown: boolean) {
  const target = laguSekarang(music, phase, namesShown);
  const players = useRef<Partial<Record<SlotMusik, Pemutar>>>({});
  const [needsClick, setNeedsClick] = useState(false);
  const volume = music.volume / 100;
  const targetRef = useRef<SlotMusik | null>(target);
  const volumeRef = useRef(volume);

  // Pemutar per slot, mengikuti URL dari CMS. Slot yang dikosongkan dilepas.
  useEffect(() => {
    const urls: Record<SlotMusik, string | null> = music.enabled
      ? { waiting: music.waiting, drawing: music.drawing, winner: music.winner }
      : { waiting: null, drawing: null, winner: null };
    for (const slot of Object.keys(urls) as SlotMusik[]) {
      const ada = players.current[slot];
      const url = urls[slot];
      if (ada && ada.url === url) continue;
      if (ada) {
        if (ada.fade !== null) window.clearInterval(ada.fade);
        ada.audio.pause();
        ada.audio.removeAttribute("src");
        ada.audio.load();
        delete players.current[slot];
      }
      if (url) {
        const audio = new Audio();
        audio.preload = "auto";
        audio.loop = slot !== "winner";
        audio.volume = 0;
        audio.src = url;
        players.current[slot] = { audio, url, fade: null };
      }
    }
  }, [music.enabled, music.waiting, music.drawing, music.winner]);

  useEffect(() => {
    const semua = players.current;
    return () => {
      for (const pemutar of Object.values(semua)) {
        if (!pemutar) continue;
        if (pemutar.fade !== null) window.clearInterval(pemutar.fade);
        pemutar.audio.pause();
      }
    };
  }, []);

  function pudar(pemutar: Pemutar, ke: number, selesai?: () => void) {
    if (pemutar.fade !== null) window.clearInterval(pemutar.fade);
    const dari = pemutar.audio.volume;
    const langkah = Math.max(1, Math.round(FADE_MS / STEP_MS));
    let i = 0;
    pemutar.fade = window.setInterval(() => {
      i += 1;
      pemutar.audio.volume = Math.min(1, Math.max(0, dari + ((ke - dari) * i) / langkah));
      if (i >= langkah) {
        if (pemutar.fade !== null) window.clearInterval(pemutar.fade);
        pemutar.fade = null;
        selesai?.();
      }
    }, STEP_MS);
  }

  function putar(slot: SlotMusik, dariAwal: boolean) {
    const pemutar = players.current[slot];
    if (!pemutar) return;
    if (dariAwal) {
      if (pemutar.fade !== null) window.clearInterval(pemutar.fade);
      pemutar.fade = null;
      pemutar.audio.volume = 0;
      try { pemutar.audio.currentTime = 0; } catch { /* belum termuat */ }
    }
    pemutar.audio.play().then(
      () => { setNeedsClick(false); pudar(pemutar, volumeRef.current); },
      (error: unknown) => { if ((error as { name?: string })?.name === "NotAllowedError") setNeedsClick(true); },
    );
  }

  // Lagu yang semestinya terdengar berganti: yang lain memudar lalu berhenti.
  useEffect(() => {
    targetRef.current = target;
    for (const slot of Object.keys(players.current) as SlotMusik[]) {
      const pemutar = players.current[slot];
      if (!pemutar || slot === target || pemutar.audio.paused) continue;
      pudar(pemutar, 0, () => pemutar.audio.pause());
    }
    if (target) putar(target, target !== "waiting");
    // Hanya berganti saat target atau berkasnya berganti, bukan setiap polling.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, music.waiting, music.drawing, music.winner]);

  // Volume dari CMS berlaku tanpa memutar ulang lagu.
  useEffect(() => {
    volumeRef.current = volume;
    const pemutar = targetRef.current ? players.current[targetRef.current] : undefined;
    if (pemutar && !pemutar.audio.paused) pudar(pemutar, volume);
  }, [volume]);

  // Klik atau tombol pertama di halaman membuka kunci suara browser.
  useEffect(() => {
    if (!needsClick) return;
    const buka = () => {
      const slot = targetRef.current;
      if (slot) putar(slot, false);
      else setNeedsClick(false);
    };
    window.addEventListener("pointerdown", buka);
    window.addEventListener("keydown", buka);
    return () => {
      window.removeEventListener("pointerdown", buka);
      window.removeEventListener("keydown", buka);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needsClick]);

  return { needsClick: needsClick && target !== null };
}

/** Ajakan kecil di pojok layar sampai seseorang mengeklik halaman panggung. */
export function MusicClickHint() {
  return (
    <div
      role="status"
      className="pointer-events-none fixed bottom-[2vh] left-1/2 z-50 -translate-x-1/2 rounded-full px-[1.6vw] py-[0.9vh]"
      style={{ background: "rgba(0, 0, 0, 0.72)", color: "#fff", fontSize: "clamp(11px, 1.1vw, 18px)", letterSpacing: "0.02em" }}
    >
      Klik layar ini sekali untuk menyalakan musik
    </div>
  );
}
