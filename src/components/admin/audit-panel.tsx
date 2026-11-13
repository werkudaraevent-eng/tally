"use client";

import { CaretLeft, CaretRight, ClipboardText, Warning, XCircle } from "@phosphor-icons/react";
import { Button, ChipMenu, EmptyState, IconButton, Pane, PaneBody, PaneFooter, PaneHeader, SelectMenu } from "@/components/m3";
import { cx } from "@/lib/m3/cx";
import { useCallback, useEffect, useState } from "react";
import { formatEventDateTime } from "@/lib/datetime";
import { useEventTimeZone } from "@/lib/use-event-timezone";

type Entry = {
  id: number;
  action: string;
  payload: Record<string, unknown> | null;
  created_at: string;
  user_id: string | null;
  order_id: string | null;
  actor_username: string;
  actor_role: string | null;
};

type Actor = { id: string; username: string; role: string };

const CATEGORIES: Array<{ value: string; label: string }> = [
  { value: "config", label: "Setting changes" },
  { value: "settings", label: "Settings & leaderboard" },
  { value: "offers", label: "Special items" },
  { value: "booths", label: "Booth" },
  { value: "payment_methods", label: "Payment methods" },
  { value: "rundown", label: "Agenda" },
  { value: "undian", label: "Lucky draw" },
  { value: "participants", label: "Participants & registration" },
  { value: "messages", label: "Messages" },
  { value: "logistics", label: "Logistics" },
  { value: "users", label: "Users & roles" },
  { value: "danger", label: "Danger zone" },
  { value: "orders", label: "Orders" },
  { value: "sync", label: "Participant sync" },
  { value: "all", label: "All activity" },
];

const ACTION_LABEL: Record<string, string> = {
  settings_update: "Changed event settings",
  participant_check_in_reset: "Reset a participant's check-in",
  participant_luggage_reset: "Reset a participant's luggage",
  room_number_set_by_bot: "Filled in a room number",
  room_joined_by_bot: "Merged rooms",
  api_key_create: "Created an API key",
  api_key_revoke: "Revoked an API key",
  room_notice_send: "Sent room number notices",
  display_settings_update: "Changed the leaderboard",
  display_background_upload: "Replaced the leaderboard background",
  leaderboard_reveal_config: "Set up the staged reveal",
  leaderboard_reveal_start: "Started the staged reveal",
  leaderboard_reveal_reset: "Ended the staged reveal",
  leaderboard_exclusion_create: "Excluded from top spender",
  leaderboard_exclusion_update: "Changed a top spender exclusion",
  leaderboard_exclusion_delete: "Removed a top spender exclusion",
  special_offer_create: "Added a special item",
  special_offer_update: "Changed a special item",
  special_offer_delete: "Deleted a special item",
  booth_create: "Added a booth",
  booth_update: "Changed a booth",
  payment_method_create: "Added a payment method",
  payment_method_update: "Changed a payment method",
  payment_method_delete: "Deleted a payment method",
  rundown_header_update: "Changed the agenda header",
  rundown_section_create: "Added an agenda section",
  rundown_section_update: "Changed an agenda section",
  rundown_section_delete: "Deleted an agenda section",
  rundown_item_create: "Added an agenda row",
  rundown_item_update: "Changed an agenda row",
  rundown_item_delete: "Deleted an agenda row",
  rundown_item_reorder: "Reordered agenda rows",
  rundown_section_outfit_update: "Changed an agenda section's dress code",
  checkpoint_settings_update: "Changed check-in point settings",
  undian_settings_update: "Changed lucky draw settings",
  undian_prize_create: "Added a prize",
  undian_prize_update: "Changed a prize",
  undian_prize_delete: "Deleted a prize",
  undian_prize_reorder: "Reordered prizes",
  undian_draw: "Drew winners",
  undian_winner_confirm: "Confirmed a winner",
  undian_winner_reject: "Cancelled a winner",
  undian_mode_change: "Changed the draw screen mode",
  undian_reset: "Reset the lucky draw",
  undian_redraw: "Redrew a prize (earlier winners cancelled)",
  undian_rehearsal_on: "Started lucky draw rehearsal mode",
  undian_rehearsal_off: "Ended lucky draw rehearsal mode",
  undian_entry_import: "Imported a draw entry list",
  undian_entry_group_delete: "Deleted a draw entry list",
  undian_exclusion_add: "Excluded a participant from the draw",
  undian_exclusion_remove: "Returned a participant to the draw",
  undian_rule_create: "Added a draw exclusion rule",
  undian_rule_update: "Changed a draw exclusion rule",
  undian_rule_delete: "Deleted a draw exclusion rule",
  undian_session_start: "Started a draw round",
  undian_session_close: "Closed a draw round",
  undian_session_delete: "PERMANENTLY DELETED a draw round's results",
  undian_session_adopt: "Archived old draw results into a round",
  user_create: "Created an account",
  user_update: "Changed an account",
  access_role_create: "Created a custom role",
  access_role_update: "Changed a custom role",
  access_role_delete: "Deleted a custom role",
  participant_created: "Added a participant",
  participant_updated: "Changed participant details",
  participant_deleted: "Deleted a participant",
  participant_walkin_created: "Added a walk-in participant",
  registration_approved: "Approved a registration",
  registration_rejected: "Rejected a registration",
  invitation_delete: "Deleted an invited guest",
  invitation_new_link: "Created a new invitation link",
  announcement_create: "Created an announcement",
  announcement_update: "Changed an announcement",
  announcement_delete: "Deleted an announcement",
  announcement_email: "Sent an announcement by email",
  message_send: "Sent an email",
  message_schedule: "Scheduled an email",
  message_retry: "Resent failed emails",
  message_resume: "Resumed email sending",
  message_cancel: "Cancelled email sending",
  admin_reset_records: "Cleared records",
  participant_sync: "Synced participants from the Scanner API",
  participant_qr_archived: "Archived a participant's badge code",
  create: "Created an order",
  pay: "Marked paid",
  void: "Void order",
  admin_order_void: "Voided an order from admin",
  hand_over: "Handed over goods",
  booth_order_created: "Order made at a booth",
  participant_scan: "Scanned a participant",
};

