"use client";
import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useConexoes } from "@/hooks/channels/useConexoes";
import { useVistaDeConexoes } from "@/hooks/channels/useVistaDeConexoes";
import { useT } from "@/hooks/i18n/useT";
import {
  calcularKpis,
  filtrarConexoes,
  ROTULO_DO_TIPO,
  SEM_FILTROS,
  type FiltrosDaLista,
  type ItemDeConexao,
  type TipoDeConexao,
} from "@/lib/channels/conexoes-lista";
import { Plus, Stack, Warning } from "@/lib/ui/icons";

import { AcoesEmLote } from "./AcoesEmLote";
import { AgendaDePausa } from "./AgendaDePausa";
import { CartaoDaConexao, IconeDoTipo, LinhaDaConexao, type PropsDeAcoes } from "./ConexaoCartao";
import { ConexoesFiltros } from "./ConexoesFiltros";
import { EscolhaDeFluxo } from "./EscolhaDeFluxo";
import { useAcoesDaConexao } from "./useAcoesDaConexao";

function Kpi({ rotulo, valor, alerta = false }: { rotulo: string; valor: number; alerta?: boolean }) {
  return (
    <Card className={alerta && valor > 0 ? "border-warning/40 p-4" : "p-4"}>
      <span className="text-xs text-muted-foreground">{rotulo}</span>
      <b className="block text-2xl">{valor}</b>
    </Card>
  );
}

function Avisos({ servicoForaDoAr, bancoAtrasado }: { servicoForaDoAr: boolean; bancoAtrasado: boolean }) {
  const t = useT();
  const faixa = "rounded-md border border-warning bg-warning-bg p-4 text-sm text-warning-fg";
  return (
    <>
      {servicoForaDoAr && (
        <div role="alert" className={faixa}>
          <p className="font-medium">{t("O serviço do WhatsApp por QR não está configurado.")}</p>
          <p className="mt-1">
            {t("Enquanto isso, não dá para reconectar nem excluir os números pareados por QR: excluir também desconecta o aparelho, e sem o serviço isso não acontece.")}
          </p>
        </div>
      )}
      {bancoAtrasado && (
        <div role="alert" className={faixa}>
          <p className="font-medium">{t("Esta instalação está com o banco atrasado.")}</p>
          <p className="mt-1">
            {t("Falta aplicar a migration que registra canal excluído. Até lá, um número que você excluir continua aparecendo nesta lista.")}
          </p>
        </div>
      )}
    </>
  );
}

