"use client";
import type { RealtimeChannel } from "@supabase/supabase-js";

import { createClient, prepareRealtimeAuthentication } from "@/lib/supabase/browser";

/**
 * UM CANAL POR TÓPICO, compartilhado por todos os hooks que o escutam.
 *
 * Antes cada `useRealtimeChannel` abria o seu canal, com um sufixo por instância.
 * Com o inbox aberto e uma conversa selecionada a aba mantinha ~10 canais, e
 * vários eram o MESMO tópico visto por dois hooks (ex.: `voice_calls` da
 * organização, aberto pelo aviso de ligação E pelo painel de chamada). Cada
 * canal é um join no socket, uma avaliação de RLS por evento no servidor e uma
 * retomada própria quando cai.
 *
 * Aqui o tópico é a TOPOLOGIA do `postgres_changes` — schema, tabela, evento e
 * filtro. Dois hooks com a mesma topologia recebem do mesmo canal; o canal
 * nasce no primeiro e sai no último. A entrega continua a mesma para cada um:
 * todo evento do canal chega a todo assinante (o recorte fino, quando há, é do
 * próprio assinante — ver `filtroLocal` em `useRealtimeChannel`).
 *
 * Canal só de `broadcast` (ou sem ligação nenhuma) NÃO é compartilhado: lá o
 * nome É o tópico, e mudar como ele é montado mudaria o que ele recebe. Esses
 * seguem um por hook, com o mesmo nome de antes.
 *
 * O ciclo de vida (auth antes do join, retomada com recuo, "reassinado" depois
 * de uma queda) é o mesmo que morava no hook — só passou a existir uma vez por
 * tópico em vez de uma vez por hook.
 */

export type RealtimeStatus = "connecting" | "subscribed" | "channel_error" | "timed_out" | "closed";

export interface TopologiaDoCanal {
  postgresChanges?: {
    event: "INSERT" | "UPDATE" | "DELETE" | "*";
    schema?: string;
    table: string;
    filter?: string;
  };
  broadcast?: { event: string };
}

export interface Assinante {
  entregar: (payload: unknown) => void;
  aoMudarStatus: (status: RealtimeStatus) => void;
}

interface Canal {
  assinantes: Set<Assinante>;
  status: RealtimeStatus;
  fechar: () => void;
}

const canais = new Map<string, Canal>();
/** Só para nomes únicos: um canal que fecha e reabre não reaproveita o objeto velho do client. */
let geracao = 0;

/**
 * A chave do compartilhamento e o nome-base do canal.
 *
 * `instancia` só entra quando o canal NÃO é compartilhável, e aí o nome é o de
 * sempre (`<name>::<useId>`).
 */
export function chaveDoCanal(
  name: string,
  topologia: TopologiaDoCanal,
  instancia: string,
): { chave: string; nomeBase: string; compartilhado: boolean } {
  const pc = topologia.postgresChanges;
  if (pc && !topologia.broadcast) {
    const chave = `pg:${pc.schema ?? "public"}:${pc.table}:${pc.event}:${pc.filter ?? ""}`;
    return { chave, nomeBase: chave, compartilhado: true };
  }
  const nomeBase = `${name}::${instancia}`;
  return { chave: `inst:${nomeBase}`, nomeBase, compartilhado: false };
}

/** Quantos canais estão de pé agora. Para teste e diagnóstico. */
export function canaisAbertos(): string[] {
  return [...canais.keys()];
}

/**
 * Entra no canal do tópico (abrindo-o se for o primeiro) e devolve a saída.
 * A saída do último assinante fecha o canal.
 */
export function assinarCanal(
  chave: string,
  nomeBase: string,
  compartilhado: boolean,
  topologia: TopologiaDoCanal,
  assinante: Assinante,
): () => void {
  let canal = canais.get(chave);
  if (!canal) {
    const nome = compartilhado ? `${nomeBase}~${++geracao}` : nomeBase;
    canal = abrirCanal(nome, topologia);
    canais.set(chave, canal);
  }
  const meu = canal;
  meu.assinantes.add(assinante);
  assinante.aoMudarStatus(meu.status);
  return () => {
    meu.assinantes.delete(assinante);
    if (meu.assinantes.size > 0) return;
    meu.fechar();
    if (canais.get(chave) === meu) canais.delete(chave);
  };
}

