"use client";
import { useT } from "@/hooks/i18n/useT";
import { DownloadSimple, FileText } from "@/lib/ui/icons";

import { formatBytes, mediaFileLabel, mediaSrc } from "./media-utils";

interface Props {
  messageId: string;
  mime: string | null;
  sizeBytes: number | null;
  storagePath: string | null;
  /** Mantido por compatibilidade: o cartão usa as mesmas cores nos dois lados (visual v2). */
  isOutbound?: boolean;
  /** Fonte alternativa para mídia de NOTA interna (#1863, F3) — ver ImageMedia. */
  src?: string;
}

/** Card de documento: rótulo (PDF/MP4/…), tamanho e download. */
export function DocumentCard({ messageId, mime, sizeBytes, storagePath, src }: Props) {
  const t = useT();
  const label = mediaFileLabel(mime, storagePath);
  return (
    <a
      href={src ?? mediaSrc(messageId)}
      target="_blank"
      rel="noreferrer"
      aria-label={`${t("Baixar")} ${label} (${formatBytes(sizeBytes)})`}
      // Um tom do próprio texto (`bg-text/5`) funciona sobre qualquer bolha,
      // nos dois temas, sem uma regra por lado da conversa.
      className="-mx-1.5 flex w-64 max-w-full items-center gap-3 rounded-xl bg-text/5 p-2 transition-colors hover:bg-text/10"
    >
      <span
        className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent-700 dark:text-accent-300"
      >
        <FileText size={20} weight="duotone" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{label}</span>
        <span className="block text-xs text-text-subtle">{formatBytes(sizeBytes)}</span>
      </span>
      <DownloadSimple size={18} className="shrink-0 text-text-muted" aria-hidden />
    </a>
  );
}