function Galeria({ itens, acoes, agora }: { itens: ItemDeConexao[]; acoes: PropsDeAcoes; agora: number }) {
  const t = useT();
  const tipos = (["whatsapp", "instagram", "ligacao"] as TipoDeConexao[]).filter((tp) => itens.some((i) => i.tipo === tp));
  return (
    <div className="flex flex-col gap-6" data-testid="vista-galeria">
      {tipos.map((tp) => {
        const doTipo = itens.filter((i) => i.tipo === tp);
        return (
          <section key={tp} className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <IconeDoTipo tipo={tp} />
              <h2 className="text-base font-semibold">{t(ROTULO_DO_TIPO[tp])}</h2>
              <span className="text-xs text-muted-foreground">{doTipo.length}</span>
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {doTipo.map((i) => (
                <CartaoDaConexao key={i.id} item={i} agora={agora} {...acoes} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function Lista({ itens, acoes, agora }: { itens: ItemDeConexao[]; acoes: PropsDeAcoes; agora: number }) {
  const t = useT();
  const colunas = [t("Canal"), t("Número ou conta"), t("Método"), t("Status"), t("Detalhe"), t("Ações")];
  return (
    <div data-testid="vista-lista">
      <div className="hidden overflow-x-auto rounded-lg border border-border md:block">
        <table className="w-full text-left">
          <thead className="bg-surface-elevated text-xs text-muted-foreground">
            <tr>
              {colunas.map((c) => (
                <th key={c} scope="col" className="px-3 py-2 font-medium">{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {itens.map((i) => (
              <LinhaDaConexao key={i.id} item={i} agora={agora} {...acoes} />
            ))}
          </tbody>
        </table>
      </div>
      <div className="grid grid-cols-1 gap-3 md:hidden" data-testid="lista-compacta">
        {itens.map((i) => (
          <CartaoDaConexao key={i.id} item={i} compacto agora={agora} {...acoes} />
        ))}
      </div>
    </div>
  );
}

export function ConexoesPagina({
  wahaConfigured,
  wahaDesligado,
  graphParceiro,
}: {
  wahaConfigured: boolean;
  wahaDesligado: boolean;
  graphParceiro: { label: string } | null;
}) {
  const t = useT();
  const qc = useQueryClient();
  const { itens, sessoes, carregando, erro, bancoAtrasado, nativoHabilitado } = useConexoes();
  const [filtros, setFiltros] = useState<FiltrosDaLista>(SEM_FILTROS);
  const [vista, setVista] = useVistaDeConexoes();
  const [escolhendo, setEscolhendo] = useState(false);
  const botaoConectar = useRef<HTMLButtonElement>(null);
  const recarregar = async () => {
    await qc.invalidateQueries({ queryKey: ["channel-sessions"] });
    await qc.invalidateQueries({ queryKey: ["channels-hosted"] });
  };
  const { onAcao, abrirAssistente, ocupadoId, dialogos } = useAcoesDaConexao({
    transporteConfigurado: wahaConfigured,
    recarregar,
    nativoHabilitado,
    graphParceiro: graphParceiro?.label ?? null,
    devolverFoco: () => botaoConectar.current?.focus(),
  });
  const kpis = useMemo(() => calcularKpis(itens), [itens]);
  const visiveis = useMemo(() => filtrarConexoes(itens, filtros), [itens, filtros]);
  // "Conectando há N min" anda sozinho: o relógio avança a cada 30 s.
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setAgora(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  const acoes: PropsDeAcoes = {
    transporteNoAr: wahaConfigured && !wahaDesligado,
    transporteConfigurado: wahaConfigured,
    ocupadoId,
    onAcao,
    onRecarregar: recarregar,
  };

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{t("Conexões")}</h2>
          <p className="text-sm text-muted-foreground">
            {t("Canais de WhatsApp, Instagram e ligação desta organização.")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <AcoesEmLote itens={itens} />
          <AgendaDePausa canais={sessoes} />
          <Button asChild variant="outline">
            <Link href="/app/connections?aba=modelos">{t("Modelos de mensagem")}</Link>
          </Button>
          <Button ref={botaoConectar} onClick={() => setEscolhendo(true)}>
            <Plus size={14} aria-hidden />
            {t("Conectar")}
          </Button>
        </div>
      </header>

      <Avisos
        servicoForaDoAr={!wahaConfigured && !wahaDesligado && itens.some((i) => i.viveNoTransporte)}
        bancoAtrasado={bancoAtrasado}
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Kpi rotulo={t("Conectados")} valor={kpis.conectados} />
        <Kpi rotulo={t("Precisam de atenção")} valor={kpis.atencao} alerta />
        <Kpi rotulo={t("Total")} valor={kpis.total} />
      </div>

      <Link href="/app/settings/atendimento" className="text-sm text-accent-text underline">
        {t("Configurar responsáveis por número")}
      </Link>

      <ConexoesFiltros filtros={filtros} onMudar={setFiltros} vista={vista} onVista={setVista} />

      {carregando ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3" aria-busy="true">
          {[0, 1, 2].map((n) => (
            <Skeleton key={n} className="h-36" />
          ))}
        </div>
      ) : erro ? (
        <Card role="alert" className="flex flex-col items-center gap-3 p-8 text-center">
          <Warning size={28} className="text-error-fg" aria-hidden />
          <p className="text-sm text-error-fg">{t("Não foi possível carregar suas conexões.")}</p>
          <Button variant="outline" onClick={() => void recarregar()}>{t("Tentar de novo")}</Button>
        </Card>
      ) : itens.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 p-8 text-center">
          <Stack size={28} className="text-muted-foreground" aria-hidden />
          <p className="text-sm font-medium">{t("Nenhuma conexão ainda")}</p>
          <Button onClick={() => setEscolhendo(true)}>{t("Conectar")}</Button>
        </Card>
      ) : visiveis.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">{t("Nenhuma conexão com esses filtros.")}</p>
      ) : vista === "lista" ? (
        <Lista itens={visiveis} acoes={acoes} agora={agora} />
      ) : (
        <Galeria itens={visiveis} acoes={acoes} agora={agora} />
      )}

      {escolhendo && (
        <EscolhaDeFluxo
          onWhatsapp={abrirAssistente}
          onFechar={() => setEscolhendo(false)}
        />
      )}
      {dialogos}
    </div>
  );
}