// Label field dalam bahasa manusia. Tanpa ini, diff menampilkan nama kolom
// database yang tidak berarti bagi pembaca laporan audit.
const FIELD_LABEL: Record<string, string> = {
  pickup_mode: "Hand-over mode",
  name_display_mode: "Name display on the leaderboard",
  leaderboard_enabled: "Leaderboard",
  mode: "Reveal mode",
  stage: "Reveal stage",
  stages: "Stages",
  freeze_on_start: "Freeze numbers at start",
  snapshot: "Board snapshot",
  frozen_at: "Frozen at",
  pending_auto_void_minutes: "Auto-void (minutes)",
  cashier_confirmation_required: "Cashier confirmation",
  name: "Name",
  price: "Price",
  stock: "Stock",
  scope: "Scope",
  booth_id: "Booth",
  is_active: "Active",
  max_per_participant: "Max per participant",
  counts_toward_leaderboard: "Counts towards top spender",
  conditions: "Offer conditions",
  sort_order: "Position",
  username: "Username",
  role: "Role",
  discount_item_name: "Discount item name",
  discount_item_price: "Discount item price",
  discount_item_stock: "Discount item stock",
  discount_enabled: "Discount item active",
  discount_limit_per_participant: "Max discount items per participant",
  code: "Code",
  label: "Label",
  // Data peserta (participant_updated).
  company: "Organisation",
  title: "Job title",
  email: "Email",
  phone: "Phone",
  participant_type: "Participant type",
  rsvp_status: "RSVP",
  qr_code: "QR code",
  extra: "Form answers",
  requires_reference: "Needs a reference number",
  reference_digits: "Reference digits",
  // Setelan checkpoint (checkpoint_settings_update).
  checkpoints_enabled: "Check-in points shown in the participant area",
  checkpoint_points_enabled: "Check-in point points",
  points_goal: "Points goal",
  points_reward: "What the points are for",
  points_reward_en: "What the points are for (English)",
  // Field Papan peringkat. Dicantumkan sebagai satu kelompok utuh, bukan hanya
  // saklar yang baru ditambahkan: semuanya muncul di diff
  // `display_settings_update` yang sama, dan satu label rapi di antara belasan
  // nama kolom mentah terbaca seperti kesalahan, bukan seperti pilihan.
  show_amount: "Show spending amount",
  show_company: "Show participant organisation",
  show_booth_progress: "Show booth explorer panel",
  show_ticker: "Show bottom ticker",
  ticker_text: "Ticker text",
  event_title: "Event title",
  headline: "Headline",
  tagline: "Tagline",
  leaderboard_limit: "Number of top spenders",
  refresh_seconds: "Refresh (seconds)",
  background_color: "Background colour",
  text_color: "Text colour",
  accent_color: "Accent colour",
  background_image_url: "Background image",
};

