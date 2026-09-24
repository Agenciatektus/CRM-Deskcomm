"use client";

import { useTagDeIdioma } from "@/hooks/i18n/useLocaleDeData";
import { useEffect, useRef, useState } from "react";

import { useT } from "@/hooks/i18n/useT";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useLeadTimeline } from "@/hooks/leads/useLeadTimeline";
import type { Lead } from "@/lib/types/leads";
import { ContatoDoNegocio } from "./ContatoDoNegocio";
import { ConversaDoNegocio } from "./ConversaDoNegocio";
import { LeadFieldsForm } from "./LeadFieldsForm";
import { ScoreSlot } from "./ScoreSlot";
import { LeadTimeline } from "./LeadTimeline";
import { OwnerBadge } from "./OwnerBadge";
import { resolveLeadOwner } from "@/lib/kanban/owner";
import type { CustomFieldDef } from "@/components/contacts/CustomFieldsEditor";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  lead: Lead;
  pipelineId: string;
  fieldDefs?: CustomFieldDef[];
  stageName: string;
  ownerNames?: Map<string, string | null>;
}

function formatBRL(cents: number | null, currency: string | null): string {
  if (cents === null) return "—";
  try {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: currency ?? "BRL",
      maximumFractionDigits: 0,
    }).format(cents / 100);
  } catch {
    return `R$ ${(cents / 100).toFixed(0)}`;
  }
}

/**
 * `lg` do Tailwind (64rem). Só decide se a conversa conta como VISTA — marcar
 * como lida o que está numa aba escondida zeraria o contador de quem atende sem
 * ninguém ter lido. O LAYOUT não depende disto: as colunas se alternam por CSS,
 * na primeira pintura, como no Inbox (`colunasDoCelular`).
 */
const CONSULTA_TELA_LARGA = "(min-width: 64rem)";

function useTelaLarga(): boolean {
  const [larga, setLarga] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(CONSULTA_TELA_LARGA);
    const atualizar = () => setLarga(mq.matches);
    atualizar();
    mq.addEventListener("change", atualizar);
    return () => mq.removeEventListener("change", atualizar);
  }, []);
  return larga;
}

type Aba = "detalhes" | "conversa";

/** As duas abas do celular, com o rótulo que a tela mostra (traduzido no render). */
const ABAS: ReadonlyArray<{ id: Aba; rotulo: string }> = [
  { id: "detalhes", rotulo: "Detalhes" },
  { id: "conversa", rotulo: "Conversa" },
];

/**
 * O dossiê do negócio: cabeçalho vivo → timeline → campos, e — quando o
 * contato tem conversa — a CONVERSA ao lado, com o campo de resposta.
 *
 * ─── Por que a conversa entrou aqui ─────────────────────────────────────────
 *
 * Quem está no Kanban e abre um negócio para responder tinha de sair para o
 * Inbox, achar a conversa e voltar. O `ConversaSlot` recusou pôr um composer
 * no quadro para não criar uma SEGUNDA cópia do campo; a coluna daqui monta o
 * `PainelDaConversa`, que é a MESMA peça do Inbox — a regra foi cumprida por
 * compartilhamento, não por ausência.
 *
 * Desktop (`lg`+): duas colunas, dossiê à esquerda e conversa à direita, mais
 * estreita que a do Inbox (sem a lista nem a ficha). Abaixo disso: abas
 * Detalhes | Conversa, uma por vez — a mesma decisão do Inbox no celular.
 * Sem conversa, o painel continua do tamanho de antes.
 *
 * A ORDEM É a mudança em relação ao diálogo de edição: quem abre um lead quer
 * primeiro saber O QUE ACONTECEU, e só depois mexer. O formulário íntegro fica
 * por último, e o cabeçalho tem um atalho para ele — ordem preservada, custo de
 * rolagem resolvido.
 *
 * SALVAR NÃO FECHA. Quem edita precisa ver a atividade que acabou de gerar
 * entrar na timeline; fechar esconderia o registro justamente de quem o
 * produziu, e a funcionalidade que prova "sua ação fica registrada" provaria
 * isso para todo mundo menos para o autor.
 */
