"use client";

import { toast } from "sonner";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useT } from "@/hooks/i18n/useT";
import { useAssignableMembers } from "@/hooks/inbox/useAssignableMembers";
import { useEditLead } from "@/hooks/kanban/useUpdateLead";
import { apiClient } from "@/lib/api/client";
import type { UpdateLeadInput } from "@/lib/schemas/leads";

import type { LeadRow } from "./tipos";

const SEM_DONO = "__sem_dono__";
const AGENTE = "__agente__";

/**
 * Trocar o responsável do negócio, pelo MESMO PATCH que o menu do card usa
 * (`owner_user_id`). A lista é `GET /api/v1/team/assignable`: membros ativos
 * `agent`+, a exceção mínima que já existe para a transferência de conversa.
 *
 * É a única ação do painel com "Desfazer", porque é a única que um segundo PATCH
 * devolve EXATAMENTE ao estado de antes (o dono anterior, humano ou agente).
 *
 * ⚠️ O Desfazer RELÊ o dono antes de devolver (revisão do @Cassio_SecRev, P3):
 * se outra pessoa trocou o responsável depois de nós, devolver ao anterior
 * apagaria a decisão dela sem que ninguém visse. O PATCH do lead não aceita
 * precondição por `updated_at`, então a guarda é ler e comparar; sobra uma
 * janela de milissegundos entre a leitura e a escrita, declarada aqui.
 */
async function donoAtual(contactId: string, leadId: string): Promise<{ owner_user_id?: string | null; owner_agent_id?: string | null } | null> {
  const r = await apiClient.get<{ data: { leads?: LeadRow[] } }>(`/api/v1/contacts/${contactId}/crm-summary`);
  return r?.data?.leads?.find((l) => l.id === leadId) ?? null;
}

export function ResponsavelDoNegocio({ lead, contactId, podeMexer, onMudou }: {
  lead: LeadRow;
  contactId: string | null;
  podeMexer: boolean;
  onMudou: () => void;
}) {
  const t = useT();
  const membros = useAssignableMembers(podeMexer);
  const editar = useEditLead(lead.pipeline_id);
  // A rota devolve lista; qualquer outra forma (resposta antiga, dublê de teste)
  // vira "ninguém para escolher" em vez de derrubar o painel.
  const lista = Array.isArray(membros.data) ? membros.data : [];

  // Sem o campo na resposta (cache de antes dele existir) não dá para afirmar
  // quem é o dono: o seletor some em vez de dizer "Sem responsável" por engano.
  if (lead.owner_user_id === undefined && lead.owner_agent_id === undefined) return null;

  const atual = lead.owner_agent_id ? AGENTE : (lead.owner_user_id ?? SEM_DONO);
  const anterior: UpdateLeadInput = lead.owner_agent_id
    ? { owner_agent_id: lead.owner_agent_id }
    : { owner_user_id: lead.owner_user_id ?? null };

  function trocar(valor: string) {
    if (valor === atual || valor === AGENTE) return;
    const gravado = valor === SEM_DONO ? null : valor;
    const patch: UpdateLeadInput = { owner_user_id: gravado };

    async function desfazer() {
      try {
        const agora = contactId ? await donoAtual(contactId, lead.id) : null;
        if (!agora || agora.owner_agent_id || (agora.owner_user_id ?? null) !== gravado) {
          toast.error(t("O responsável mudou de novo depois da sua troca. Nada foi desfeito."));
          onMudou();
          return;
        }
      } catch {
        toast.error(t("Não consegui conferir o responsável atual. Nada foi desfeito."));
        return;
      }
      editar.mutate({ leadId: lead.id, patch: anterior }, { onSuccess: onMudou });
    }

    editar.mutate(
      { leadId: lead.id, patch },
      {
        onSuccess: () => {
          onMudou();
          toast.success(t("Responsável alterado."), {
            action: {
              label: t("Desfazer"),
              onClick: () => void desfazer(),
            },
          });
        },
      },
    );
  }

  const nomeDoAtual =
    atual === AGENTE ? t("Agente de IA")
      : atual === SEM_DONO ? t("Sem responsável")
        : (lista.find((m) => m.user_id === atual)?.full_name ?? t("Membro da equipe"));

  return (
    <div className="grid grid-cols-[96px_minmax(0,1fr)] items-center gap-2 text-xs">
      <span className="text-muted-foreground">{t("Responsável")}</span>
      {podeMexer ? (
        <Select value={atual} onValueChange={trocar} disabled={editar.isPending}>
          <SelectTrigger aria-label={t("Responsável pelo negócio")} className="h-8 text-xs" data-testid="inbox-responsavel-do-negocio">
            <SelectValue>{nomeDoAtual}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {atual === AGENTE && <SelectItem value={AGENTE} disabled className="text-xs">{t("Agente de IA")}</SelectItem>}
            <SelectItem value={SEM_DONO} className="text-xs">{t("Sem responsável")}</SelectItem>
            {lista.map((m) => (
              <SelectItem key={m.user_id} value={m.user_id} className="text-xs">{m.full_name ?? t("Sem nome")}</SelectItem>
            ))}
            {/* O dono atual pode não estar na lista (membro revogado): sem esta
                opção o Select abriria em branco. */}
            {atual !== AGENTE && atual !== SEM_DONO && !lista.some((m) => m.user_id === atual) && (
              <SelectItem value={atual} disabled className="text-xs">{nomeDoAtual}</SelectItem>
            )}
          </SelectContent>
        </Select>
      ) : (
        <span data-testid="inbox-responsavel-somente-leitura">{nomeDoAtual}</span>
      )}
    </div>
  );
}
