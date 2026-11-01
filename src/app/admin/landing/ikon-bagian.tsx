import {
  AddressBook, Browser, CalendarBlank, Cards, ChartBar, CheckSquare, Columns, DownloadSimple, Handshake, ImageSquare, Images, Info,
  ListNumbers, MapPin, MapTrifold, Megaphone, Microphone, Question, Quotes, SignIn, SquareHalfBottom, Timer, TShirt,
  type Icon,
} from "@phosphor-icons/react";
import type { LandingBlockType, LandingSectionId } from "@/lib/domain";

/**
 * Ikon jenis di daftar Page sections, menggantikan nomor urut: urutan sudah
 * terbaca dari posisinya, jenisnya belum. `Record` penuh, jadi jenis blok baru
 * di src/lib/blok/jenis.ts gagal dikompilasi sampai diberi ikon di sini.
 */
export const IKON_BLOK: Record<LandingBlockType, Icon> = {
  text_image: ImageSquare,
  multicolumn: Columns,
  cards: Cards,
  points: ListNumbers,
  stats: ChartBar,
  logos: Handshake,
  download: DownloadSimple,
  cta: Megaphone,
  countdown: Timer,
  gallery: Images,
  quote: Quotes,
  route: MapTrifold,
  dos_donts: CheckSquare,
  dress_code: TShirt,
};

export const IKON_BAGIAN: Record<LandingSectionId | "pembuka" | "kaki" | "portal", Icon> = {
  pembuka: Browser,
  about: Info,
  highlights: ChartBar,
  agenda: CalendarBlank,
  speakers: Microphone,
  venue: MapPin,
  faq: Question,
  sponsors: Handshake,
  contact: AddressBook,
  portal: SignIn,
  kaki: SquareHalfBottom,
};
