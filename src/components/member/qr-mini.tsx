"use client";

import { useEffect, useState } from "react";

/**
 * QR kecil di sobekan kartu perjalanan Horizon. Paket `qrcode` diimpor dinamis
 * seperti RegistrationCodeCard; sebelum siap, kotaknya kosong (ukurannya tetap).
 */
export function QrMini({ code, alt }: { code: string; alt: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let batal = false;
    void (async () => {
      const QRCode = (await import("qrcode")).default;
      const url = await QRCode.toDataURL(code, { errorCorrectionLevel: "M", margin: 0, width: 320 });
      if (!batal) setSrc(url);
    })();
    return () => {
      batal = true;
    };
  }, [code]);
  // eslint-disable-next-line @next/next/no-img-element
  return src ? <img src={src} alt={alt} className="size-full" width={148} height={148} /> : <span className="block size-full" aria-hidden />;
}
