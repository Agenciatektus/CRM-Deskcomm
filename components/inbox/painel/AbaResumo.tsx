"use client";

import type { Dispatch, RefObject, SetStateAction } from "react";

import { RoteirosDoContato } from "@/components/contacts/RoteirosDoContato";
import { Separator } from "@/components/ui/separator";
import type { ConversationWithContact } from "@/hooks/inbox/useConversationsRealtime";

import { ConversationTagsEditor } from "../ConversationTagsEditor";
import { Demandas } from "./Demandas";
import { DetalhesDoContato } from "./DetalhesDoContato";
import { MemoriaDoContato } from "./MemoriaDoContato";
import { ProximoPasso } from "./ProximoPasso";
import type { DesfechoDraft } from "./tipos";
import type { ResumoDoContato } from "./useResumoDoContato";

interface Props {
  conversation: ConversationWithContact;
  resumo: ResumoDoContato;
  displayName: string;
  usuarioId: string;
  leitura: boolean;
  leadEmFocoId: string | null;
  desfechoDraft: DesfechoDraft | null;
  setDesfechoDraft: Dispatch<SetStateAction<DesfechoDraft | null>>;
  refProximoPasso: RefObject<HTMLElement | null>;
  refDetalhes: RefObject<HTMLElement | null>;
}

/**
 * A aba Resumo, que abre por padrão: o que fazer agora (próximo passo), quem é
 * a pessoa (detalhes), o que ainda não acabou (demandas) e o que se sabe dela
 * (memória, roteiros).
 *
 * A ordem é a do atendimento, não a do banco. A demanda continua ANTES do
 * negócio (doutrina cap. 5): agora ela está na primeira aba e o negócio na
 * segunda, que é a mesma afirmação feita pela navegação.
 */
export function AbaResumo({
  conversation, resumo, displayName, usuarioId, leitura, leadEmFocoId,
  desfechoDraft, setDesfechoDraft, refProximoPasso, refDetalhes,
}: Props) {
  const contact = conversation.contacts ?? null;
  return (
    <div className="flex flex-col gap-4">
      <ProximoPasso
        ref={refProximoPasso}
        contactId={resumo.contactId}
        leadId={leadEmFocoId}
        conversationId={conversation.id}
        usuarioId={usuarioId}
        leitura={leitura}
      />
      <Separator />
      <DetalhesDoContato
        ref={refDetalhes}
        contactId={resumo.contactId}
        nomeDaConversa={displayName}
        telefone={contact?.phone_number ?? null}
        anonimizado={!!contact?.is_anonymized}
        leitura={leitura}
      />
      <Separator />
      <Demandas
        demandas={resumo.demandas}
        carregando={resumo.carregando}
        erro={resumo.erro}
        leitura={leitura}
        conversationId={conversation.id}
        currentDemandaId={conversation.current_demanda_id}
        contactId={resumo.contactId}
        desfechoDraft={desfechoDraft}
        setDesfechoDraft={setDesfechoDraft}
        recarregar={resumo.recarregar}
        usuarioId={usuarioId}
        leadEmFocoId={leadEmFocoId}
      />
      <Separator />
      <MemoriaDoContato fatos={resumo.fatos} historico={resumo.historico} carregando={resumo.carregando} />
      {/* O que os roteiros de atendimento coletaram (módulo opcional; desligado
          ou sem roteiro, não desenha nada). */}
      {resumo.contactId && !contact?.is_anonymized && (
        <RoteirosDoContato contactId={resumo.contactId} variante="painel" />
      )}
      {!leitura && (
        <>
          <Separator />
          <ConversationTagsEditor
            conversationId={conversation.id}
            orgId={conversation.organization_id}
            tags={conversation.tags ?? []}
          />
        </>
      )}
    </div>
  );
}
