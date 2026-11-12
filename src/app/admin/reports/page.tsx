"use client";

import { ArrowClockwise, Storefront, XCircle } from "@phosphor-icons/react";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { ExportMenu } from "@/components/admin/export-menu";
import { Banner, Button, EmptyState, StatusChip, WorkspaceHeader, WorkspacePage } from "@/components/m3";
import { cx } from "@/lib/m3/cx";
import { Skeleton } from "@/components/m3/skeleton";

type Report = {
  summary: { total_revenue: number; gross_regular: number; total_orders: number; paid_orders: number; pending_orders: number; void_orders: number; discount_claims: number };
  booths: Array<{ id: number; code: string; name: string; orders: number; paid: number; revenue: number; discounts: number }>;
  participants: { total: number; checked_in: number; total_scans: number };
};

const angka = (value: number) => new Intl.NumberFormat("id-ID").format(value);
const money = (value: number) => `Rp ${angka(value)}`;

function Kartu({ label, value, note, chip }: { label: string; value: ReactNode; note: ReactNode; chip?: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-outline-variant bg-surface-container-lowest px-5 py-4">
      <span className="flex items-center gap-2 text-body-medium text-on-surface-variant">
        <span className="min-w-0 flex-1">{label}</span>
        {chip}
      </span>
      <span className="text-headline-small font-semibold tabular-nums">{value}</span>
      <span className="text-body-medium text-on-surface-variant">{note}</span>
    </div>
  );
}

const TH = "border-b border-outline-variant px-5 py-2.5 font-medium";
const TD = "border-b border-outline-variant px-5 py-3";

