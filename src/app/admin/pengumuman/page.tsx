"use client";

import { useRouter } from "next/navigation";
import { EnvelopeSimple, Plus, Warning } from "@phosphor-icons/react";
import { useCallback, useEffect, useState } from "react";
import Link from "@/components/event-link";
import {
  Banner,
  Button,
  EmptyState,
  MetaSeparator,
  StatusChip,
  Table,
  TableBody,
  TableCard,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
  TableSkeleton,
  WorkspaceHeader,
  WorkspacePage,
} from "@/components/m3";
import { useToast } from "@/components/toast";
import { withEventPrefix } from "@/lib/event-path";
import { plural } from "@/lib/plural";
import { PesanTabs } from "./pesan-tabs";
import { BLAST_STATUS_LABEL, BLAST_STATUS_TONE, audienceLabel, waktu, type BlastStatus } from "./pesan-shared";

/**
 * Tab Kiriman di menu Pesan peserta: semua kiriman email acara ini.
 *
 * "Sudah masuk" adalah ukuran keberhasilan kiriman (peserta yang masuk ke area
 * peserta setelah kiriman berangkat), dihitung server untuk semua baris dari
 * satu ringkasan per acara.
 */

type Item = {
  id: string;
  title: string;
  kind: "undangan" | "info" | "invitation";
  channel: "email" | "whatsapp" | "keduanya";
  audience: { jenis?: string; label?: string; perusahaan?: string[] } | null;
  status: BlastStatus;
  scheduled_at: string | null;
  sent_at: string | null;
  finished_at: string | null;
  created_at: string;
  recipients: number | null;
  failed: number;
  signed_in: number | null;
};

type Muat = { ready: boolean; items: Item[]; email_configured: boolean; member_enabled: boolean; time_zone?: string };

const SALURAN: Record<Item["channel"], string> = { email: "Email", whatsapp: "WhatsApp", keduanya: "Email + WhatsApp" };

export default function KirimanPage() {
  const toast = useToast();
  const router = useRouter();
  const [data, setData] = useState<Muat | null>(null);
  const [membuat, setMembuat] = useState(false);

  const muat = useCallback(async () => {
    const response = await fetch("/api/admin/pesan", { cache: "no-store" }).catch(() => null);
    if (!response?.ok) {
      toast.error("Couldn't load blasts", "Reload the page.");
      return;
    }
    setData((await response.json()) as Muat);
  }, [toast]);

  useEffect(() => {
    // Muat dari server saat halaman dibuka atau saringan berubah.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void muat();
  }, [muat]);

  async function buat() {
    setMembuat(true);
    const response = await fetch("/api/admin/pesan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "undangan" }),
    }).catch(() => null);
    const body = await response?.json().catch(() => null);
    setMembuat(false);
    if (!response?.ok) {
      toast.error("Couldn't create the blast", body?.error?.message ?? "Try again.");
      return;
    }
    router.push(withEventPrefix(`/admin/pengumuman/kiriman/${body.id}`, window.location.pathname));
  }

  const items = data?.items ?? [];

  return (
    <div lang="en" className="contents">
    <WorkspacePage>
      <WorkspaceHeader
        meta={
          data?.ready ? (
            <>
              <span className="tabular-nums">{plural(items.length, "blast")}</span>
              <MetaSeparator />
              <span>WhatsApp not connected yet</span>
            </>
          ) : null
        }
        actions={
          data?.ready ? (
            <Button onClick={() => void buat()} loading={membuat} icon={<Plus size={16} weight="bold" />}>
              New blast
            </Button>
          ) : undefined
        }
      />
      <PesanTabs />

      {data && !data.ready ? (
        <Banner tone="warning" icon={<Warning size={18} />}>
          Blasts aren&apos;t available yet: database migration 202610030003 hasn&apos;t been run on Supabase.
        </Banner>
      ) : data && !data.email_configured ? (
        <Banner tone="warning" icon={<Warning size={18} />}>
          Email sending isn&apos;t set up on the server yet (RESEND_API_KEY and EMAIL_FROM). You can still write drafts.
        </Banner>
      ) : null}

      {!data ? (
        <TableCard>
          <TableSkeleton rows={4} cols={5} />
        </TableCard>
      ) : data.ready && items.length === 0 ? (
        <EmptyState
          icon={<EnvelopeSimple size={28} />}
          title="No blasts yet"
          description="Email a sign-in link to participants who have never signed in, or an update to all participants."
          action={
            <Button onClick={() => void buat()} loading={membuat} icon={<Plus size={16} weight="bold" />}>
              New blast
            </Button>
          }
        />
      ) : data.ready ? (
        <TableCard>
          <Table minWidth="840px">
            <TableHead>
              <TableRow>
                <TableHeaderCell>Blast</TableHeaderCell>
                <TableHeaderCell>Channel</TableHeaderCell>
                <TableHeaderCell align="end">Recipients</TableHeaderCell>
                <TableHeaderCell align="end">Signed in</TableHeaderCell>
                <TableHeaderCell>Status</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {items.map((item) => {
                const kapan =
                  item.status === "terjadwal" && item.scheduled_at
                    ? waktu(item.scheduled_at, data.time_zone)
                    : item.status === "selesai" && item.finished_at
                      ? waktu(item.finished_at, data.time_zone)
                      : item.status === "draf"
                        ? `Edited ${waktu(item.created_at, data.time_zone)}`
                        : null;
                return (
                  <TableRow key={item.id} interactive className="relative">
                    <TableCell strong>
                      <Link href={`/admin/pengumuman/kiriman/${item.id}`} className="block after:absolute after:inset-0">
                        {item.title}
                      </Link>
                      <span className="block text-body-small font-normal text-on-surface-variant">{audienceLabel(item.audience)}</span>
                    </TableCell>
                    <TableCell>{SALURAN[item.channel]}</TableCell>
                    <TableCell align="end" numeric>
                      {item.recipients ?? "–"}
                    </TableCell>
                    <TableCell align="end" numeric>
                      {item.signed_in == null || !item.recipients ? (
                        "–"
                      ) : (
                        <>
                          {item.signed_in}
                          {item.kind === "invitation" ? " registered" : null}{" "}
                          <span className="text-on-surface-variant">({Math.round((item.signed_in / item.recipients) * 100)}%)</span>
                        </>
                      )}
                    </TableCell>
                    <TableCell>
                      <span className="flex flex-wrap items-center gap-2">
                        <StatusChip tone={BLAST_STATUS_TONE[item.status]}>{BLAST_STATUS_LABEL[item.status]}</StatusChip>
                        {kapan ? <span className="text-body-small text-on-surface-variant">{kapan}</span> : null}
                      </span>
                      {item.failed > 0 ? <span className="mt-0.5 block text-body-small text-error">{item.failed} failed</span> : null}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableCard>
      ) : null}
    </WorkspacePage>
    </div>
  );
}
