"use client";

import { useLocaleDeData } from "@/hooks/i18n/useLocaleDeData";

import type { Locale } from "date-fns";
import { useEffect, useMemo, useRef } from "react";
import { defaultRangeExtractor, useVirtualizer } from "@tanstack/react-virtual";
import { useT } from "@/hooks/i18n/useT";
import { format, isToday, isYesterday } from "date-fns";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { LinhaDaMensagem, type AcoesDoFio } from "./fio/LinhaDaMensagem";
import { indiceDoDiaAtivo, montarLinhas, type LinhaDoFio } from "./fio/linhas";
import { NoteCard } from "./NoteCard";
import { PassagemCard } from "./PassagemCard";
import { useMessagesRealtime } from "@/hooks/inbox/useMessagesRealtime";
import { useConversationNotes } from "@/hooks/inbox/useConversationNotes";
import { usePassagensDaConversa } from "@/hooks/inbox/usePassagensDaConversa";
import { useClaimConversation } from "@/hooks/inbox/useClaimConversation";
import { useDeleteNote } from "@/hooks/inbox/useDeleteNote";
import { useAlterarMensagem } from "@/hooks/inbox/useAlterarMensagem";
import { useDebugToggle } from "@/hooks/ai/useDebugToggle";
import { useActiveOrg, useUser } from "@/hooks/auth/AuthProvider";
import { ROLE_RANK } from "@/lib/auth/types";
import { capabilitiesOf, transportaMensagem, type ChannelProvider } from "@/lib/channels/capabilities";
import { montarCartoesDaPassagem, type CartaoDaPassagem } from "@/lib/escalacao/cartao-da-passagem";
import type { Message, Note } from "@/lib/types/messaging";

interface Props {
  conversationId: string | null;
  searchTerm?: string;
  provider?: string | null;
  /** Escolher uma mensagem para responder. Sobe até o composer. */
  onResponder?: (m: Message) => void;
  /**
   * Quem é o dono da conversa HOJE, e quem é o contato.
   *
   * O cartão da passagem precisa dos dois para escolher o gesto: sem dono ele
   * convida a assumir; com outro dono ele diz quem atende (oferecer "assumir"
   * ali seria oferecer um gesto que a rota recusa); e o caminho de opt-out leva
   * à ficha do contato, que é onde mora o bloqueio.
   *
   * Opcional para o fio continuar renderizável sem a conversa em mãos — o
   * cartão então cai no estado mais conservador (nenhum convite).
   */
  dono?: { userId: string | null; nome: string | null } | null;
  contatoId?: string | null;
}

/**
 * Onda 5.2: union de item do thread — mensagem real ou nota interna (nunca vai
 * ao cliente). A passagem é o TERCEIRO tipo: também não é mensagem, também não
 * vai ao cliente, e entra no fio pelo mesmo mecanismo.
 */
export type ThreadItem =
  | { kind: "message"; ts: string; data: Message }
  | { kind: "note"; ts: string; data: Note }
  | { kind: "passagem"; ts: string; data: CartaoDaPassagem };

/** Intercala mensagens, notas e passagens por timestamp asc (puro, sem I/O — testado em thread-merge.test.ts). */
export function mergeThreadItems(
  messages: Message[],
  notes: Note[],
  // Opcional porque o fio existe desde antes da passagem, e uma conversa que
  // nunca saiu do automático não tem nenhuma.
  passagens: CartaoDaPassagem[] = [],
): ThreadItem[] {
  const items: ThreadItem[] = [
    ...messages.map((data): ThreadItem => ({ kind: "message", ts: data.sent_at, data })),
    ...notes.map((data): ThreadItem => ({ kind: "note", ts: data.created_at, data })),
    ...passagens.map((data): ThreadItem => ({ kind: "passagem", ts: data.criadoEm, data })),
  ];
  // Sort estável (Array#sort é estável no V8/Node): empate mantém a ordem de
  // inserção acima — mensagens antes de notas no mesmo instante, e a passagem
  // DEPOIS das duas, que é o que aconteceu: ela é consequência da última fala.
  items.sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime());
  return items;
}

