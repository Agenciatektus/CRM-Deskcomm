"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

import { useAuth } from "@/hooks/auth/AuthProvider";
import { useT } from "@/hooks/i18n/useT";
import { useMarcarTodasComoLidas } from "@/hooks/inbox/useMarcarTodasComoLidas";
import { useMinhaDisponibilidade, useUpdateAvailability } from "@/hooks/team/useAttendants";
import { usePodeCriar } from "@/lib/mobile/usePodeCriar";
import { CheckCircle, DotsThree, EnvelopeOpen, Lightning } from "@/lib/ui/icons";

import { FolhaInferior, ItemDaFolha } from "../FolhaInferior";

/**
 * O ⋮ do cabeçalho de Conversas no celular (a folha "Conversas" do protótipo):
 * - Marcar todas como lidas: a rota em lote (`/conversations/mark-all-read`), que só
 *   mexe no estado de leitura de quem pede e não manda "visto" ao cliente;
 * - Disponível para novas conversas: o mesmo interruptor do topo do desktop;
 * - Respostas rápidas: a tela de edição.
 * Quem não pode escrever (viewer, suporte somente leitura) só vê Respostas rápidas.
 * "Selecionar conversas" (ações em lote) fica para quando o CRM tiver ação em lote.
 */
export function AcoesDaListaDeConversas() {
  const t = useT();
  const router = useRouter();
  const [aberta, setAberta] = useState(false);
  const podeEscrever = usePodeCriar();
  const { user } = useAuth();
  const marcar = useMarcarTodasComoLidas(t);
  const minha = useMinhaDisponibilidade(podeEscrever && aberta);
  const atualizar = useUpdateAvailability(t("Disponibilidade atualizada."));
  const disponivel = minha.data?.data?.is_available ?? false;

  return (
    <>
      <button
        type="button"
        onClick={() => setAberta(true)}
        aria-haspopup="dialog"
        aria-label={t("Ações da lista de conversas")}
        className="pele-foco grid size-(--mb-alvo) place-items-center rounded-full text-text hover:bg-hover"
      >
        <DotsThree size={22} weight="bold" aria-hidden />
      </button>
      <FolhaInferior aberto={aberta} aoMudar={setAberta} titulo={t("Conversas")}>
        {podeEscrever && (
          <ItemDaFolha
            icone={EnvelopeOpen}
            titulo={t("Marcar todas como lidas")}
            apoio={t("Só para você: o cliente não recebe confirmação de leitura")}
            aoTocar={() => {
              setAberta(false);
              marcar.mutate();
            }}
          />
        )}
        {podeEscrever && minha.isSuccess && (
          <ItemDaFolha
            icone={CheckCircle}
            titulo={t("Disponível para novas conversas")}
            apoio={disponivel ? t("Ligado") : t("Desligado")}
            aoTocar={() => atualizar.mutate({ userId: user.id, patch: { is_available: !disponivel } })}
          />
        )}
        <ItemDaFolha
          icone={Lightning}
          titulo={t("Respostas rápidas")}
          apoio={t("Mensagens prontas para usar na conversa")}
          aoTocar={() => {
            setAberta(false);
            router.push("/app/templates");
          }}
        />
      </FolhaInferior>
    </>
  );
}