// Field yang tidak berarti bagi pembaca audit, atau selalu berubah tanpa makna.
const HIDDEN_FIELDS = new Set(["id", "event_id", "updated_at", "updated_by", "created_at", "created_by", "pin_hash", "is_builtin", "source_synced_at"]);

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "empty";
  if (typeof value === "boolean") return value ? "on" : "off";
  if (typeof value === "number") return new Intl.NumberFormat("en-GB").format(value);
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

// Hanya field yang BENAR-BENAR berubah. Payload settings_update dan
// special_offer_update membawa objek old & new utuh; menampilkannya mentah berarti
// pembaca harus membandingkan belasan field sendiri untuk menemukan satu yang berubah.
function diffFields(payload: Record<string, unknown> | null): Array<{ field: string; from: string; to: string }> {
  if (!payload) return [];
  const old = payload.old as Record<string, unknown> | undefined;
  const next = payload.new as Record<string, unknown> | undefined;
  if (!old || !next) return [];

  const changes: Array<{ field: string; from: string; to: string }> = [];
  for (const key of new Set([...Object.keys(old), ...Object.keys(next)])) {
    if (HIDDEN_FIELDS.has(key)) continue;
    const before = JSON.stringify(old[key] ?? null);
    const after = JSON.stringify(next[key] ?? null);
    if (before !== after) changes.push({ field: FIELD_LABEL[key] ?? key, from: formatValue(old[key]), to: formatValue(next[key]) });
  }
  return changes;
}

