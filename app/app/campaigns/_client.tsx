"use client";
/**
 * A lista de campanhas (PRD §24).
 *
 * Mostra o que decide o próximo clique: em que pé está, para quantas pessoas,
 * quantas saíram e quando. Quem quiser o detalhe abre a campanha — a lista não
 * tenta ser o painel.
 */
import Link from "next/link";
import { useMemo, useState } from "react";

import { EstadoDaCampanha } from "@/components/campanhas/EstadoDaCampanha";
import { EmptyState } from "@/components/empty";
import { BarraDeFiltros, BotaoDaTelaParaRota, CabecalhoDaPagina, EstadoDaLista, Pagina } from "@/components/pagina";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Escolha } from "@/components/ui/escolha";
import { useCampanhas } from "@/hooks/campanhas/useCampanhas";
import { useTagDeIdioma } from "@/hooks/i18n/useLocaleDeData";
import { useT } from "@/hooks/i18n/useT";
import { Megaphone, Plus } from "@/lib/ui/icons";
import { STATUS_DA_CAMPANHA } from "@/lib/campanhas/tipos";

export function ListaDeCampanhas() {
  const t = useT();
  // A data segue quem está lendo, não o idioma de quem escreveu a tela.
  const idioma = useTagDeIdioma();
  const [status, setStatus] = useState<string>("");
  const filtros = useMemo(() => ({ status: status || undefined, limit: 30 }), [status]);
  const q = useCampanhas(filtros);
  const campanhas = useMemo(() => q.data?.pages.flatMap((p) => p.data) ?? [], [q.data]);

  return (
    <Pagina>
      <CabecalhoDaPagina
        titulo={t("Campanhas")}
        descricao={t("Escolha o público, escreva a mensagem e acompanhe quem recebeu.")}
        acoes={
          <>
            <Button variant="outline" asChild>
              <Link href="/app/campaigns/settings">{t("Configuração")}</Link>
            </Button>
            <Button asChild className="mb:hidden">
              <Link href="/app/campaigns/new">
                <Plus size={16} weight="bold" aria-hidden />
                <span>{t("Nova campanha")}</span>
              </Link>
            </Button>
          </>
        }
      />

      <BarraDeFiltros ativos={status ? 1 : 0} aoLimpar={() => setStatus("")}>
        <label className="text-sm text-muted-foreground" htmlFor="filtro-status">
          {t("Situação")}
        </label>
        <Escolha
          id="filtro-status"
          className="h-9"
          value={status}
          onValueChange={(valorEscolhido) => setStatus(valorEscolhido)}
        >
          <option value="">{t("Todas")}</option>
          {STATUS_DA_CAMPANHA.map((s) => (
            <option key={s} value={s}>
              {t(rotulo(s))}
            </option>
          ))}
        </Escolha>
      </BarraDeFiltros>

      <EstadoDaLista
        carregando={q.isLoading}
        erro={q.isError ? t("Erro ao carregar as campanhas.") : null}
        aoTentarDeNovo={() => q.refetch()}
        quantidade={campanhas.length}
        vazio={
          <EmptyState
            icon={Megaphone}
            headline={t("Nenhuma campanha ainda.")}
            subcopy={t(
              "Uma campanha fala com uma lista de contatos que você escolhe, no ritmo do número — nunca em rajada.",
            )}
            primary={{ label: t("Nova campanha"), href: "/app/campaigns/new" }}
          />
        }
      >
        <Card className="divide-y divide-border mb:rounded-none mb:border-x-0">
          {campanhas.map((c) => (
            <Link
              key={c.id}
              href={`/app/campaigns/${c.id}`}
              className="flex flex-col gap-2 p-4 transition-colors hover:bg-surface-elevated sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="truncate font-medium mb:text-(length:--mb-linha-nome) mb:font-semibold">{c.name}</p>
                <p className="text-sm text-muted-foreground">
                  {/* CAMPANHA CONTÍNUA (9039) não tem lista, e "lista ainda
                      não preparada" numa campanha que está abordando gente é
                      afirmação falsa — a mais perigosa desta tela, porque
                      convida a preparar de novo. */}
                  {c.entrada_continua === true
                    ? t("contínua, por etapa do funil")
                    : c.snapshot_eligible > 0
                      ? `${c.snapshot_eligible} ${t("contatos na lista")}`
                      : t("lista ainda não preparada")}
                  {c.entrada_continua !== true && c.snapshot_excluded > 0
                    ? ` · ${c.snapshot_excluded} ${t("fora")}`
                    : ""}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <span className="text-sm text-muted-foreground">{quando(c, t, idioma)}</span>
                <EstadoDaCampanha status={c.status} />
              </div>
            </Link>
          ))}
        </Card>
        {q.hasNextPage && (
          <div className="flex justify-center">
            <Button
              variant="outline"
              size="sm"
              onClick={() => q.fetchNextPage()}
              disabled={q.isFetchingNextPage}
            >
              {q.isFetchingNextPage ? t("Carregando…") : t("Carregar mais")}
            </Button>
          </div>
        )}
      </EstadoDaLista>

      <BotaoDaTelaParaRota rotulo={t("Nova campanha")} href="/app/campaigns/new" />
    </Pagina>
  );
}

function rotulo(status: string): string {
  const mapa: Record<string, string> = {
    draft: "Rascunho",
    preparing: "Montando a lista",
    ready: "Pronta para iniciar",
    scheduled: "Agendada",
    running: "Enviando",
    paused: "Pausada",
    completed: "Concluída",
    cancelled: "Cancelada",
    failed: "Falhou",
  };
  return mapa[status] ?? status;
}

/** A data que importa depende do estado — mostrar "criada em" numa campanha que já terminou é ruído. */
function quando(
  c: { status: string; scheduled_at: string | null; started_at: string | null; completed_at: string | null; created_at: string },
  t: (s: string) => string,
  idioma: string,
): string {
  const fmt = (iso: string) =>
    new Date(iso).toLocaleString(idioma, { dateStyle: "short", timeStyle: "short" });
  if (c.status === "scheduled" && c.scheduled_at) return `${t("começa")} ${fmt(c.scheduled_at)}`;
  if (c.completed_at) return `${t("terminou")} ${fmt(c.completed_at)}`;
  if (c.started_at) return `${t("começou")} ${fmt(c.started_at)}`;
  return `${t("criada")} ${fmt(c.created_at)}`;
}
