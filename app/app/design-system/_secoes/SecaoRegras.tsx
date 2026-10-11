"use client";

import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { useT } from "@/hooks/i18n/useT";

import { Secao } from "../_componentes/Secao";
import type { Tema } from "../_componentes/tema";

type Situacao = "cumpre" | "outro-jeito" | "nao-cumpre" | "processo";

const VARIANTE: Record<Situacao, "success" | "info" | "warning" | "neutral"> = {
  cumpre: "success",
  "outro-jeito": "info",
  "nao-cumpre": "warning",
  processo: "neutral",
};

/**
 * Uma regra do quadro, o texto dele e, ao lado, se o CRM já cumpre e onde
 * isso se vê no código. O texto foi revisado para não contradizer o que o CRM
 * decidiu (o quadro falava em base shadcn para tudo; o CRM ainda usa o
 * `<select>` nativo estilizado, e isso aparece como "não cumpre").
 */
function Regra({ n, titulo, texto, situacao, rotulo, onde }: {
  n: number;
  titulo: string;
  texto: string;
  situacao: Situacao;
  rotulo: string;
  onde: ReactNode;
}) {
  return (
    <li className="flex gap-3 rounded-lg border border-border bg-surface p-3">
      <span className="grid size-6 shrink-0 place-items-center rounded-md bg-accent-soft text-meta font-bold text-accent-text">
        {n}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <b className="text-ui">{titulo}</b>
          <Badge variant={VARIANTE[situacao]} className="px-2 text-meta" data-regra={situacao}>
            {rotulo}
          </Badge>
        </div>
        <p className="text-label text-text-muted">{texto}</p>
        <p className="text-meta text-text-subtle">{onde}</p>
      </div>
    </li>
  );
}

export function SecaoRegras({ tema }: { tema: Tema }) {
  const t = useT();
  const cumpre = t("O CRM cumpre");
  return (
    <Secao
      id={`regras-${tema}`}
      titulo={t("Regras que aprendemos no protótipo")}
      mapa="ds:regras"
      tema={tema}
      apoio={t("Cada uma veio de um defeito real encontrado nas rodadas de revisão. Valem para qualquer tela nova.")}
    >
      <ol className="grid grid-cols-1 gap-2 xl:grid-cols-2">
        <Regra n={1} titulo={t("Nada de pre-wrap no contêiner")} texto={t("Só o texto do usuário preserva quebras; senão o recuo do HTML vira espaço em branco.")} situacao="cumpre" rotulo={cumpre} onde="components/inbox/bolha/CorpoDaBolha.tsx" />
        <Regra n={2} titulo={t("Menu se mede, não se estima")} texto={t("Posição calculada pela altura real depois de desenhado, invisível durante a medição.")} situacao="cumpre" rotulo={cumpre} onde="components/inbox/menu/ConteudoDoMenu.tsx (collisionPadding)" />
        <Regra n={3} titulo={t("Todo menu fecha por fora e por Esc")} texto={t("Testar os dois jeitos ao criar qualquer menu suspenso.")} situacao="cumpre" rotulo={cumpre} onde="components/ui/dropdown-menu.tsx, components/ui/popover.tsx" />
        <Regra n={4} titulo={t("Pílula não quebra texto")} texto={t("Largura pelo conteúdo e quebra de linha entre itens, nunca dentro deles.")} situacao="cumpre" rotulo={cumpre} onde="components/inbox/item/MetaDaConversa.tsx (whitespace-nowrap)" />
        <Regra n={5} titulo={t("Arrastar não perde o ponteiro")} texto={t("Durante o arraste, o movimento é ouvido mesmo fora do elemento, com saídas de emergência.")} situacao="outro-jeito" rotulo={t("Cumpre de outro jeito")} onde={t("components/inbox/colunas/PegadorDeColuna.tsx: captura do ponteiro (setPointerCapture), e não ouvinte na janela")} />
        <Regra n={6} titulo={t("Nada de controle nativo genérico")} texto={t("Data, hora e seletores seguem o design system.")} situacao="nao-cumpre" rotulo={t("Ainda não")} onde={t("O <select> e a caixa de seleção nativos seguem em uso, estilizados pelo globals.css.")} />
        <Regra n={7} titulo={t("Revisar sem remover")} texto={t("Mudança cobre só o que foi apontado; o que não foi criticado está aprovado.")} situacao="processo" rotulo={t("Regra de processo")} onde={t("Vale para a revisão, não para o código.")} />
        <Regra n={8} titulo={t("Paridade com o CRM atual")} texto={t("Toda ação que existe hoje (ganho, perdido, excluir, trocar funil) continua existindo na v2.")} situacao="cumpre" rotulo={cumpre} onde="components/inbox/painel/AcoesDoNegocio.tsx, MenuDoLead.tsx" />
      </ol>
    </Secao>
  );
}