export default function ReportsPage() {
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/admin/reports", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message ?? "Could not load the report.");
      setReport(data);
    } catch (loadError: unknown) {
      setError(loadError instanceof Error && loadError.message !== "Failed to fetch" ? loadError.message : "Connection lost. The report could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { const timer = window.setTimeout(() => { void load(); }, 0); return () => window.clearTimeout(timer); }, [load]);

  // Baris Total dijumlahkan dari baris booth yang tampil, supaya selalu sama
  // dengan jumlah kolomnya sendiri.
  const jumlah = report ? report.booths.reduce(
    (acc, booth) => ({ orders: acc.orders + booth.orders, paid: acc.paid + booth.paid, discounts: acc.discounts + booth.discounts, revenue: acc.revenue + booth.revenue }),
    { orders: 0, paid: 0, discounts: 0, revenue: 0 },
  ) : null;

  return (
    <WorkspacePage width="wide">
      <WorkspaceHeader
        meta={<span>Revenue counts only paid and handed-over orders. Match it with the cashier settlement.</span>}
        actions={<ExportMenu />}
      />

      {error ? (
        <Banner tone="error" icon={<XCircle size={18} />} actions={<Button variant="outlined" size="sm" icon={<ArrowClockwise size={16} />} loading={loading} onClick={() => void load()}>Try again</Button>}>
          {error}
        </Banner>
      ) : null}

      {/* Empat metrik */}
      <section aria-label="Summary" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {report ? (
          <>
            <Kartu label="Paid revenue" value={money(report.summary.total_revenue)} note={`From ${angka(report.summary.paid_orders)} paid orders`} />
            <Kartu label="Paid orders" value={angka(report.summary.paid_orders)} note={report.summary.void_orders > 0 ? `From ${angka(report.summary.total_orders)} orders, ${angka(report.summary.void_orders)} void` : `From ${angka(report.summary.total_orders)} orders`} />
            <Kartu
              label="Pending"
              value={angka(report.summary.pending_orders)}
              note="Not paid at the cashier"
              chip={report.summary.pending_orders > 0 ? <StatusChip dot tone="warning">Needs follow-up</StatusChip> : null}
            />
            <Kartu label="Discount claims" value={angka(report.summary.discount_claims)} note="Orders with a discount item, excluding void" />
          </>
        ) : !error ? [0, 1, 2, 3].map((index) => (
          <div key={index} aria-hidden className="flex flex-col gap-2 rounded-lg border border-outline-variant bg-surface-container-lowest px-5 py-4">
            <Skeleton className="h-3.5 w-24" /><Skeleton className="h-7 w-36" /><Skeleton className="h-3.5 w-32" />
          </div>
        )) : null}
      </section>

      {/* Rekonsiliasi per booth */}
      {report || !error ? (
        <section aria-labelledby="judul-rekonsiliasi" className="flex flex-col overflow-hidden rounded-lg border border-outline-variant bg-surface-container-lowest">
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-outline-variant px-5 py-3.5">
            <h2 id="judul-rekonsiliasi" className="min-w-0 flex-1 text-body-medium font-semibold">Reconciliation per booth</h2>
            <span className="text-body-medium text-on-surface-variant">The Orders column includes void; Revenue counts paid orders only</span>
          </div>
          {!report ? (
            <div aria-label="Loading reconciliation" className="flex flex-col">
              {Array.from({ length: 5 }, (_, i) => (
                <div key={i} className="flex items-center gap-6 border-b border-outline-variant px-5 py-4 last:border-b-0">
                  <Skeleton className="h-3 w-40" /><Skeleton className="ml-auto h-3 w-24" />
                </div>
              ))}
            </div>
          ) : report.booths.length === 0 ? (
            <EmptyState plain icon={<Storefront size={40} />} title="No booths yet" description="Reconciliation appears once booths are created in Booths & items and start recording orders." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] border-separate border-spacing-0 text-left text-body-medium">
                <thead className="bg-surface-container-high text-on-surface-variant">
                  <tr>
                    <th scope="col" className={TH}>Booth</th>
                    <th scope="col" className={cx(TH, "text-right")}>Order</th>
                    <th scope="col" className={cx(TH, "text-right")}>Paid</th>
                    <th scope="col" className={cx(TH, "text-right")}>Discount</th>
                    <th scope="col" className={cx(TH, "text-right")}>Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {report.booths.map((booth) => (
                    <tr key={booth.id}>
                      <th scope="row" className={cx(TD, "font-normal text-on-surface")}>{booth.code} · {booth.name}</th>
                      <td className={cx(TD, "text-right tabular-nums")}>{angka(booth.orders)}</td>
                      <td className={cx(TD, "text-right tabular-nums")}>{angka(booth.paid)}</td>
                      <td className={cx(TD, "text-right tabular-nums")}>{angka(booth.discounts)}</td>
                      <td className={cx(TD, "text-right tabular-nums")}>{money(booth.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
                {jumlah ? (
                  <tfoot className="bg-surface-container-high font-medium">
                    <tr>
                      <th scope="row" className="px-5 py-3 font-medium">Total</th>
                      <td className="px-5 py-3 text-right tabular-nums">{angka(jumlah.orders)}</td>
                      <td className="px-5 py-3 text-right tabular-nums">{angka(jumlah.paid)}</td>
                      <td className="px-5 py-3 text-right tabular-nums">{angka(jumlah.discounts)}</td>
                      <td className="px-5 py-3 text-right tabular-nums">{money(jumlah.revenue)}</td>
                    </tr>
                  </tfoot>
                ) : null}
              </table>
            </div>
          )}
        </section>
      ) : null}

      {/* Data peserta dari sumber */}
      {report ? (
        <section aria-labelledby="judul-peserta" className="overflow-hidden rounded-lg border border-outline-variant bg-surface-container-lowest">
          <div className="border-b border-outline-variant px-5 py-3.5">
            <h2 id="judul-peserta" className="text-body-medium font-semibold">Participant & attendance data</h2>
          </div>
          <dl className="grid gap-px bg-outline-variant sm:grid-cols-3">
            {([
              ["Participants copied", report.participants.total, "Active participants, excluding those deleted at the source"],
              ["Check-ins from the source", report.participants.checked_in, "According to the Scanner API"],
              ["Total scans", report.participants.total_scans, "According to the Scanner API"],
            ] as const).map(([label, value, note]) => (
              <div key={label} className="flex flex-col gap-1 bg-surface-container-lowest px-5 py-4">
                <dt className="text-body-medium text-on-surface-variant">{label}</dt>
                <dd className="text-headline-small font-semibold tabular-nums">{angka(value)}</dd>
                <dd className="text-body-medium text-on-surface-variant">{note}</dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}
    </WorkspacePage>
  );
}
