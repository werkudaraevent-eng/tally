// Dipakai lewat `node --import ./scripts/m3/register.mjs <skrip>`.
// Lihat resolve-hook.mjs untuk alasannya.
import { register } from "node:module";

register("./resolve-hook.mjs", import.meta.url);
