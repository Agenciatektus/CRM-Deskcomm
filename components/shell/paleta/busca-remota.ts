"use client";
import { useEffect, useState } from "react";

import { apiClient } from "@/lib/api/client";
import type { ConversationWithContact } from "@/hooks/inbox/useConversationsRealtime";
import type { LeadAchado } from "@/lib/leads/busca-de-leads";

/** O que a busca acha fora do catálogo de telas: conversas e contatos. */
export interface AchadoDeConversa {
  tipo: "conversa";
  id: string;
  /** A aba da Inbox em que a conversa aparece: fechada e arquivada têm a sua. */
  aba: "all" | "closed" | "archived";
  conversa: ConversationWithContact;
}

export interface AchadoDeContato {
  tipo: "contato";
  id: string;
  /** O contato como veio da rota: o nome sai de `rotuloDoContato`, na tela. */
  contato: ContatoDaRota;
}

/** Um negócio achado por `GET /api/v1/leads?search=` (título ou contato). */
export interface AchadoDeLead {
  tipo: "lead";
  id: string;
  lead: LeadAchado;
}

export type Achado = AchadoDeConversa | AchadoDeContato;

export const ATRASO_DA_BUSCA_MS = 250;
export const MINIMO_DE_LETRAS = 2;

/**
 * O termo que vai ao servidor. Telefone digitado com máscara ("(21) 99812-4410",
 * "+55 21…") vira só dígitos, que é como as rotas comparam número; o resto vai
 * como foi digitado, e a rota já normaliza caixa e acento.
 */
export function termoParaServidor(termo: string): string {
  const limpo = termo.trim();
  const semMascara = limpo.replace(/[\s()+.-]/g, "");
  return /^\d{3,}$/.test(semMascara) ? semMascara : limpo;
}

export function abaDaConversa(status: string | null | undefined): AchadoDeConversa["aba"] {
  if (status === "archived") return "archived";
  if (status === "closed" || status === "resolved") return "closed";
  return "all";
}

export interface ContatoDaRota {
  id: string;
  display_name?: string | null;
  name?: string | null;
  phone_number?: string | null;
}

/**
 * Busca conversas e contatos pelas rotas que JÁ aceitam `search`
 * (`/api/v1/conversations` e `/api/v1/contacts`), com o escopo de organização
 * e papel delas. Espera 250 ms depois da última tecla, só busca a partir de 2
 * letras e cancela o pedido anterior (`AbortController`): sem isso, uma
 * resposta lenta de "ma" chegaria depois da de "mari" e trocaria a lista.
 *
 * Sem termo, devolve as 3 conversas mais recentes (os "Recentes").
 * Contato que já aparece por uma conversa não se repete.
 *
 * Os LEADS vêm à parte (`leads`), porque a paleta os mostra num grupo próprio:
 * só com termo, só para quem tem o quadro no menu, pela rota que agora aceita
 * `search` (`/api/v1/leads`, com o escopo de organização e papel dela).
 */
export function useBuscaRemota(
  termo: string,
  /**
   * Quais fontes este vínculo pode consultar (P2 do Cassio na #147): conversas
   * só com `/app/inbox` no menu dele, contatos só com `/app/contacts`. A mesma
   * régua do sino com os avisos; a rota continua recusando o que não pode.
   */
  fontes: { conversas: boolean; contatos: boolean; leads?: boolean } = { conversas: true, contatos: true },
): { achados: Achado[]; leads: AchadoDeLead[]; carregando: boolean } {
  const [estado, setEstado] = useState<{ chave: string; achados: Achado[]; leads: AchadoDeLead[] }>({
    chave: "",
    achados: [],
    leads: [],
  });
  const limpo = termo.trim();
  const curto = limpo.length > 0 && limpo.length < MINIMO_DE_LETRAS;
  const nenhumaFonte = !fontes.conversas && !fontes.contatos && !fontes.leads;
  const chave = curto ? "" : limpo;
  const { conversas: buscaConversas, contatos: buscaContatos, leads: buscaLeads = false } = fontes;

  useEffect(() => {
    if (curto || nenhumaFonte) return;
    const controle = new AbortController();
    const espera = setTimeout(
      () => {
        const busca = termoParaServidor(chave);
        const conversas = !buscaConversas
          ? Promise.resolve([] as ConversationWithContact[])
          : apiClient
          .get<{ data: ConversationWithContact[] }>(
            chave
              ? `/api/v1/conversations?search=${encodeURIComponent(busca)}&limit=5`
              : "/api/v1/conversations?limit=3",
            { signal: controle.signal },
          )
          .then((r) => r.data ?? []);
        const contatos = chave && buscaContatos
          ? apiClient
              .get<{ data: ContatoDaRota[] }>(`/api/v1/contacts?search=${encodeURIComponent(busca)}&limit=5`, {
                signal: controle.signal,
              })
              .then((r) => r.data ?? [])
          : Promise.resolve([] as ContatoDaRota[]);
        const leads = chave && buscaLeads
          ? apiClient
              .get<{ data: LeadAchado[] }>(`/api/v1/leads?search=${encodeURIComponent(busca)}&limit=5`, {
                signal: controle.signal,
              })
              .then((r) => r.data ?? [])
          : Promise.resolve([] as LeadAchado[]);
        Promise.allSettled([conversas, contatos, leads]).then(([rc, rk, rl]) => {
          if (controle.signal.aborted) return;
          const listaDeLeads = rl.status === "fulfilled" ? rl.value : [];
          const listaDeConversas = rc.status === "fulfilled" ? rc.value : [];
          const listaDeContatos = rk.status === "fulfilled" ? rk.value : [];
          const comConversa = new Set(listaDeConversas.map((c) => c.contacts?.id).filter(Boolean));
          const achados: Achado[] = [
            ...listaDeConversas.map(
              (c): AchadoDeConversa => ({ tipo: "conversa", id: c.id, aba: abaDaConversa(c.status), conversa: c }),
            ),
            ...listaDeContatos
              .filter((k) => !comConversa.has(k.id))
              .map(
                (k): AchadoDeContato => ({ tipo: "contato", id: k.id, contato: k }),
              ),
          ];
          setEstado({
            chave,
            achados,
            leads: listaDeLeads.map((l): AchadoDeLead => ({ tipo: "lead", id: l.id, lead: l })),
          });
        });
      },
      chave ? ATRASO_DA_BUSCA_MS : 0,
    );
    return () => {
      clearTimeout(espera);
      controle.abort();
    };
  }, [chave, curto, nenhumaFonte, buscaConversas, buscaContatos, buscaLeads]);

  if (curto || nenhumaFonte) return { achados: [], leads: [], carregando: false };
  const emDia = estado.chave === chave;
  return { achados: emDia ? estado.achados : [], leads: emDia ? estado.leads : [], carregando: !emDia };
}
