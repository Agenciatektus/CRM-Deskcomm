"use client";

import { useState } from "react";

import { AdiarRapido } from "@/components/tarefas/AdiarRapido";
import { AtalhoComContagem } from "@/components/tarefas/AtalhoComContagem";
import { BarraDeFiltrosDasTarefas } from "@/components/tarefas/BarraDeFiltrosDasTarefas";
import { BarraEmLoteDeTarefas } from "@/components/tarefas/BarraEmLoteDeTarefas";
import { CabecalhoDeGrupo } from "@/components/tarefas/CabecalhoDeGrupo";
import { LinhaDeTarefa } from "@/components/tarefas/LinhaDeTarefa";
import { PainelDeFiltrosDasTarefas } from "@/components/tarefas/PainelDeFiltrosDasTarefas";
import { useT } from "@/hooks/i18n/useT";
import { IDS } from "@/lib/design-system/amostras/ids";
import { MEMBROS_DA_VITRINE, tarefasDaVitrine } from "@/lib/design-system/amostras/tarefas";
import { contagensDosAtalhos, funisDasTarefas, type FiltrosDeTarefas } from "@/lib/tarefas/recorte";
import type { Tarefa } from "@/lib/tarefas/tipos";
import { CalendarBlank, Clock, UserCircle, UserMinus } from "@/lib/ui/icons";

import { Estados, Exemplo, Secao } from "../_componentes/Secao";
import type { Tema } from "../_componentes/tema";

const nada = async () => undefined;
const nomeDe = (id: string) => MEMBROS_DA_VITRINE.find((m) => m.user_id === id)?.full_name ?? "—";

/** Atalhos com contagem: desligado, ligado, com atraso (alerta) e zerado. */
function Atalhos({ tema }: { tema: Tema }) {
  const t = useT();
  const [ligado, setLigado] = useState(true);
  return (
    <Exemplo nome={t("Atalho com contagem")} mapa="ds:tarefas" tema={tema}>
      <Estados
        itens={[
          { rotulo: t("Desligado"), no: <AtalhoComContagem ligado={false} onClick={() => undefined} icone={<UserCircle aria-hidden />} rotulo={t("Minhas")} /> },
          { rotulo: t("Ligado"), no: <AtalhoComContagem ligado={ligado} onClick={() => setLigado((v) => !v)} icone={<CalendarBlank aria-hidden />} rotulo={t("Hoje")} contagem={5} /> },
          { rotulo: t("Com atraso"), no: <AtalhoComContagem ligado={false} onClick={() => undefined} icone={<Clock aria-hidden />} rotulo={t("Atrasadas")} contagem={3} alerta /> },
          { rotulo: t("Zerado"), no: <AtalhoComContagem ligado={false} onClick={() => undefined} icone={<UserMinus aria-hidden />} rotulo={t("Sem responsável")} contagem={0} /> },
          { rotulo: t("Desativado"), no: <AtalhoComContagem ligado={false} disabled onClick={() => undefined} icone={<Clock aria-hidden />} rotulo={t("Atrasadas")} contagem={3} alerta /> },
        ]}
      />
    </Exemplo>
  );
}

function Grupos({ tema }: { tema: Tema }) {
  const t = useT();
  const [aberto, setAberto] = useState(true);
  return (
    <Exemplo nome={t("Cabeçalho de grupo recolhível")} mapa="ds:tarefas" tema={tema}>
      <div className="flex max-w-md flex-col gap-1">
        <CabecalhoDeGrupo idDaLista={`ds-grupo-a-${tema}`} titulo={t("Atrasadas")} contagem={4} aberto={aberto} alerta onAlternar={() => setAberto((v) => !v)} />
        <CabecalhoDeGrupo idDaLista={`ds-grupo-b-${tema}`} titulo={t("Hoje")} contagem={2} aberto onAlternar={() => undefined} />
        <CabecalhoDeGrupo idDaLista={`ds-grupo-c-${tema}`} titulo={t("Encerradas")} contagem={12} aberto={false} onAlternar={() => undefined} />
      </div>
    </Exemplo>
  );
}

function Linhas({ tema, agora }: { tema: Tema; agora: Date }) {
  const t = useT();
  const [amostras] = useState(() => tarefasDaVitrine(agora.getTime()));
  const [marcada, setMarcada] = useState<string | null>(amostras.hoje.id);
  const comum = {
    podeEditar: true,
    agora,
    usuarioId: IDS.atendente,
    membros: MEMBROS_DA_VITRINE,
    mostrarVinculo: true,
    aoAlternarConcluida: nada,
    aoEditar: () => undefined,
    aoApagar: nada,
    aoAbrir: () => undefined,
    aoAdiar: nada,
    aoReatribuir: nada,
    aoMudarPrioridade: nada,
    aoSelecionar: (x: Tarefa) => setMarcada((m) => (m === x.id ? null : x.id)),
  };
  const nome = (x: Tarefa) => (x.assigned_to === IDS.atendente ? t("Eu") : x.assigned_to ? nomeDe(x.assigned_to) : null);
  return (
    <>
      <Exemplo nome={t("Linha de tarefa com ações")} mapa="ds:tarefas" tema={tema}>
        <p className="text-meta text-text-subtle">
          {t("Atrasada (com o atraso relativo e o vínculo do negócio), de hoje e selecionada, presa só a um contato, avulsa e encerrada. As ações aparecem ao passar o mouse.")}
        </p>
        <div className="rounded-xl border border-border bg-surface py-1">
          {[amostras.atrasada, amostras.hoje, amostras.doContato, amostras.avulsa, amostras.encerrada].map((x) => (
            <LinhaDeTarefa key={x.id} {...comum} tarefa={x} selecionada={marcada === x.id} nomeDoResponsavel={nome(x)} />
          ))}
        </div>
      </Exemplo>
      <Exemplo nome={t("Linha somente leitura (papel viewer)")} mapa="ds:tarefas" tema={tema}>
        <div className="rounded-xl border border-border bg-surface py-1">
          <LinhaDeTarefa
            tarefa={amostras.atrasada}
            podeEditar={false}
            agora={agora}
            nomeDoResponsavel={null}
            mostrarVinculo
            aoAlternarConcluida={nada}
            aoEditar={() => undefined}
            aoApagar={nada}
          />
        </div>
      </Exemplo>
    </>
  );
}