function abrirCanal(channelName: string, topologia: TopologiaDoCanal): Canal {
  const supabase = createClient();
  const canal: Canal = { assinantes: new Set(), status: "connecting", fechar: () => {} };

  const mudarStatus = (s: RealtimeStatus) => {
    canal.status = s;
    for (const a of [...canal.assinantes]) a.aoMudarStatus(s);
  };

  const handler = (payload: unknown) => {
    // Um assinante que lança não pode calar os outros: o erro sai depois,
    // visível, e a entrega dos demais acontece.
    for (const a of [...canal.assinantes]) {
      try {
        a.entregar(payload);
      } catch (erro) {
        queueMicrotask(() => {
          throw erro;
        });
      }
    }
  };

  // `active` guarda o canal VIGENTE. Cada tentativa cria um objeto novo, e a
  // comparação `active !== novo` nos callbacks descarta o que sobrou de uma
  // tentativa anterior — sem ela, um canal velho que responde tarde
  // sobrescreveria o estado do canal que já está de pé.
  let active: RealtimeChannel | null = null;
  let cancelado = false;
  let tentativas = 0;
  let retomada: ReturnType<typeof setTimeout> | null = null;

  /**
   * Monta o canal do zero e assina.
   *
   * DO ZERO, e não `subscribe()` de novo no mesmo objeto: um canal que entrou
   * em erro não volta — o socket já derrubou a topologia dele, e reassinar o
   * mesmo objeto devolve SUBSCRIBED sem nunca mais entregar.
   */
  const agendarRetomada = () => {
    if (cancelado) return;
    const espera = Math.min(30_000, 1_000 * 2 ** tentativas);
    tentativas++;
    if (retomada) clearTimeout(retomada);
    retomada = setTimeout(() => {
      if (cancelado) return;
      // `active` é SOLTO antes de remover, e a ordem é o conserto. Num canal
      // que ainda não entrou, `removeChannel` chama o callback do `subscribe`
      // com CLOSED ANTES de retornar (medido no realtime-js 2.112.3). Com
      // `active` ainda apontando o canal velho, esse CLOSED passava pela guarda
      // e armava OUTRA retomada — um timer órfão que derrubava o canal saudável.
      const velho = active;
      active = null;
      if (velho) supabase.removeChannel(velho);
      montar();
    }, espera);
  };

  const montar = async () => {
    if (cancelado) return;
    try {
      // A fonte do token mora em `lib/supabase/browser.ts` (callback do socket).
      // Nenhum canal anônimo nasce enquanto o token está em voo.
      await prepareRealtimeAuthentication();
    } catch {
      if (cancelado) return;
      mudarStatus("channel_error");
      agendarRetomada();
      return;
    }
    if (cancelado) return;

    let novo: RealtimeChannel = supabase.channel(`${channelName}#${tentativas}`);
    const pc = topologia.postgresChanges;
    if (pc) {
      novo = novo.on(
        "postgres_changes",
        {
          event: pc.event,
          schema: pc.schema ?? "public",
          table: pc.table,
          ...(pc.filter ? { filter: pc.filter } : {}),
        },
        handler,
      );
    }
    if (topologia.broadcast) novo = novo.on("broadcast", { event: topologia.broadcast.event }, handler);
    active = novo;

    novo.subscribe((s) => {
      if (cancelado || active !== novo) return;
      const map: Record<string, RealtimeStatus> = {
        SUBSCRIBED: "subscribed",
        CHANNEL_ERROR: "channel_error",
        TIMED_OUT: "timed_out",
        CLOSED: "closed",
      };
      mudarStatus(map[s] ?? "connecting");

      if (s === "SUBSCRIBED") {
        // Voltou depois de ter caído. O que aconteceu enquanto ele estava
        // morto NÃO vai chegar — o Realtime não guarda nada para entregar
        // depois. A entrega sintética força quem escuta a buscar de novo.
        if (tentativas > 0) {
          tentativas = 0;
          handler({ tipo: "reassinado" });
        }
        return;
      }
      if (s === "CHANNEL_ERROR" || s === "TIMED_OUT" || s === "CLOSED") {
        // Recuo exponencial com teto de 30s: reconectar em rajada contra um
        // socket que caiu por sobrecarga piora a sobrecarga.
        agendarRetomada();
      }
    });
  };

  montar();

  canal.fechar = () => {
    cancelado = true;
    if (retomada) clearTimeout(retomada);
    if (active) {
      const velho = active;
      active = null;
      supabase.removeChannel(velho);
    }
  };
  return canal;
}