export function LeadDossier({
  open,
  onOpenChange,
  lead,
  pipelineId,
  fieldDefs = [],
  stageName,
  ownerNames,
}: Props) {
  const tagDoIdioma = useTagDeIdioma();
  const t = useT();
  const campos = useRef<HTMLDivElement | null>(null);
  const timeline = useLeadTimeline(open ? lead.id : null, lead.contact_id);
  const owner = resolveLeadOwner(lead, ownerNames);
  const score = lead.score ?? null;
  // O id é FIXADO na abertura. O board recalcula `lead.conversa` a cada
  // refetch (a conversa mais recente do contato): com duas conversas — dois
  // números, ou WhatsApp e Instagram —, uma mensagem na outra trocaria o painel
  // no meio da digitação e levaria o rascunho embora. Só muda de "nenhuma" para
  // "uma": o contato que escreve pela primeira vez com o dossiê aberto aparece.
  // Ajuste de estado DURANTE o render (não em effect): o React refaz o render
  // na hora, sem pintar o valor velho e sem render em cascata.
  const [conversaId, setConversaId] = useState<string | null>(lead.conversa?.id ?? null);
  const idDoBoard = lead.conversa?.id ?? null;
  if (conversaId === null && idDoBoard !== null) setConversaId(idDoBoard);
  const [aba, setAba] = useState<Aba>("detalhes");
  const telaLarga = useTelaLarga();
  const conversaVisivel = open && conversaId !== null && (telaLarga || aba === "conversa");
  // Monta a conversa na PRIMEIRA vez que ela fica visível e a mantém montada
  // depois. Montar escondida (aba Detalhes no celular) fazia o `ChatThread`
  // ancorar no fim de um elemento `display:none` — o que não rola nada, mas
  // marca a âncora como feita: a aba abria no topo do histórico.
  const [conversaJaVista, setConversaJaVista] = useState(false);
  if (conversaVisivel && !conversaJaVista) setConversaJaVista(true);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className={cn(
          "flex w-full flex-col gap-0 overflow-hidden sm:max-w-md",
          conversaId && "lg:max-w-5xl lg:flex-row",
        )}
        // Observável pelo mesmo motivo do board: "a assinatura morreu" e "nada
        // aconteceu" têm a mesma aparência, que é silêncio.
        data-realtime-status={timeline.realtimeStatus.toLowerCase()}
        // Observável como no board: "a entrega morreu" e "nada aconteceu"
        // têm a mesma aparência, e no dossiê a segunda é ainda mais crível —
        // negócio sem novidade é um estado normal.
        data-refetch-divergencias={timeline.seguranca.divergencias}
      >
        {conversaId && (
          <div
            role="tablist"
            aria-label={t("Seções do negócio")}
            className="flex shrink-0 gap-1 border-b border-border pb-2 pr-8 lg:hidden"
          >
            {ABAS.map((opcao) => (
              <button
                key={opcao.id}
                type="button"
                role="tab"
                aria-selected={aba === opcao.id}
                onClick={() => setAba(opcao.id)}
                className={cn(
                  "h-9 rounded-md px-3 text-sm transition-colors",
                  aba === opcao.id
                    ? "bg-muted font-medium text-text"
                    : "text-text-muted hover:bg-muted/60 hover:text-text",
                )}
              >
                {t(opcao.rotulo)}
              </button>
            ))}
          </div>
        )}

        <div
          className={cn(
            "flex min-h-0 flex-1 flex-col overflow-y-auto",
            conversaId && "lg:w-md lg:flex-none lg:border-r lg:border-border lg:pr-4",
            conversaId && aba === "conversa" && "hidden lg:flex",
          )}
        >
        <SheetHeader className="pb-3">
          <SheetTitle className="text-base leading-6">{lead.title}</SheetTitle>
        </SheetHeader>

        {/* ① cabeçalho vivo */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-border pb-3 text-xs">
          <span className="font-medium tabular-nums text-text">
            {formatBRL(lead.value_cents, lead.currency)}
          </span>
          <span className="text-text-muted">{stageName}</span>
          <OwnerBadge
            ownerKind={owner.kind}
            ownerName={owner.name}
            agentVersion={owner.agentVersion}
          />
          {score && (
            // O MESMO componente do card, não uma cópia do medidor.
            // "Superfície nova herda as decisões da antiga" só vale como
            // mecanismo: herdar por cópia é como as duas listas do evidence —
            // funciona hoje e diverge no mês em que alguém mudar um dos dois.
            // De brinde, o rótulo honesto da âncora ("registro que sustenta",
            // nunca "momento da conversa") vem junto, sem eu reescrever nada.
            <ScoreSlot
              probability={score.probability}
              band={score.band}
              reason={score.reason}
              factors={score.factors.slice(0, 3)}
            />
          )}

          <button
            type="button"
            onClick={() => campos.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
            className="ml-auto text-text-muted underline-offset-2 hover:text-text hover:underline"
          >
            {t("Editar campos")}
          </button>
        </div>

        {/* O score NÃO aparece na timeline: recálculo é telemetria e não emite
            atividade (silêncio para telemetria, pulso para mudança de estado).
            Sem esta linha, quem visse o número mudando no cabeçalho e nunca na
            timeline concluiria que a timeline está incompleta. */}
        {score?.at && (
          <p className="pt-2 text-[11px] text-text-muted">
            {t("Probabilidade recalculada automaticamente")} ·{" "}
            {new Date(score.at).toLocaleString(tagDoIdioma)}
          </p>
        )}

        {/* Os dados do CLIENTE: telefone e e-mail numa aba, links (Instagram,
            site, Google Meu Negócio…) na outra. Vêm do contato, não do lead. */}
        <section className="border-b border-border py-3">
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-text-muted">
            {t("Contato")}
          </h3>
          <ContatoDoNegocio contactId={lead.contact_id} pipelineId={pipelineId} />
        </section>

        {/* ② timeline */}
        <section className="flex-1 py-3">
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-text-muted">
            {t("Linha do tempo")}
          </h3>
          <LeadTimeline
            itens={timeline.itens}
            chegouAoVivo={timeline.chegouAoVivo}
            isLoading={timeline.isLoading}
            isError={timeline.isError}
          />
        </section>

        {/* ③ campos, por último */}
        <div ref={campos} className="border-t border-border pt-3">
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-text-muted">
            {t("Dados do negócio")}
          </h3>
          <LeadFieldsForm lead={lead} pipelineId={pipelineId} fieldDefs={fieldDefs} />
        </div>
        </div>

        {conversaId && (
          <div
            className={cn(
              "min-h-0 min-w-0 flex-1 flex-col lg:flex lg:pl-4",
              aba === "conversa" ? "flex" : "hidden",
            )}
          >
            {open && conversaJaVista && (
              <ConversaDoNegocio
                conversationId={conversaId}
                visivel={conversaVisivel}
                atividadeNoBoard={lead.conversa?.last_message_at ?? null}
              />
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