function Adiar({ tema, agora }: { tema: Tema; agora: Date }) {
  const t = useT();
  const [escolhido, setEscolhido] = useState<string | null>(null);
  return (
    <Exemplo nome={t("Adiar rápido")} mapa="ds:tarefas" tema={tema}>
      <Estados
        itens={[
          { rotulo: t("Na linha (com a prévia do horário)"), no: <AdiarRapido compacto prazoAtual={new Date(agora.getTime() - 3_600_000).toISOString()} agora={agora} onEscolher={setEscolhido} /> },
          { rotulo: t("Na barra em lote"), no: <AdiarRapido onEscolher={setEscolhido} /> },
          { rotulo: t("Desativado"), no: <AdiarRapido disabled onEscolher={setEscolhido} /> },
        ]}
      />
      {escolhido && <p className="text-meta text-text-subtle">{`${t("Escolhido")}: ${escolhido}`}</p>}
    </Exemplo>
  );
}

function Lote({ tema }: { tema: Tema }) {
  const t = useT();
  return (
    <Exemplo nome={t("Barra em lote de tarefas")} mapa="ds:tarefas" tema={tema}>
      <Estados
        itens={[
          {
            rotulo: t("Livre"),
            no: (
              <BarraEmLoteDeTarefas
                quantidade={3}
                ocupado={false}
                membros={MEMBROS_DA_VITRINE}
                usuarioId={IDS.atendente}
                podeEditar
                onConcluir={() => undefined}
                onAdiar={() => undefined}
                onReatribuir={() => undefined}
                onPrioridade={() => undefined}
                onApagar={async () => true}
                onLimpar={() => undefined}
              />
            ),
          },
          {
            rotulo: t("Travada (Desfazer em curso)"),
            no: (
              <BarraEmLoteDeTarefas
                quantidade={1}
                ocupado
                membros={MEMBROS_DA_VITRINE}
                usuarioId={IDS.atendente}
                podeEditar
                onConcluir={() => undefined}
                onAdiar={() => undefined}
                onReatribuir={() => undefined}
                onPrioridade={() => undefined}
                onApagar={async () => true}
                onLimpar={() => undefined}
              />
            ),
          },
        ]}
      />
    </Exemplo>
  );
}

function Barra({ tema, agora }: { tema: Tema; agora: Date }) {
  const t = useT();
  const [amostras] = useState(() => Object.values(tarefasDaVitrine(agora.getTime())));
  const [filtros, setFiltros] = useState<FiltrosDeTarefas>({ atrasadas: true, prioridades: ["urgent"] });
  const funis = funisDasTarefas(amostras);
  return (
    <Exemplo nome={t("Barra de filtros das tarefas")} mapa="ds:tarefas" tema={tema}>
      <BarraDeFiltrosDasTarefas
        filtros={filtros}
        onChange={setFiltros}
        contagens={contagensDosAtalhos(amostras, filtros, { usuarioId: IDS.atendente, agora })}
        totalDoRecorte={1}
        celular={false}
        nomeDe={nomeDe}
        funis={funis}
        painel={<PainelDeFiltrosDasTarefas filtros={filtros} onChange={setFiltros} membros={MEMBROS_DA_VITRINE} usuarioId={IDS.atendente} funis={funis} />}
      />
    </Exemplo>
  );
}

/**
 * A seção "Tarefas": as peças da tela de Tarefas, com os estados de cada uma
 * (pedido do Peterson: tudo o que compõe a tela mora aqui antes de ir para a
 * tela). Nenhuma delas fala com a API por conta própria: quem grava é a tela.
 */
export function SecaoTarefas({ tema }: { tema: Tema }) {
  const t = useT();
  const [agora] = useState(() => new Date());
  return (
    <Secao
      id={`tarefas-${tema}`}
      titulo={t("Tarefas")}
      mapa="ds:tarefas"
      tema={tema}
      apoio={t("Barra de filtros no padrão do Funil, atalhos com contagem, grupos recolhíveis, linha com ações rápidas, adiar com um clique e a barra em lote.")}
    >
      <Barra tema={tema} agora={agora} />
      <Atalhos tema={tema} />
      <Grupos tema={tema} />
      <Linhas tema={tema} agora={agora} />
      <Adiar tema={tema} agora={agora} />
      <Lote tema={tema} />
    </Secao>
  );
}
