"use client";
import { useState } from "react";

import { useT } from "@/hooks/i18n/useT";
import { usePreviewDaCadencia } from "@/hooks/cadencia/useCadencias";
import { Button } from "@/components/ui/button";
import { Eye } from "@/lib/ui/icons";

/** O que a tela diz quando a variante não renderiza — o mesmo motivo que o motor registra. */
const MOTIVOS: Record<string, string> = {
  variavel_sem_valor: "Falta um dado deste lead. Use um fallback, ex.: {{primeiro_nome|tudo bem}}.",
  variavel_desconhecida: "Variável que não existe. Confira o nome entre {{ }}.",
  spintax_invalido: "Uma variação {a|b} está sem fechar.",
};

/**
 * PRÉVIA COM UM LEAD DE VERDADE — o texto que ESTE lead receberia em cada
 * variação, pela mesma leitura que o motor faz no envio. Se a prévia falha, o
 * envio falharia igual: o motivo aparece aqui antes de a régua ir ao ar.
 */
export function PreviewDaMensagem({
  cadenciaId,
  leads,
  variantes,
}: {
  cadenciaId: string;
  leads: Array<{ id: string; title: string }>;
  variantes: string[];
}) {
  const t = useT();
  const [leadId, setLeadId] = useState(leads[0]?.id ?? "");
  const preview = usePreviewDaCadencia(cadenciaId);
  const validas = variantes.map((v) => v.trim()).filter(Boolean);

  return (
    <div className="space-y-2 rounded-md border border-dashed border-border p-3">
      <div className="flex items-center gap-2">
        <select
          aria-label={t("Lead de amostra")}
          className="h-9 min-w-0 flex-1 rounded-md border border-border bg-background px-2 text-sm"
          value={leadId}
          onChange={(e) => setLeadId(e.target.value)}
        >
          {leads.length === 0 && <option value="">{t("Nenhum lead neste funil")}</option>}
          {leads.map((l) => (
            <option key={l.id} value={l.id}>
              {l.title}
            </option>
          ))}
        </select>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!leadId || validas.length === 0 || preview.isPending}
          onClick={() => preview.mutate({ lead_id: leadId, variantes: validas })}
        >
          <Eye size={14} className="mr-1" aria-hidden /> {t("Prévia")}
        </Button>
      </div>
      {preview.isError && <p className="text-xs text-destructive">{t("Não foi possível gerar a prévia.")}</p>}
      {preview.data?.map((v) => (
        <div key={v.indice} className="rounded-md bg-muted/50 p-2 text-sm">
          <p className="mb-1 text-xs text-text-muted">
            {t("Variação")} {v.indice + 1}
          </p>
          {v.ok ? (
            <p className="whitespace-pre-wrap">{v.texto}</p>
          ) : (
            <p className="text-destructive">
              {t(MOTIVOS[v.motivo ?? ""] ?? "Esta variação não renderiza.")}
              {v.faltando && v.faltando.length > 0 ? ` (${v.faltando.join(", ")})` : ""}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
