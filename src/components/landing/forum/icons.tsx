import type { Icon } from "@phosphor-icons/react";
import {
  AirplaneTilt, Bus, Buildings, FirstAidKit, IdentificationCard, Info, ListChecks, MapPin, Phone, Receipt, TShirt, WifiHigh,
} from "@phosphor-icons/react/dist/ssr";
import type { LandingForumIcon } from "@/lib/domain";

/** Ikon ubin Informasi praktis. Kunci yang tidak dikenal jatuh ke Info. */
export const FORUM_ICONS: Record<LandingForumIcon, Icon> = {
  plane: AirplaneTilt,
  visa: IdentificationCard,
  tax: Receipt,
  venue: MapPin,
  list: ListChecks,
  health: FirstAidKit,
  info: Info,
  shirt: TShirt,
  bus: Bus,
  hotel: Buildings,
  wifi: WifiHigh,
  phone: Phone,
};