function dayLabel(d: Date, t: (texto: string) => string = (texto) => texto, locale: Locale): string {
  if (isToday(d)) return t("Hoje");
  if (isYesterday(d)) return t("Ontem");
  return format(d, "dd/MM/yyyy", { locale: locale });
}

export function ChatThread({
  conversationId,
  provider,
  onResponder,
  dono,
  contatoId,
  searchTerm = "",
}: Props) {
  const localeDaData = useLocaleDeData();
  const t = useT();
  const activeOrg = useActiveOrg();
  const q = useMessagesRealtime(conversationId, activeOrg?.orgId ?? null);
  const notes = useConversationNotes(conversationId);
  const passagens = usePassagensDaConversa(conversationId);
  const claim = useClaimConversation();
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const paginasVistas = useRef(0);
  /**
   * Esta conversa já ancorou no fim ALGUMA vez, com conteúdo na tela?
   *
   * Enquanto for `false`, a abertura ainda não terminou — e a guarda de
   * distância (que existe para não arrancar quem está lendo o histórico) não
   * pode valer, porque ninguém rolou nada ainda. Ver o efeito abaixo.
   */
  const jaAncorou = useRef(false);
  const currentUser = useUser();
  const deleteNote = useDeleteNote(conversationId ?? "");
  const { editar, apagar, ocultar, restaurar } = useAlterarMensagem(conversationId);
  const canManage = activeOrg != null && ROLE_RANK[activeOrg.role] >= ROLE_RANK.manager;
  const canalAlteraEnviada = transportaMensagem(provider)
    && capabilitiesOf(provider as ChannelProvider).alteraMensagemEnviada;
  const { enabled: debugCitations } = useDebugToggle(activeOrg?.role ?? null);

  const messages: Message[] = useMemo(
    () => q.data?.pages.flatMap((p) => p.data) ?? [],
    [q.data],
  );

  /**
   * BUSCA NO QUE JÁ ESTÁ NA TELA (#1793). Não vai ao servidor: filtra as
   * páginas carregadas, e o rótulo diz isso para ninguém ler "zero" como "não
   * existe na conversa". Apagada e oculta ficam de fora — o texto delas não
   * aparece na bolha, e marcar uma bolha sem o termo visível seria mentir.
   */
  const termo = searchTerm.trim().toLocaleLowerCase();
  const resultados = useMemo(
    () =>
      new Set(
        messages
          .filter(
            (m) =>
              termo &&
              !m.revoked_at &&
              !m.metadata?.crm_hidden_at &&
              m.body?.toLocaleLowerCase().includes(termo),
          )
          .map((m) => m.id),
      ),
    [messages, termo],
  );
  /**
   * As mensagens por id, para resolver a CITADA sem ir ao servidor.
   *
   * Uma consulta por bolha citada seria uma cascata de requisições numa
   * conversa longa. Aqui o fio sai da lista que já está na tela — e quando a
   * citada ficou fora da página carregada, ele simplesmente não aparece, que é
   * melhor que segurar a conversa esperando por um texto de enfeite.
   */
  const porId = useMemo(() => new Map(messages.map((m) => [m.id, m])), [messages]);

  const cartoes: CartaoDaPassagem[] = useMemo(
    () =>
      montarCartoesDaPassagem(passagens, {
        usuarioId: currentUser.id,
        donoId: dono?.userId ?? null,
        donoNome: dono?.nome ?? null,
      }),
    [passagens, currentUser.id, dono?.userId, dono?.nome],
  );

  const items: ThreadItem[] = useMemo(
    () => mergeThreadItems(messages, notes, cartoes),
    [messages, notes, cartoes],
  );

  const paginas = q.data?.pages.length ?? 0;

  /**
   * OS GESTOS DA BOLHA COM IDENTIDADE ESTÁVEL.
   *
   * As bolhas são memoizadas (`LinhaDaMensagem`). Se cada render do fio criasse
   * `onEditar={() => …}` novo por bolha, o `memo` nunca acertaria e a chegada de
   * UMA mensagem re-renderizaria todas as já montadas. O ref guarda a versão
   * mais nova das mutações; o objeto de ações nasce uma vez e lê do ref.
   */
  // Rascunho da edição por id: sobrevive à bolha sair da tela (e desmontar).
  // Ref, não estado: digitar não pode re-renderizar o fio inteiro.
  const rascunhos = useRef(new Map<string, string>());
  const gestos = useRef({ editar, apagar, ocultar, restaurar, onResponder });
  gestos.current = { editar, apagar, ocultar, restaurar, onResponder };
  const acoes: AcoesDoFio = useMemo(
    () => ({
      responder: (m) => gestos.current.onResponder?.(m),
      editar: (id, text) => gestos.current.editar.mutateAsync({ id, text }).then(() => undefined),
      apagar: (id) => gestos.current.apagar.mutateAsync(id).then(() => undefined),
      ocultar: (id) => gestos.current.ocultar.mutateAsync(id).then(() => undefined),
      restaurar: (id) => gestos.current.restaurar.mutateAsync(id).then(() => undefined),
      lerRascunho: (id) => rascunhos.current.get(id) ?? null,
      gravarRascunho: (id, texto) => {
        if (texto === null) rascunhos.current.delete(id);
        else rascunhos.current.set(id, texto);
      },
    }),
    [],
  );

  /**
   * O FIO É VIRTUALIZADO: só as linhas na tela (mais uma margem) existem no DOM.
   *
   * Conversa longa montava TODAS as bolhas — com 2.000 mensagens eram 2.000
   * árvores de bolha, cada uma com seu timer de minuto. Agora são as visíveis +
   * `overscan` (medido em `tests/unit/fio-virtualizado.test.tsx`).
   *
   * `anchorTo: "end"` é o modo de chat do virtualizador: quando linhas entram
   * ACIMA (o "Carregar mais antigas") ele reancora a leitura pela chave da linha
   * que estava no topo — a posição não pula —, e quando uma bolha da base muda
   * de altura (imagem que carregou, edição) com a leitura no fim, ela continua
   * no fim. Seguir a mensagem NOVA continua sendo decisão do efeito de
   * ancoragem abaixo (`followOnAppend` desligado), com as guardas de sempre.
   */
  const linhas: LinhaDoFio[] = useMemo(
    () => montarLinhas(items, Boolean(q.hasNextPage)),
    [items, q.hasNextPage],
  );
  const diaAtivo = useRef(-1);
  const virtualizer = useVirtualizer({
    count: linhas.length,
    getScrollElement: () => scrollerRef.current,
    getItemKey: (i) => linhas[i]!.key,
    // Só o chute inicial: cada linha é medida de verdade ao montar.
    estimateSize: (i) => (linhas[i]!.tipo === "item" ? 72 : 28),
    overscan: 8,
    // O `py-2` que o rolador tinha vira margem do próprio virtualizador, para
    // as posições baterem com a altura total.
    paddingStart: 8,
    paddingEnd: 8,
    anchorTo: "end",
    // React 19 avisa quando o virtualizador força `flushSync` dentro do commit
    // (medição no ref). Sem ele a atualização vai no lote normal do React.
    useFlushSync: false,
    // O rótulo do dia que vale para o topo da tela fica sempre montado, para
    // poder grudar no topo como o `sticky` de antes (ver o render).
    rangeExtractor: (range) => {
      diaAtivo.current = indiceDoDiaAtivo(linhas, range.startIndex);
      const indices = defaultRangeExtractor(range);
      if (diaAtivo.current >= 0 && !indices.includes(diaAtivo.current)) {
        indices.unshift(diaAtivo.current);
      }
      return indices;
    },
  });

  // Só o TERMO leva à ocorrência. Depender do conjunto de resultados faria cada
  // mensagem nova do tempo real arrancar quem lê de volta à primeira ocorrência.
  //
  // Com o fio virtualizado a primeira ocorrência pode não estar montada: aí o
  // virtualizador rola até a LINHA dela (que então monta), em vez de procurar no
  // DOM uma bolha que não existe. O pedido fica PENDENTE até a bolha montar
  // (inclusive na primeira pintura, quando o virtualizador ainda não mediu a
  // tela), e só então leva a bolha ao campo de visão, como antes.
  //
  // O `scrollToIndex` sai UMA vez por ocorrência (`rolouAte` guarda a chave da
  // linha já pedida). O efeito roda a cada render enquanto a bolha não monta, e
  // a rolagem da própria pessoa também re-renderiza: pedir de novo a cada
  // passada prendia a tela na ocorrência, e quem tentasse rolar era puxado de
  // volta (P2 do Cassio na #95). Ocorrência nova (outro termo, ou a primeira
  // passou a ser outra linha) pede de novo.
  const buscaPendente = useRef(false);
  const rolouAte = useRef<string | null>(null);
  useEffect(() => {
    buscaPendente.current = Boolean(termo);
    rolouAte.current = null;
  }, [termo]);
  useEffect(() => {
    if (!buscaPendente.current) return;
    const alvo = linhas.findIndex(
      (l) => l.tipo === "item" && l.item.kind === "message" && resultados.has(l.item.data.id),
    );
    if (alvo < 0) {
      buscaPendente.current = false;
      return;
    }
    const el = scrollerRef.current?.querySelector(
      `[data-index="${alvo}"] [data-search-match="true"]`,
    );
    if (el) {
      el.scrollIntoView({ block: "nearest" });
      buscaPendente.current = false;
    } else if (virtualizer.getVirtualItems().length > 0 && rolouAte.current !== linhas[alvo]!.key) {
      rolouAte.current = linhas[alvo]!.key;
      virtualizer.scrollToIndex(alvo, { align: "center" });
    }
  });

  // Conversa nova: a contagem de páginas recomeça, senão a primeira carga da
  // próxima conversa seria confundida com um "carregar mais antigas".
  useEffect(() => {
    paginasVistas.current = 0;
    jaAncorou.current = false;
    rascunhos.current.clear();
  }, [conversationId]);

  // Rola ao fim na primeira carga e quando chega mensagem/nota nova — mas NÃO
  // quando o crescimento veio do "Carregar mais antigas".
  //
  // A thread pagina para o PASSADO: cada `fetchNextPage` traz mensagens mais
  // antigas, que entram ACIMA das que já estão na tela. Rolar ao fim aqui
  // devolveria o usuário ao rodapé no instante em que ele pediu para subir —
  // o clique parece não ter efeito, embora tenha carregado (medido: thread vai
  // de msg#15..#64 para msg#1..#64 e a viewport volta a 7px do fim).
  //
  // A segunda guarda cobre o outro caso: se o usuário rolou para ler o
  // histórico, mensagem nova não deve arrancá-lo de onde estava.
  useEffect(() => {
    const carregouAntigas = paginasVistas.current !== 0 && paginas > paginasVistas.current;
    paginasVistas.current = paginas;
    if (carregouAntigas) return;

    /**
     * A guarda de distância NÃO vale ENQUANTO A ABERTURA NÃO TERMINOU.
     *
     * A versão anterior chamava isso de "primeira carga" e media pelo contador
     * de PÁGINAS da consulta de mensagens — e isso é um proxy, não a coisa. O
     * fio não é só mensagens: ele intercala notas e **cartões de passagem**, que
     * chegam de consultas próprias e podem resolver DEPOIS da primeira pintura.
     *
     * Medido em 2026-09-18, na prova em tela do cartão "Por que a IA passou para
     * você", numa conversa SEM mensagens (que é o normal logo depois de uma
     * passagem): a primeira pintura vem vazia e já consome a "primeira carga";
     * quando o cartão chega, o efeito roda de novo, a guarda passa a valer, e o
     * scroller está no topo com o conteúdo recém-nascido embaixo — distância
     * bem maior que 120px. A guarda concluía "o usuário está lendo o histórico"
     * de um usuário que não tinha rolado nada, e devolvia sem rolar.
     *
     * O efeito visível é o pior possível para esta tela: quem assume vê o
     * cabeçalho do cartão e o motivo, e o convite **"Assumir e responder" fica
     * abaixo da dobra do fio** — o gesto existe, está montado, é clicável por
     * programa e ninguém o vê. Medido por ferramenta: botão em y=1008 numa
     * janela de 720px.
     *
     * `jaAncorou` pergunta o que a guarda precisa saber de verdade — "esta
     * conversa já chegou ao fim alguma vez, com conteúdo na tela?" —, em vez de
     * inferir isso da paginação de UMA das três fontes do fio.
     */
    const primeiraAncoragem = !jaAncorou.current;
    if (jaAncorou.current) {
      const sc = scrollerRef.current;
      if (sc && sc.scrollHeight - sc.scrollTop - sc.clientHeight > 120) return;
    }
    // Fio ainda vazio não ancora nada: marcar aqui faria a guarda valer a partir
    // da pintura em branco, que é exatamente o defeito acima.
    if (items.length > 0) jaAncorou.current = true;

    bottomRef.current?.scrollIntoView({
      behavior: primeiraAncoragem ? "auto" : "smooth",
      block: "end",
    });
  }, [items.length, conversationId, paginas]);

  /**
   * O ESTADO DO CANAL DESTE THREAD, PUBLICADO SEMPRE — inclusive quando não há
   * mensagem nenhuma.
   *
   * ⚠️ A primeira versão punha estes atributos só no caso de SUCESSO, junto com
   * o `data-testid`. Isso os tornava invisíveis exatamente no estado em que
   * mais importam: conversa sem mensagens, esperando a primeira chegar. O canal
   * existe desde que a conversa abre; o sinal dele não pode depender de já
   * haver o que mostrar.
   *
   * Custou uma rodada de CI para aparecer, e por um motivo que vale registrar:
   * na máquina de quem desenvolve a conversa tem histórico acumulado, então o
   * caminho de sucesso é o único que se exercita. No CI o banco é fresco e a
   * conversa nasce vazia — o estado que nunca se vê localmente é o normal lá.
   *
   * Os dois atributos dizem coisas diferentes e nenhum sozinho basta:
   * `-status-mensagens` distingue "assinou" de "nem chegou a assinar";
   * `-divergencias-mensagens` é o que denuncia canal ASSINADO E MUDO, porque só
   * incrementa quando o refetch traz o que o canal não trouxe.
   */
  const sinalDoCanal = {
    "data-testid": "chat-thread",
    "data-realtime-status-mensagens": q.realtimeStatus,
    "data-refetch-divergencias-mensagens": q.seguranca?.divergencias ?? 0,
  } as const;

  if (!conversationId) {
    return (
      <div
        {...sinalDoCanal}
        className="flex h-full items-center justify-center text-sm text-muted-foreground"
      >
        {t("Selecione uma conversa")}
      </div>
    );
  }

  if (q.isLoading) {
    return (
      <div {...sinalDoCanal} className="space-y-3 p-4">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-12 w-2/3" />
        ))}
      </div>
    );
  }

  if (q.isError) {
    return (
      <div
        {...sinalDoCanal}
        className="flex h-full flex-col items-center justify-center gap-2 text-sm text-muted-foreground"
      >
        <p>{t("Erro ao carregar mensagens.")}</p>
        <Button size="sm" variant="outline" onClick={() => q.refetch()}>
          {t("Tentar novamente")}
        </Button>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div
        {...sinalDoCanal}
        className="flex h-full items-center justify-center text-sm text-muted-foreground"
      >
        {t("Nenhuma mensagem nesta conversa.")}
      </div>
    );
  }

  const rotuloDoDia = (data: Date) => (
    <div className="flex justify-center py-1">
      <span className="rounded-full bg-background/80 px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground backdrop-blur">
        {dayLabel(data, t, localeDaData)}
      </span>
    </div>
  );

  const conteudoDaLinha = (linha: LinhaDoFio) => {
    if (linha.tipo === "mais")
      return (
        <div className="flex justify-center py-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => q.fetchNextPage()}
            disabled={q.isFetchingNextPage}
          >
            {q.isFetchingNextPage ? t("Carregando…") : t("Carregar mais antigas")}
          </Button>
        </div>
      );
    if (linha.tipo === "dia") return rotuloDoDia(linha.data);
    const item = linha.item;
    // `pt-1` é o `space-y-1` que separava os itens de cada dia.
    return (
      <div className="pt-1">
        {item.kind === "passagem" ? (
          <PassagemCard
            cartao={item.data}
            contatoId={contatoId ?? null}
            assumindo={claim.isPending}
            // O MESMO gesto do cabeçalho — uma rota, um efeito. Uma
            // segunda maneira de assumir seria uma segunda chance de os
            // dois caminhos divergirem sobre o que "assumir" faz.
            onAssumir={() =>
              conversationId &&
              claim.mutate({
                conversation_id: conversationId,
                expected_assignee: dono?.userId ?? null,
              })
            }
          />
        ) : item.kind === "note" ? (
          <NoteCard
            note={item.data}
            // Só o autor ou manager+ vê o excluir — o backend barra o resto (403),
            // então não mostramos um botão que daria erro.
            onDelete={
              item.data.created_by_user_id === currentUser.id || canManage
                ? () => deleteNote.mutate(item.data.id)
                : undefined
            }
          />
        ) : (
          <LinhaDaMensagem
            message={item.data}
            searchMatch={resultados.has(item.data.id)}
            debugCitations={Boolean(debugCitations)}
            temResponder={Boolean(onResponder)}
            // A citada sai da MESMA lista já carregada: buscar no servidor
            // por cada citação faria uma consulta por bolha. Quando a
            // citada é antiga demais e ficou fora da página, o fio some —
            // que é melhor que segurar a conversa esperando.
            citada={porId.get(item.data.reply_to_message_id ?? "") ?? null}
            // Sem isto o balão diz "Você" em toda mensagem digitada no
            // CRM — inclusive nas do colega, porque `sent_via='user'` só
            // registra que um humano digitou, nunca qual.
            viewerUserId={currentUser.id}
            podeAlterar={canalAlteraEnviada && item.data.sent_by_user_id === currentUser.id}
            podeModerar={canManage && item.data.direction === "inbound"}
            acoes={acoes}
          />
        )}
      </div>
    );
  };

  const virtuais = virtualizer.getVirtualItems();
  // O rótulo do dia do topo GRUDA quando a linha dele já passou do topo — o
  // mesmo `sticky top-0` de antes. Ele é renderizado no fluxo (no início do
  // contêiner), não posicionado: é o que deixa o `sticky` funcionar.
  const ativo = virtuais.find((v) => v.index === diaAtivo.current);
  const grudado = ativo != null && ativo.start < (virtualizer.scrollOffset ?? 0);

  return (
    <div {...sinalDoCanal} className="flex h-full min-w-0 flex-col">
      {termo && (
        <div className="px-4 py-1 text-xs text-muted-foreground" role="status">
          {t("Resultados nas mensagens carregadas")}: {resultados.size}
        </div>
      )}
      {/* `overflow-anchor: none`: quem segura a posição ao entrar conteúdo acima é
          o virtualizador (`anchorTo: "end"`); a ancoragem do navegador por cima
          dele compensaria duas vezes. */}
      <div ref={scrollerRef} className="min-w-0 flex-1 overflow-y-auto [overflow-anchor:none]">
        <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
          {virtuais.map((v) => {
            const linha = linhas[v.index]!;
            const fixo = grudado && v.index === diaAtivo.current;
            return (
              <div
                key={v.key}
                data-index={v.index}
                ref={virtualizer.measureElement}
                className={fixo ? "sticky top-0 z-10 w-full" : "absolute left-0 top-0 w-full"}
                style={fixo ? undefined : { transform: `translateY(${v.start}px)` }}
              >
                {conteudoDaLinha(linha)}
              </div>
            );
          })}
        </div>
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
