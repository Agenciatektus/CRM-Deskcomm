"use client";

import { LARGURA_DA_LISTA, LARGURA_DO_PAINEL, MINIMO_DA_CONVERSA } from "@/components/inbox/colunas/larguras";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useT } from "@/hooks/i18n/useT";

import { Exemplo, Secao } from "../_componentes/Secao";
import type { Tema } from "../_componentes/tema";

/**
 * As medidas abaixo são as do CRM, não as do quadro. As faixas reguláveis vêm
 * de `components/inbox/colunas/larguras.ts`; as colunas fixas de 1280 a 1535 e
 * de 768 a 1279 são as classes de `components/inbox/InboxLayout.tsx` (a grade
 * do cartão, perto da linha 412), que não exporta constante.
 */
const COLUNAS_XL = { lista: 272, painel: 296 };
const LISTA_MD = 300;

/** Diagrama das colunas a 1536 px: proporções reais, em escala. */
function Diagrama() {
  const t = useT();
  return (
    <div className="flex h-56 w-full overflow-hidden rounded-xl border border-border bg-bg text-meta">
      <div className="flex w-18 shrink-0 flex-col items-center gap-2 border-r border-dashed border-border-strong p-2 text-text-subtle">
        <b className="text-text">72</b>
        {t("módulos")}
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-10 items-center gap-2 px-3 text-text-subtle">
          <b className="text-text">56</b> {t("topo: trilha, busca, disponibilidade, avisos, tema, conta")}
        </div>
        <div className="mb-2 mr-2 flex min-h-0 flex-1 overflow-hidden rounded-lg border border-border bg-surface">
          <div style={{ flexBasis: LARGURA_DA_LISTA.padrao }} className="shrink-0 border-r border-border p-2 text-text-subtle">
            <b className="text-text">{t("Lista")}</b> {LARGURA_DA_LISTA.padrao} px
          </div>
          <div style={{ minWidth: MINIMO_DA_CONVERSA / 3 }} className="flex-1 p-2 text-text-subtle">
            <b className="text-text">{t("Conversa")}</b> {t("fluida, mínimo")} {MINIMO_DA_CONVERSA} px
          </div>
          <div style={{ flexBasis: LARGURA_DO_PAINEL.padrao }} className="shrink-0 border-l border-border p-2 text-text-subtle">
            <b className="text-text">{t("Lead")}</b> {LARGURA_DO_PAINEL.padrao} px
          </div>
        </div>
      </div>
    </div>
  );
}

export function SecaoLayoutInbox({ tema }: { tema: Tema }) {
  const t = useT();
  const faixa = (f: { min: number; max: number; padrao: number }) => `${f.padrao} px (${f.min}–${f.max})`;
  return (
    <Secao
      id={`layout-${tema}`}
      titulo={t("Layout da Inbox")}
      mapa="ds:layout"
      tema={tema}
      apoio={t("Moldura (navegação e topo) discreta; a área de trabalho é um bloco único arredondado com as três colunas.")}
    >
      <Exemplo nome={t("As colunas a partir de 1536 px")} mapa="ds:layout" tema={tema}>
        <Diagrama />
      </Exemplo>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("Tela")}</TableHead>
            <TableHead>{t("Lista")}</TableHead>
            <TableHead>{t("Conversa")}</TableHead>
            <TableHead>{t("Lead")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody className="font-mono text-label">
          <TableRow>
            <TableCell>≥ 1536</TableCell>
            <TableCell>{faixa(LARGURA_DA_LISTA)}</TableCell>
            <TableCell>≥ {MINIMO_DA_CONVERSA} px</TableCell>
            <TableCell>{faixa(LARGURA_DO_PAINEL)}</TableCell>
          </TableRow>
          <TableRow>
            <TableCell>1280–1535</TableCell>
            <TableCell>{COLUNAS_XL.lista} px</TableCell>
            <TableCell>{t("fluida")}</TableCell>
            <TableCell>{COLUNAS_XL.painel} px</TableCell>
          </TableRow>
          <TableRow>
            <TableCell>768–1279</TableCell>
            <TableCell>{LISTA_MD} px</TableCell>
            <TableCell>{t("fluida")}</TableCell>
            <TableCell>{t("gaveta por cima")}</TableCell>
          </TableRow>
          <TableRow>
            <TableCell>&lt; 768</TableCell>
            <TableCell colSpan={3}>{t("uma coluna: lista ou conversa")}</TableCell>
          </TableRow>
        </TableBody>
      </Table>
      <p className="text-meta text-text-subtle">
        {t("O quadro corta em 1280, 1024 e 760 e regula as colunas a partir de 1280; o CRM corta em 1536, 1280 e 768, e só regula a partir de 1536.")}
      </p>
    </Secao>
  );
}