// Ringkasan untuk payload yang tidak berbentuk old/new (create, delete, reset).
function summarise(entry: Entry): string {
  const payload = entry.payload ?? {};
  const subject = (payload.user ?? payload.booth ?? payload.new ?? payload.old) as Record<string, unknown> | undefined;
  if (entry.action === "admin_reset_records") {
    return `Deleted ${payload.deleted_orders ?? 0} orders, ${payload.deleted_claims ?? 0} item claims, ${payload.deleted_participants ?? 0} participants`;
  }
  if (entry.action === "participant_check_in_reset") {
    const scans = Array.isArray(payload.scans) ? payload.scans.length : 0;
    const pickups = Array.isArray(payload.pickups) ? payload.pickups.length : 0;
    const bagasi = Array.isArray(payload.luggage) ? payload.luggage.length : 0;
    return `${payload.participant_name ?? "?"} · ${payload.session_id ? "one check-in point" : "all check-in points"} · deleted ${scans} scans, ${pickups} kit items${bagasi ? `, ${bagasi} luggage records` : ""}`;
  }
  if (entry.action === "participant_luggage_reset") {
    const catatan = Array.isArray(payload.luggage) ? (payload.luggage as Array<{ bag_count?: number }>) : [];
    return `${payload.participant_name ?? "?"} · ${catatan.reduce((n, item) => n + (item.bag_count ?? 0), 0)} bags deleted`;
  }
  if (entry.action === "participant_sync") {
    const synced = payload.synced as Record<string, unknown> | undefined;
    return `${payload.fetched ?? 0} participants received · ${synced?.inserted ?? 0} new · ${synced?.newly_removed ?? 0} marked missing`;
  }
  if (entry.action === "room_number_set_by_bot") {
    const kamar = [payload.label, payload.hotel].filter(Boolean).join(" · ");
    return `${kamar || "Room"}: ${payload.old_number ?? "empty"} → ${payload.new_number ?? "?"} (${payload.participant_name ?? "?"})`;
  }
  if (entry.action === "room_joined_by_bot") {
    const pindah = Array.isArray(payload.moved) ? payload.moved.length : 0;
    return `${payload.from_label ?? "Room"} → ${[payload.label, payload.new_number].filter(Boolean).join(" ")} · ${payload.hotel ?? ""}: ${pindah} people (${payload.participant_name ?? "?"})`;
  }
  if (entry.action === "participant_qr_archived") {
    return `${payload.old_qr_code ?? "?"} → ${payload.new_qr_code ?? "?"}`;
  }
  // Peserta, pendaftaran, dan peran kustom menaruh namanya di tingkat atas payload atau di `role`.
  if (typeof payload.name === "string") return payload.name;
  const peran = payload.role as Record<string, unknown> | undefined;
  if (peran && typeof peran.name === "string") return peran.name;
  if (subject) {
    const name = subject.username ?? subject.name ?? subject.label ?? subject.code;
    return name ? String(name) : "";
  }
  return "";
}

