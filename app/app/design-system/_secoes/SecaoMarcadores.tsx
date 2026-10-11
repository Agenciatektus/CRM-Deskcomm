"use client";

import { useState } from "react";

import { AbasDaInbox, type AbaComContagem } from "@/components/inbox/filtros/AbasDaInbox";
import type { InboxTab } from "@/components/inbox/InboxFilters";
import { MetaDaConversa } from "@/components/inbox/item/MetaDaConversa";
import { Badge } from "@/components/ui/badge";
import { Chip } from "@/components/ui/chip";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useT } from "@/hooks/i18n/useT";
import type { ConversationWithContact } from "@/hooks/inbox/useConversationsRealtime";
import type { Comando } from "@/lib/inbox/comando-da-conversa";

import { Estados, Exemplo, Secao } from "../_componentes/Secao";
import type { Tema } from "../_componentes/tema";

const PRINCIPAIS: AbaComContagem[] = [
  { value: "unassigned", label: "Fila", count: 4 },
  { value: "mine", label: "Minhas", count: 12 },
  { value: "all", label: "Todas" },
];
const ESCONDIDAS: AbaComContagem[] = [
  { value: "ai", label: "Com a IA" },
  { value: "closed", label: "Fechadas" },
];

/**
 * Uma conversa de mentira só com o que `MetaDaConversa` lê. O componente é o
 * da lista da Inbox, sem cópia: as pílulas aqui são as de lá.
 */
function conversa(
  campos: Partial<Pick<ConversationWithContact, "passo_da_conversa" | "awaiting_since">>,
): ConversationWithContact {
  return {
    contacts: { tags: [], is_blocked: false, is_anonymized: false },
    instagram_entrada: null,
    passo_da_conversa: null,
    awaiting_since: null,
    ...campos,
  } as unknown as ConversationWithContact;
}

const ATENDENTE: Comando = { quem: "humano", userId: "eu", nome: "Ana" };

export function SecaoMarcadores({ tema }: { tema: Tema }) {
  const t = useT();
  const [agora] = useState(() => Date.now());
  const [aba, setAba] = useState<InboxTab>("unassigned");
  const [ligados, setLigados] = useState<string[]>(["hoje"]);
  const minutosAtras = (m: number) => new Date(agora - m * 60_000).toISOString();
  const alterna = (k: string) =>
    setLigados((l) => (l.includes(k) ? l.filter((x) => x !== k) : [...l, k]));

  return (
    <Secao id={`marcadores-${tema}`} titulo={t("Chips, pílulas, selos e abas")}>
      <Exemplo nome={t("Chip (componente novo)")} mapa="comp:chip" tema={tema}>
        <Estados
          itens={[
            { rotulo: t("Desligado"), no: <Chip ligado={ligados.includes("amanha")} onClick={() => alterna("amanha")}>{t("Amanhã")}</Chip> },
            { rotulo: t("Ligado"), no: <Chip ligado={ligados.includes("hoje")} onClick={() => alterna("hoje")}>{t("Hoje")}</Chip> },
            { rotulo: t("Desativado"), no: <Chip disabled>14:30</Chip> },
          ]}
        />
      </Exemplo>
      <Exemplo nome={t("Pílulas da lista (MetaDaConversa)")} mapa="comp:pilula" tema={tema}>
        <Estados
          itens={[
            { rotulo: t("Espera curta"), no: <MetaDaConversa conversation={conversa({ awaiting_since: minutosAtras(4) })} comando={{ quem: "automatico" }} rotuloCanal={null} /> },
            { rotulo: t("Espera 10+ min"), no: <MetaDaConversa conversation={conversa({ awaiting_since: minutosAtras(14) })} comando={ATENDENTE} rotuloCanal={null} /> },
            { rotulo: t("Espera 30+ min"), no: <MetaDaConversa conversation={conversa({ awaiting_since: minutosAtras(42) })} comando={ATENDENTE} rotuloCanal={null} /> },
            { rotulo: t("IA"), no: <MetaDaConversa conversation={conversa({})} comando={{ quem: "automatico" }} mostrarAtendente rotuloCanal={null} /> },
            { rotulo: t("Fechada"), no: <MetaDaConversa conversation={conversa({})} comando={{ quem: "encerrada" }} mostrarAtendente rotuloCanal={null} /> },
            { rotulo: t("Sem dono"), no: <MetaDaConversa conversation={conversa({})} comando={{ quem: "aguardando" }} mostrarAtendente rotuloCanal={null} /> },
            { rotulo: t("Tarefa atrasada"), no: <MetaDaConversa conversation={conversa({ passo_da_conversa: "atrasada" })} comando={ATENDENTE} meuUserId="eu" rotuloCanal={null} /> },
          ]}
        />
      </Exemplo>
      <Exemplo nome="Badge" mapa="comp:badge" tema={tema}>
        <div className="flex flex-wrap gap-2">
          <Badge>{t("Aberta")}</Badge>
          <Badge variant="neutral">{t("Fechada")}</Badge>
          <Badge variant="success">{t("Ganho")}</Badge>
          <Badge variant="warning">{t("Hoje")}</Badge>
          <Badge variant="error">{t("Atrasada")}</Badge>
          <Badge variant="info">{t("Lida")}</Badge>
          <Badge variant="outline">{t("Etiqueta")}</Badge>
        </div>
      </Exemplo>
      <Exemplo nome={t("Controle segmentado (AbasDaInbox)")} mapa="comp:segmentado" tema={tema}>
        <div className="w-80">
          <AbasDaInbox tab={aba} principais={PRINCIPAIS} escondidas={ESCONDIDAS} onChange={setAba} />
        </div>
      </Exemplo>
      <Exemplo nome="Tabs" mapa="comp:abas" tema={tema}>
        <Tabs defaultValue="resumo">
          <TabsList>
            <TabsTrigger value="resumo">{t("Resumo")}</TabsTrigger>
            <TabsTrigger value="negocios">{t("Negócios")}</TabsTrigger>
            <TabsTrigger value="atividade">{t("Atividade")}</TabsTrigger>
            <TabsTrigger value="off" disabled>
              {t("Desativado")}
            </TabsTrigger>
          </TabsList>
          <TabsContent value="resumo" className="text-ui text-text-muted">
            {t("O protótipo desenha a aba com sublinhado de 2px (.pn-tab); o CRM usa a aba em cartão do shadcn.")}
          </TabsContent>
        </Tabs>
      </Exemplo>
    </Secao>
  );
}
