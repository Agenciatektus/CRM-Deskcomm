"use client";
import { useState } from "react";
import { toast } from "sonner";

import { useT } from "@/hooks/i18n/useT";
import { usePermission } from "@/hooks/auth/AuthProvider";
import { useCadencias, useInscreverNaCadencia, type PreviaDaInscricao } from "@/hooks/cadencia/useCadencias";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/** Por que um negócio não entrou — o mesmo vocabulário de `lib/cadencia/inscrever.ts`. */
const MOTIVOS: Record<string, string> = {
  negocio_fora_do_funil: "não é deste funil",
  negocio_fechado: "negócio já fechado",
  negocio_sem_contato: "negócio sem contato",
  contato_indisponivel: "contato indisponível",
  contato_bloqueado_ou_optout: "contato bloqueado ou pediu para sair",
  telefone_suprimido: "telefone pediu para sair em outro cadastro",
  sem_telefone: "contato sem telefone",
  teto_do_dia: "passou do limite de inscrições de hoje",
  ja_em_outro_fluxo: "já está em outra régua",
};

/**
 * "INSCREVER NA CADÊNCIA" — a ação em lote do Kanban.
 *
 * Duas etapas, e a primeira não é opcional: a PRÉVIA diz quantos entram hoje e
 * por que os outros não, e só então o gestor confirma. A confirmação leva o
 * número que ele viu; se o servidor contar diferente, recusa e pede nova prévia.
 */
export function InscreverNaCadencia(props: { pipelineId: string; leadIds: string[]; onConcluido: () => void }) {
  // Sem permissão, nada monta — nem as consultas: quem não inscreve (abaixo de
  // manager, o piso da API) não precisa buscar a lista de cadências.
  const podeInscrever = usePermission("pipeline.create");
  return podeInscrever ? <BotaoEDialogo {...props} /> : null;
}

function BotaoEDialogo({
  pipelineId,
  leadIds,
  onConcluido,
}: {
  pipelineId: string;
  leadIds: string[];
  onConcluido: () => void;
}) {
  const t = useT();
  const [aberto, setAberto] = useState(false);
  const [cadenciaId, setCadenciaId] = useState("");
  const [previa, setPrevia] = useState<PreviaDaInscricao | null>(null);
  const { data: cadencias } = useCadencias(pipelineId);
  const { previa: pedirPrevia, confirmar } = useInscreverNaCadencia(pipelineId);
  const noAr = (cadencias ?? []).filter((c) => c.status === "active");

  const fechar = () => {
    setAberto(false);
    setPrevia(null);
  };

  const motivosAgrupados = previa
    ? Object.entries(
        previa.recusados.reduce<Record<string, number>>((acc, r) => {
          acc[r.motivo] = (acc[r.motivo] ?? 0) + 1;
          return acc;
        }, {}),
      )
    : [];

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setAberto(true)}>
        {t("Inscrever na cadência")}
      </Button>
      <Dialog open={aberto} onOpenChange={(v) => (v ? setAberto(true) : fechar())}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("Inscrever na cadência")}</DialogTitle>
            <DialogDescription>
              {leadIds.length} {t("negócio(s) selecionado(s). Confira a prévia antes de confirmar.")}
            </DialogDescription>
          </DialogHeader>

          {noAr.length === 0 ? (
            <p className="text-sm text-text-muted">
              {t("Nenhuma cadência publicada neste funil. Crie e publique uma na aba Cadências.")}
            </p>
          ) : (
            <select
              aria-label={t("Cadência")}
              className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm"
              value={cadenciaId}
              onChange={(e) => {
                setCadenciaId(e.target.value);
                setPrevia(null);
              }}
            >
              <option value="" disabled>
                {t("Escolha a cadência")}
              </option>
              {noAr.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          )}

          {previa && (
            <div className="space-y-1 rounded-md bg-muted/50 p-3 text-sm" data-testid="previa-da-inscricao">
              <p>
                <span className="font-medium tabular-nums">{previa.entram_hoje}</span> {t("entram hoje")}
                {" · "}
                {t("cabem")} {previa.cabem_hoje} {t("hoje nesta cadência")}
              </p>
              {motivosAgrupados.map(([motivo, n]) => (
                <p key={motivo} className="text-text-muted">
                  {n} {t(MOTIVOS[motivo] ?? "não entram")}
                </p>
              ))}
            </div>
          )}
          {(pedirPrevia.isError || confirmar.isError) && (
            <p className="text-sm text-destructive" role="alert">
              {(pedirPrevia.error ?? confirmar.error) instanceof Error
                ? (pedirPrevia.error ?? confirmar.error)!.message
                : t("Não foi possível inscrever.")}
            </p>
          )}

          <DialogFooter>
            <Button variant="ghost" onClick={fechar}>
              {t("Cancelar")}
            </Button>
            {!previa ? (
              <Button
                disabled={!cadenciaId || pedirPrevia.isPending}
                onClick={() =>
                  pedirPrevia.mutate({ cadenciaId, leadIds }, { onSuccess: (p) => setPrevia(p) })
                }
              >
                {t("Ver prévia")}
              </Button>
            ) : (
              <Button
                disabled={previa.entram_hoje === 0 || confirmar.isPending}
                onClick={() =>
                  confirmar.mutate(
                    { cadenciaId, leadIds, confirmCount: previa.entram_hoje },
                    {
                      onSuccess: (r) => {
                        // Toast, e não texto no diálogo: `onConcluido` limpa a
                        // seleção, a barra some e leva o diálogo junto.
                        toast.success(`${r.inscritos} ${t("inscrito(s) na cadência.")}`);
                        fechar();
                        onConcluido();
                      },
                    },
                  )
                }
              >
                {t("Confirmar")} {previa.entram_hoje}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
