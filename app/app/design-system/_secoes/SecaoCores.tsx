"use client";

import { useT } from "@/hooks/i18n/useT";

import { Amostra, ParDeContraste } from "../_componentes/Amostra";
import { Secao } from "../_componentes/Secao";
import type { Tema } from "../_componentes/tema";
import { Atmosfera } from "./Atmosfera";
import { AVATARES, ESTADOS, MARCA, PARES, PELE, SUPERFICIES, TINTAS, type ItemDeCor } from "./dados-de-cor";

function Grade({ itens, tema }: { itens: ItemDeCor[]; tema: Tema }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
      {itens.map((i) => (
        <Amostra key={i.token} token={i.token} classe={i.classe} mapa={i.mapa} tema={tema} />
      ))}
    </div>
  );
}

const FAIXA_ESCURA = [
  ["chrome", "bg-bg"],
  ["surface", "bg-surface"],
  ["thread", "bg-thread"],
  ["line", "bg-border"],
  ["ink", "bg-text"],
] as const;

/** As cinco superfícies do escuro, como o quadro claro as mostra: numa faixa escura de verdade. */
function FaixaEscura() {
  return (
    <div data-theme="dark" className="grid grid-cols-2 gap-2 rounded-lg bg-bg p-3 text-text sm:grid-cols-5">
      {FAIXA_ESCURA.map(([nome, classe]) => (
        <div key={nome} className="overflow-hidden rounded-md border border-border bg-surface">
          <i className={`block h-10 ${classe}`} aria-hidden />
          <code className="block px-2 py-1 text-meta">{nome}</code>
        </div>
      ))}
    </div>
  );
}

/** "Cor", com as subseções na ordem do quadro do tema do painel. */
export function SecaoCores({ tema }: { tema: Tema }) {
  const t = useT();
  const claro = tema === "claro";
  return (
    <Secao
      id={`cor-${tema}`}
      titulo={t("Cor")}
      mapa="ds:cor"
      tema={tema}
      apoio={
        claro
          ? t("Neutros com leve tom frio (matiz 255). Três camadas: moldura, superfície de trabalho e fundo do chat. Cada amostra é a classe que as telas usam, com o valor que o navegador computou aqui.")
          : t("Tema escuro com neutros de leve matiz azul. O degradê da logo marca ação e progresso, e o brilho da moldura fica no canto. Cada amostra é a classe que as telas usam, com o valor computado aqui.")
      }
    >
      <Secao id={`neutros-${tema}`} sub titulo={claro ? t("Neutros, tema claro") : t("Neutros, escuro")} mapa="ds:neutros" tema={tema}>
        <Grade itens={[...SUPERFICIES, ...TINTAS]} tema={tema} />
        <Grade itens={AVATARES} tema={tema} />
      </Secao>
      {claro ? (
        <Secao id="tema-escuro-claro" sub titulo={t("Tema escuro (desenhado, não invertido)")} mapa="ds:tema-escuro" tema={tema}>
          <FaixaEscura />
          <Atmosfera />
        </Secao>
      ) : (
        <Secao id="atmosfera-escuro" sub titulo={t("Atmosfera")} mapa="ds:atmosfera" tema={tema}>
          <Atmosfera />
        </Secao>
      )}
      <Secao
        id={`destaque-${tema}`}
        sub
        titulo={claro ? t("Destaque (vem da marca do revendedor)") : t("Destaque (gradiente da logo)")}
        mapa="ds:destaque"
        tema={tema}
        apoio={t("Os tons suaves saem do destaque por color-mix. Trocar a cor da marca não exige mexer em mais nada.")}
      >
        <Grade itens={claro ? MARCA : [...MARCA, ...PELE]} tema={tema} />
      </Secao>
      <Secao id={`estados-${tema}`} sub titulo={t("Estados")} mapa="ds:estados" tema={tema}>
        <Grade itens={ESTADOS} tema={tema} />
        <h4 className="text-label font-bold">{t("Contraste dos pares de texto (AA = 4,5:1)")}</h4>
        <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
          {PARES.map((p) => (
            <ParDeContraste key={p.nome} nome={p.nome} classe={p.classe} />
          ))}
        </div>
      </Secao>
    </Secao>
  );
}
