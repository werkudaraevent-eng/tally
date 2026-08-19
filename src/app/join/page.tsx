import JoinClient from "./join-client";

// Gerbang masuk peserta. Publik, tanpa login, dan SENGAJA tanpa konteks event:
// kode yang diketik peserta itulah yang menentukan acara mana yang dituju.
//
// Karena itu halaman ini TIDAK memakai `getPublicPageEvent`. Dipakai, ia akan
// mencoba menebak acara dari slug di URL atau dari satu-satunya acara aktif —
// dan tebakan itu akan bertabrakan dengan kode yang justru sedang diketik.
export const metadata = { title: "Gabung acara" };

export default function JoinPage() {
  return <JoinClient />;
}
