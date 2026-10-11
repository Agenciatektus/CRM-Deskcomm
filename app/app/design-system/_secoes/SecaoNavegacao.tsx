"use client";

import type { MouseEvent } from "react";

import { BarraEmDuasColunas } from "@/components/shell/BarraEmDuasColunas";
import { MarcaDaBarra } from "@/components/shell/MarcaDaBarra";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/hooks/auth/AuthProvider";
import { useT } from "@/hooks/i18n/useT";
import { FUNIS_DA_VITRINE } from "@/lib/design-system/amostras/painel";
import { GRUPO_NO_RODAPE } from "@/lib/navigation/catalogo";
import { hubSections, sidebarGroups } from "@/lib/navigation/registry";

import { Exemplo, Secao } from "../_componentes/Secao";
import type { Tema } from "../_componentes/tema";

/**
 * O botão de fixar a barra chama uma Server Action que grava o cookie da
 * pessoa: na vitrine ele não pode valer, senão "fixar" aqui mudaria o menu de
 * verdade. Os dois estados aparecem lado a lado em vez disso.
 */
function semFixar(e: MouseEvent<HTMLDivElement>, rotulos: string[]) {
  const botao = e.target instanceof Element ? e.target.closest("button[aria-label]") : null;
  if (botao && rotulos.includes(botao.getAttribute("aria-label") ?? "")) {
    e.preventDefault();
    e.stopPropagation();
  }
}

function Barra({ recolhida }: { recolhida: boolean }) {
  const t = useT();
  return (
    <div
      onClickCapture={(e) => semFixar(e, [t("Fixar menu"), t("Recolher sidebar")])}
      className="relative h-[30rem] w-[19rem] shrink-0 rounded-lg border border-border bg-bg"
    >
      <aside className={recolhida ? "relative h-full w-18" : "relative h-full w-[19rem]"}>
        <BarraEmDuasColunas collapsed={recolhida} funis={FUNIS_DA_VITRINE} marca={<MarcaDaBarra compacta />} />
      </aside>
    </div>
  );
}

/** "Módulos e páginas": o catálogo real, filtrado pelo acesso de quem olha. */
function ModulosEPaginas() {
  const t = useT();
  const { user, activeOrg } = useAuth();
  const args = [
    user.is_platform_admin && !user.support,
    activeOrg?.role ?? null,
    activeOrg?.interface_settings,
    activeOrg?.modulos_ligados ?? [],
    activeOrg?.capacidades_ligadas ?? [],
  ] as const;
  const grupos = sidebarGroups(...args);
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-40">{t("Módulo")}</TableHead>
          <TableHead>{t("Páginas, por seção do catálogo")}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {grupos.map(({ group, items }) => {
          const secoes = group.hub ? hubSections(group.id, ...args) : [{ section: "", items }];
          return (
            <TableRow key={group.id}>
              <TableCell className="align-top font-semibold">
                {t(group.label)}
                {group.id === GRUPO_NO_RODAPE ? <span className="block text-meta text-text-subtle">{t("no rodapé")}</span> : null}
              </TableCell>
              <TableCell className="text-label text-text-muted">
                {secoes.map((s) => (
                  <p key={s.section || "sem-secao"}>
                    {s.section ? <b className="text-text">{t(s.section)}: </b> : null}
                    {s.items.map((i) => t(i.label)).join(", ")}
                  </p>
                ))}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

export function SecaoNavegacao({ tema }: { tema: Tema }) {
  const t = useT();
  return (
    <Secao
      id={`navegacao-${tema}`}
      titulo={t("Navegação em 2 colunas")}
      mapa="ds:navegacao"
      tema={tema}
      apoio={t("A 1ª coluna (72 px) mostra os módulos; a 2ª (232 px), as páginas do módulo. Recolhida, a 2ª coluna abre por cima ao passar o mouse ou clicar, sem empurrar o conteúdo. Fixar deixa aberta ao lado.")}
    >
      <Exemplo nome={t("Recolhida (passe o mouse ou clique num módulo) e fixada")} mapa="ds:navegacao" tema={tema}>
        <div className="flex flex-wrap gap-6">
          <Barra recolhida />
          <Barra recolhida={false} />
        </div>
        <p className="text-meta text-text-subtle">
          {t("O contador do módulo mostra a fila; o da página, o que pede ação. Na vitrine, fixar não grava a preferência.")}
        </p>
      </Exemplo>
      <Secao id={`modulos-${tema}`} sub titulo={t("Módulos e páginas")} mapa="ds:modulos" tema={tema}>
        <ModulosEPaginas />
      </Secao>
    </Secao>
  );
}
