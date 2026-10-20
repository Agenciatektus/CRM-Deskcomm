import { nomeDoCard } from "@/lib/kanban/identidade-do-card";
import { resolveLeadOwner } from "@/lib/kanban/owner";
import { origemDoLead, rotuloDaOrigem } from "@/lib/kanban/recorte-do-funil";
import { rotuloDoTempo, tempoNaEtapa } from "@/lib/kanban/tempo-na-etapa";
import type { Stage } from "@/lib/kanban/types";
import type { Lead } from "@/lib/types/leads";

/**
 * As linhas do CSV dos selecionados, com as colunas da Lista do Funil: nome,
 * telefone, etapa, valor, responsável, próximo passo, parado há e origem. Só os
 * negócios que estão NA TELA (`leads` é o recorte, na ordem que a pessoa vê)
 * e marcados entram.
 */
export function linhasDoCsv(
  leads: Lead[],
  selecionados: string[],
  ctx: {
    stages: Stage[];
    ownerNames: Map<string, string | null>;
    t: (texto: string) => string;
    agora?: Date;
    formatarData?: (d: Date) => string;
  },
): string[][] {
  const { t, stages, ownerNames } = ctx;
  const agora = ctx.agora ?? new Date();
  const formatar = ctx.formatarData ?? ((d: Date) => d.toLocaleString());
  const marcados = new Set(selecionados);
  const etapa = new Map(stages.map((s) => [s.id, s]));
  const cabecalho = ["Nome", "Telefone", "Etapa", "Valor", "Responsável", "Próximo passo", "Parado há", "Origem"].map(t);
  const linhas = leads
    .filter((l) => marcados.has(l.id))
    .map((l) => {
      const st = etapa.get(l.stage_id);
      const horas = (agora.getTime() - new Date(l.stage_changed_at ?? l.created_at).getTime()) / 3_600_000;
      const tempo = tempoNaEtapa(horas, st?.expected_duration_hours);
      const passo = l.proximo_passo;
      return [
        nomeDoCard(l).nome || t("Sem nome"),
        l.contact_phone ?? "",
        st?.name ?? "",
        l.value_cents && l.value_cents > 0 ? (l.value_cents / 100).toFixed(2).replace(".", ",") : "",
        resolveLeadOwner(l, ownerNames).name ?? "",
        passo ? (passo.prazo ? `${passo.titulo} (${formatar(new Date(passo.prazo))})` : passo.titulo) : "",
        tempo ? rotuloDoTempo(tempo, t) : "",
        t(rotuloDaOrigem(origemDoLead(l))),
      ];
    });
  return [cabecalho, ...linhas];
}
