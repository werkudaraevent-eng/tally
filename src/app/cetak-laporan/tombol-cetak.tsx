"use client";

import { Printer } from "@phosphor-icons/react";
import { Button } from "@/components/m3";

export function TombolCetak({ label }: { label: string }) {
  return <Button icon={<Printer size={18} aria-hidden />} onClick={() => window.print()}>{label}</Button>;
}
