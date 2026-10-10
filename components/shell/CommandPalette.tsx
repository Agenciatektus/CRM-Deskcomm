"use client";
import { type ReactNode, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { AvatarDoContato } from "@/components/inbox/AvatarDoContato";
import { initials, siglaDoTelefone } from "@/components/inbox/item/tempo-da-linha";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/hooks/auth/AuthProvider";
import { useT } from "@/hooks/i18n/useT";
import { phoneForDisplay } from "@/lib/channels/phone-variants";
import { rotuloDoContato } from "@/lib/contacts/rotulo-do-contato";
import { Lightning, MagnifyingGlass, UserCircle } from "@/lib/ui/icons";
import { NAV_GROUPS, searchable, type NavDestination } from "@/lib/navigation/registry";
import { destinosDaInterface } from "@/lib/navigation/interface";
import { TETO_DO_TERMO_DE_BUSCA } from "@/lib/inbox/termo-de-busca";
import { cn } from "@/lib/utils";

import { useAcoesDaPaleta, type AcaoDaPaleta } from "./paleta/acoes";
import { useBuscaRemota, type Achado } from "./paleta/busca-remota";

/**
 * A busca geral (Ctrl K), no desenho da paleta do protótipo (T6-T10): uma lista
 * agrupada em Recentes / Contatos e conversas, Ações e Telas.
 *
 * Sem `cmdk`: Dialog e uma lista com setas e Enter são poucas linhas.
 *
 * Leads ficam de fora por enquanto: a rota de leads não aceita `search`, e
 * listar todos para filtrar no navegador seria o endpoint pesado que a regra
 * proíbe.
 */

/** Sem acento e sem caixa: ninguém digita "orçamento" com cedilha às pressas. */
function normalizar(texto: string): string {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** Todas as palavras precisam aparecer, em qualquer ordem ("quadro b2b"). */
function casa(texto: string, palavras: string[]): boolean {
  if (palavras.length === 0) return true;
  const alvo = normalizar(texto);
  return palavras.every((p) => alvo.includes(p));
}

const ROTULO_GRUPO = new Map(NAV_GROUPS.map((g) => [g.id, g.label]));
const ORDEM_GRUPO = new Map(NAV_GROUPS.map((g, i) => [g.id, i]));

export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useT();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="pele-ruido top-[12vh] w-[min(620px,calc(100vw-24px))] max-w-none translate-y-0 gap-0 overflow-hidden rounded-2xl p-0 shadow-lg sm:max-w-none">
        <DialogTitle className="sr-only">{t("Busca geral")}</DialogTitle>
        {/* O miolo é um componente à parte porque o Radix o DESMONTA ao fechar:
            busca e destaque nascem zerados na próxima abertura por construção. */}
        <Resultados aoEscolher={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

interface Item {
  chave: string;
  href?: string;
  titulo: string;
  sub: ReactNode;
  /** Rótulo pequeno em caixa alta (o módulo da tela). */
  marca?: string;
  icone: ReactNode;
  dica: string;
  executar: () => void;
}

interface Grupo {
  rotulo: string;
  itens: Item[];
}

function Resultados({ aoEscolher }: { aoEscolher: () => void }) {
  const t = useT();
  const router = useRouter();
  const { user, activeOrg } = useAuth();
  const [busca, setBusca] = useState("");
  const [destacado, setDestacado] = useState(0);
  const termo = busca.trim();
  const palavras = normalizar(termo).split(/\s+/).filter(Boolean);
  const destinos = destinosDaInterface(
    activeOrg?.interface_settings,
    user.is_platform_admin && !user.support,
    activeOrg?.role ?? null,
  );
  const { achados, carregando } = useBuscaRemota(busca, {
    conversas: destinos.some((d) => d.href === "/app/inbox"),
    contatos: destinos.some((d) => d.href === "/app/contacts"),
  });
  const acoes = useAcoesDaPaleta();

  const visiveis = useMemo(
    () =>
      searchable(
        user.is_platform_admin && !user.support,
        activeOrg?.role ?? null,
        activeOrg?.interface_settings,
        activeOrg?.modulos_ligados ?? [],
        activeOrg?.capacidades_ligadas ?? [],
      ),
    [
      user.is_platform_admin,
      user.support,
      activeOrg?.role,
      activeOrg?.interface_settings,
      activeOrg?.modulos_ligados,
      activeOrg?.capacidades_ligadas,
    ],
  );

  function ir(href: string) {
    aoEscolher();
    router.push(href);
  }

  function itemDoAchado(a: Achado): Item {
    if (a.tipo === "conversa") {
      const c = a.conversa.contacts ?? null;
      const nome = rotuloDoContato(c, t);
      const telefone = c?.phone_number ? phoneForDisplay(c.phone_number) : null;
      const estado = a.aba === "archived" ? t("Arquivada") : a.aba === "closed" ? t("Fechada") : t("Aberta");
      return {
        chave: `conversa:${a.id}`,
        titulo: nome,
        sub: [telefone, estado].filter(Boolean).join(", "),
        icone: (
          <AvatarDoContato
            contato={c}
            nome={nome}
            iniciais={initials(nome, siglaDoTelefone(c?.phone_number))}
            className="h-8 w-8 text-[11px]"
          />
        ),
        dica: t("Abrir conversa"),
        // A conversa fechada ou arquivada abre na aba em que ela aparece.
        executar: () => ir(`/app/inbox?filter=${a.aba}&id=${a.id}`),
      };
    }
    const nome = rotuloDoContato(a.contato, t);
    const telefone = a.contato.phone_number ?? null;
    return {
      chave: `contato:${a.id}`,
      titulo: nome,
      sub: telefone ? phoneForDisplay(telefone) : t("Contato"),
      icone: (
        <IconeDaLinha>
          <UserCircle size={16} aria-hidden />
        </IconeDaLinha>
      ),
      dica: t("Abrir contato"),
      executar: () => ir(`/app/contacts/${a.id}`),
    };
  }

  function itemDaAcao(a: AcaoDaPaleta): Item {
    return {
      chave: `acao:${a.id}`,
      titulo: a.titulo,
      sub: a.sub,
      icone: (
        <IconeDaLinha>
          <Lightning size={16} aria-hidden />
        </IconeDaLinha>
      ),
      dica: t("Executar"),
      executar: () => {
        aoEscolher();
        a.executar();
      },
    };
  }

  function itemDaTela(d: NavDestination): Item {
    const Icone = d.icon;
    return {
      chave: `tela:${d.href}`,
      href: d.href,
      titulo: t(d.label),
      marca: t(ROTULO_GRUPO.get(d.group) ?? ""),
      // A descrição, e não só o módulo: a palavra que a pessoa buscou pode
      // estar nela ("esfriou" acha o Radar, "jev" acha Provedores).
      sub: t(d.description),
      icone: (
        <IconeDaLinha>
          <Icone size={16} aria-hidden />
        </IconeDaLinha>
      ),
      dica: t("Ir para a tela"),
      executar: () => ir(d.href),
    };
  }

  const telas = termo
    ? visiveis.filter((d) =>
        casa(
          `${t(d.label)} ${d.label} ${t(d.description)} ${t(ROTULO_GRUPO.get(d.group) ?? "")} ${d.apelidos ?? ""}`,
          palavras,
        ),
      )
    : [...visiveis].sort((a, b) => (ORDEM_GRUPO.get(a.group) ?? 0) - (ORDEM_GRUPO.get(b.group) ?? 0));
  const acoesQueCasam = acoes.filter((a) => casa(`${a.titulo} ${a.sub}`, palavras));

  // Ordem e limites do protótipo: sem termo, recentes + 3 ações + 4 telas; com
  // termo, até 5 contatos/conversas, 4 ações e 5 telas.
  const grupos: Grupo[] = [
    { rotulo: termo ? t("Contatos e conversas") : t("Recentes"), itens: achados.slice(0, 5).map(itemDoAchado) },
    { rotulo: t("Ações"), itens: acoesQueCasam.slice(0, termo ? 4 : 3).map(itemDaAcao) },
    { rotulo: t("Telas"), itens: telas.slice(0, termo ? 5 : 4).map(itemDaTela) },
  ].filter((g) => g.itens.length > 0);
  const plana = grupos.flatMap((g) => g.itens);
  const indice = Math.min(destacado, Math.max(plana.length - 1, 0));

  /**
   * O destaque volta ao topo junto com a busca, no mesmo evento: mantê-lo
   * apontaria para outro item depois que a lista muda, e o Enter abriria o
   * lugar errado.
   */
  function aoDigitar(valor: string) {
    setBusca(valor);
    setDestacado(0);
  }

  function aoTeclar(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setDestacado(Math.min(indice + 1, plana.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setDestacado(Math.max(indice - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      plana[indice]?.executar();
    }
  }

  let posicao = 0;
  return (
    <>
      <div className="flex h-14 items-center gap-2.5 border-b px-3.5">
        <MagnifyingGlass size={18} aria-hidden className="shrink-0 text-text-subtle" />
        <input
          autoFocus
          role="combobox"
          aria-expanded
          aria-controls="palette-resultados"
          aria-activedescendant={plana[indice] ? `palette-${indice}` : undefined}
          value={busca}
          onChange={(e) => aoDigitar(e.target.value)}
          onKeyDown={aoTeclar}
          maxLength={TETO_DO_TERMO_DE_BUSCA}
          placeholder={t("Buscar contato, conversa ou tela")}
          className="h-full min-w-0 flex-1 bg-transparent text-base text-text outline-hidden placeholder:text-text-subtle"
        />
        {busca && (
          <button
            type="button"
            onClick={() => aoDigitar("")}
            className="rounded-md px-2 py-1 text-xs text-text-muted hover:bg-surface-elevated"
          >
            {t("Limpar")}
          </button>
        )}
      </div>

      {termo && plana.length === 0 && !carregando ? (
        <div className="px-5 py-9 text-center text-sm text-text-muted">
          <strong className="mb-1 block text-[15px] text-text">
            {t("Nada encontrado para")} “{busca}”
          </strong>
          {t("Tente o nome, parte do telefone ou o nome de uma tela.")}
        </div>
      ) : (
        <div
          id="palette-resultados"
          role="listbox"
          aria-label={t("Resultados")}
          className="max-h-[min(60vh,520px)] overflow-y-auto overscroll-contain p-1.5"
        >
          {grupos.map((g) => (
            <div key={g.rotulo} role="group" aria-label={g.rotulo}>
              <div role="presentation" className="px-2.5 pb-1 pt-2.5 text-xs font-bold text-text-subtle">
                {g.rotulo}
              </div>
              {g.itens.map((item) => {
                const i = posicao++;
                const ativo = i === indice;
                return (
                  <div
                    key={item.chave}
                    id={`palette-${i}`}
                    role="option"
                    aria-selected={ativo}
                    data-href={item.href}
                    onMouseEnter={() => setDestacado(i)}
                    onClick={item.executar}
                    className={cn(
                      "flex min-h-12 cursor-pointer items-center gap-3 rounded-lg px-2.5 py-1.5",
                      ativo && "bg-surface-elevated",
                    )}
                  >
                    {item.icone}
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline gap-2">
                        <b className="truncate text-sm font-semibold text-text">{item.titulo}</b>
                        {item.marca && (
                          <span className="truncate text-[10px] font-medium tracking-wider text-text-subtle uppercase">
                            {item.marca}
                          </span>
                        )}
                      </span>
                      <p className="truncate text-[12.5px] text-text-muted">{item.sub}</p>
                    </span>
                    <span className={cn("whitespace-nowrap text-xs text-text-subtle", !ativo && "opacity-0")}>
                      {item.dica}
                    </span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
      <div className="hidden items-center gap-4 border-t bg-surface-elevated px-3.5 py-2 text-xs text-text-subtle sm:flex">
        <span>
          <Tecla>↑</Tecla>
          <Tecla>↓</Tecla> {t("navegar")}
        </span>
        <span>
          <Tecla>Enter</Tecla> {t("abrir")}
        </span>
        <span>
          <Tecla>Esc</Tecla> {t("fechar")}
        </span>
      </div>
    </>
  );
}

function IconeDaLinha({ children }: { children: ReactNode }) {
  return (
    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-border bg-surface-elevated text-text-muted">
      {children}
    </span>
  );
}

function Tecla({ children }: { children: ReactNode }) {
  return (
    <kbd className="mr-1 rounded-md border border-b-2 border-border bg-surface px-1.5 font-sans text-[11px] text-text-muted">
      {children}
    </kbd>
  );
}