export function AuditPanel() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [actors, setActors] = useState<Actor[]>([]);
  const [total, setTotal] = useState(0);
  const [category, setCategory] = useState("config");
  const [actor, setActor] = useState("");
  const [page, setPage] = useState(0);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const { zone, abbr } = useEventTimeZone();

  const PAGE_SIZE = 50;

  const load = useCallback(async (nextCategory: string, nextActor: string, pageIndex: number) => {
    setLoading(true); setError("");
    try {
      const params = new URLSearchParams({ category: nextCategory, limit: String(PAGE_SIZE), offset: String(pageIndex * PAGE_SIZE) });
      if (nextActor) params.set("actor", nextActor);
      const response = await fetch(`/api/admin/audit?${params}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) { setError(data.error?.message ?? "The audit trail could not be loaded."); return; }
      setEntries(data.entries ?? []);
      setActors(data.actors ?? []);
      setTotal(data.total ?? 0);
    } catch { setError("Connection lost. Try again."); } finally { setLoading(false); }
  }, []);

  useEffect(() => { const timer = window.setTimeout(() => { void load(category, actor, page); }, 0); return () => window.clearTimeout(timer); }, [load, category, actor, page]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const adaSaringan = category !== "config" || actor !== "";
  const resetSaringan = () => { setCategory("config"); setActor(""); setPage(0); };

  return (
    <Pane aria-label="Audit trail">
      <PaneHeader className="flex-wrap gap-2 px-3 py-3">
        <SelectMenu
          label="Category"
          value={category}
          onChange={(value) => { setCategory(value); setPage(0); }}
          options={CATEGORIES}
          width="15rem"
        />
        <ChipMenu
          label="Done by"
          searchable
          options={actors.map((item) => ({ value: item.id, label: item.username }))}
          selected={actor ? [actor] : []}
          onChange={(next) => { setActor(next[0] ?? ""); setPage(0); }}
        />
        <span className="ml-auto text-body-medium tabular-nums text-on-surface-variant">{total === 1 ? "1 entry" : `${total} entries`}</span>
      </PaneHeader>

      <PaneBody>
        {error ? (
          <div className="flex flex-wrap items-center gap-3 px-5 py-4">
            <p role="alert" className="flex min-w-0 flex-1 items-start gap-2 text-body-medium text-error"><XCircle size={16} className="mt-0.5 shrink-0" />{error}</p>
            <Button variant="outlined" size="sm" onClick={() => void load(category, actor, page)}>Try again</Button>
          </div>
        ) : loading && entries.length === 0 ? (
          <div aria-label="Loading audit trail">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="flex flex-col gap-2 border-b border-outline-variant px-5 py-4">
                <div className="h-3 w-64 animate-pulse rounded bg-surface-container-high" />
                <div className="h-3 w-40 animate-pulse rounded bg-surface-container-high" />
              </div>
            ))}
          </div>
        ) : entries.length === 0 ? (
          <EmptyState
            plain
            icon={<ClipboardText size={40} />}
            title="No entries for this filter"
            description="Pick another category or clear the Done by filter."
            action={adaSaringan ? <Button variant="outlined" size="sm" onClick={resetSaringan}>Reset filters</Button> : undefined}
          />
        ) : (
          <ul className={cx(loading && "opacity-60")}>
            {entries.map((entry) => {
              const changes = diffFields(entry.payload);
              const summary = summarise(entry);
              const isDanger = entry.action === "admin_reset_records";
              const open = expanded === entry.id;
              return (
                <li key={entry.id} className="border-b border-outline-variant last:border-b-0">
                  <div className="flex items-start gap-3 px-5 py-3.5">
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-body-medium font-medium text-on-surface">
                        {isDanger ? <Warning size={16} weight="fill" className="shrink-0 text-error" aria-hidden /> : null}
                        {ACTION_LABEL[entry.action] ?? entry.action}
                        {summary ? <span className="font-normal text-on-surface-variant">· {summary}</span> : null}
                      </p>
                      <p className="mt-0.5 text-body-medium text-on-surface-variant">
                        <span className="text-on-surface">{entry.actor_username}</span>
                        {entry.actor_role ? <span> ({entry.actor_role})</span> : null}
                        {" · "}<span className="tabular-nums">{formatEventDateTime(entry.created_at, zone)} {abbr}</span>
                      </p>

                      {/* Hanya field yang berubah, bukan seluruh payload. */}
                      {changes.length > 0 ? (
                        <ul className="mt-2 flex flex-col gap-1 rounded-md bg-surface-container-high px-3 py-2 text-body-medium">
                          {changes.map((change) => (
                            <li key={change.field} className="flex flex-wrap items-baseline gap-1.5">
                              <span className="font-medium">{change.field}:</span>
                              <span className="text-on-surface-variant line-through">{change.from}</span>
                              <span aria-hidden="true">→</span>
                              <span className="font-medium text-on-surface">{change.to}</span>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                    {entry.payload ? (
                      <Button variant="text" size="sm" aria-expanded={open} onClick={() => setExpanded(open ? null : entry.id)}>
                        {open ? "Hide details" : "Details"}
                      </Button>
                    ) : null}
                  </div>
                  {open ? <pre className="overflow-x-auto whitespace-pre-wrap break-words border-t border-outline-variant bg-surface-container-high px-5 py-3 font-sans text-body-small leading-5">{JSON.stringify(entry.payload, null, 2)}</pre> : null}
                </li>
              );
            })}
          </ul>
        )}
      </PaneBody>

      <PaneFooter
        className="bg-surface-container-lowest py-2"
        note="Recorded automatically for settings, special items, booths, payment methods, accounts and cleared records."
      >
        <IconButton size="sm" variant="outlined" label="Previous page" disabled={page === 0 || loading} onClick={() => setPage((current) => Math.max(0, current - 1))}><CaretLeft size={16} /></IconButton>
        <span className="min-w-14 text-center text-body-medium tabular-nums text-on-surface-variant">{page + 1} / {totalPages}</span>
        <IconButton size="sm" variant="outlined" label="Next page" disabled={page + 1 >= totalPages || loading || Boolean(error)} onClick={() => setPage((current) => (current + 1 < totalPages ? current + 1 : current))}><CaretRight size={16} /></IconButton>
      </PaneFooter>
    </Pane>
  );
}
