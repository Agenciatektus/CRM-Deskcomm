"use client";
import { type ReactNode, useTransition } from "react";
import Link from "next/link";

import { ConnectionHealthDot } from "@/components/connections/ConnectionHealthDot";
import { FotoDaPessoa } from "@/components/fotos/FotoDaPessoa";
import { BotaoDeDisponibilidade } from "@/components/shell/BotaoDeDisponibilidade";
import { ContadorDaFila } from "@/components/shell/ContadorDaFila";
import { ContadorDeCasos } from "@/components/shell/ContadorDeCasos";
import { ContadorDeTarefas } from "@/components/shell/ContadorDeTarefas";
import { SeletorDeIdioma } from "@/components/shell/SeletorDeIdioma";
import { TenantSwitcher } from "@/components/shell/TenantSwitcher";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { useAuth } from "@/hooks/auth/AuthProvider";
import { useT } from "@/hooks/i18n/useT";
import { hubSections, NAV_GROUPS, type NavDestination, type NavGroupId } from "@/lib/navigation/registry";
import { CaretRight, PencilSimple, ShieldCheck, SignOut } from "@/lib/ui/icons";

/** A cor do ícone de cada grupo (o `.g-*` do protótipo), pelos tokens de avatar do DS. */
const COR_DO_GRUPO: Record<NavGroupId, string> = {
  atendimento: "bg-avatar-1 text-avatar-1-fg",
  crm: "bg-avatar-2 text-avatar-2-fg",
  ia: "bg-avatar-3 text-avatar-3-fg",
  canais: "bg-avatar-4 text-avatar-4-fg",
  analise: "bg-avatar-5 text-avatar-5-fg",
  organizacao: "bg-avatar-6 text-avatar-6-fg",
};

/** A lista em cartão (o `.lst` do protótipo). */
const CARTAO = "mx-4 overflow-hidden rounded-(--mb-cartao-raio) border border-border bg-surface";
const LINHA_DO_PERFIL = "flex min-h-15 items-center gap-3 border-t border-border py-2";

function iniciais(nome: string | null, email: string): string {
  const base = nome?.trim() ? nome.trim().split(/\s+/).slice(0, 2).map((p) => p[0]) : [email.slice(0, 2)];
  return base.join("").toUpperCase();
}

/** A linha do menu (o `.li` do protótipo): ícone na cor do grupo, nome, para que serve, chevron. */
function Linha({
  href,
  rotulo,
  sub,
  cor,
  Icone,
  fim,
  aoTocar,
}: {
  href: string;
  rotulo: string;
  sub?: string;
  cor: string;
  Icone?: NavDestination["icon"];
  fim?: ReactNode;
  aoTocar: () => void;
}) {
  return (
    <li>
      <Link
        href={href}
        onClick={aoTocar}
        className="pele-foco grid min-h-(--mb-menu-item) w-full grid-cols-[var(--mb-menu-icone)_minmax(0,1fr)_auto] items-center gap-3 py-2 pr-3 pl-3.5 text-left hover:bg-hover"
      >
        <span className={`grid size-(--mb-menu-icone) place-items-center rounded-[10px] ${cor}`}>
          {Icone ? <Icone size={19} aria-hidden /> : <CaretRight size={19} aria-hidden />}
        </span>
        <span className="min-w-0">
          <b className="block text-[15.5px] leading-tight font-semibold text-text">{rotulo}</b>
          {sub ? <small className="mt-px block text-[13px] leading-tight text-text-muted">{sub}</small> : null}
        </span>
        <span className="flex items-center gap-1.5 text-text-subtle">
          {fim}
          <CaretRight size={16} aria-hidden />
        </span>
      </Link>
    </li>
  );
}

/** O cartão do perfil (o `.prof` do protótipo), com os mesmos controles do topo do desktop. */
function CartaoDoPerfil({ aoNavegar }: { aoNavegar: () => void }) {
  const t = useT();
  const { user } = useAuth();
  return (
    <section className="mx-4 mt-1 mb-2 flex flex-col rounded-(--mb-perfil-raio) border border-border bg-surface p-4">
      <div className="flex items-center gap-3.5 pb-3">
        <FotoDaPessoa
          url={user.avatar_url}
          iniciais={iniciais(user.full_name, user.email)}
          className="pele-grad grid size-12 shrink-0 place-items-center rounded-full font-bold"
        />
        <span className="min-w-0 flex-1">
          <b className="block truncate text-[19px] font-bold text-text">{user.full_name ?? user.email}</b>
          <small className="block truncate text-[13.5px] text-text-muted">{user.email}</small>
        </span>
        <Link
          href="/app/settings/profile"
          onClick={aoNavegar}
          aria-label={t("Editar perfil")}
          className="pele-foco grid size-(--mb-alvo) place-items-center rounded-full text-text-muted hover:bg-hover"
        >
          <PencilSimple size={18} aria-hidden />
        </Link>
      </div>
      {/* Some inteira com uma organização só (antes ficava uma linha vazia). */}
      <TenantSwitcher variante="linha" classeDaLinha={LINHA_DO_PERFIL} />
      <div className={LINHA_DO_PERFIL}>
        <span className="flex-1 text-base font-semibold text-text">{t("Disponível")}</span>
        <BotaoDeDisponibilidade />
      </div>
      <div className={LINHA_DO_PERFIL}>
        <span className="flex-1 text-base font-semibold text-text">{t("Tema e idioma")}</span>
        <SeletorDeIdioma />
        <ThemeToggle />
      </div>
      {/* A porta do modo administrador, com o mesmo gate do menu do usuário. */}
      {user.is_platform_admin ? (
        <Link href="/admin" onClick={aoNavegar} className={`pele-foco ${LINHA_DO_PERFIL} text-base font-semibold text-text`}>
          <ShieldCheck size={20} aria-hidden className="text-text-muted" />
          <span className="flex-1">{t("Modo administrador")}</span>
          <CaretRight size={16} aria-hidden className="text-text-subtle" />
        </Link>
      ) : null}
    </section>
  );
}

/**
 * A aba "Mais" (tela 9 do protótipo), em folha de tela cheia: o cartão do perfil e o
 * catálogo inteiro do CRM por grupo, em listas de cartão com ícone, nome e para que
 * serve. Itens e gates são os do registro de navegação (`hubSections`: o mesmo filtro
 * de papel, interface, módulo e capacidade da barra lateral e dos hubs), e o "Ver
 * tudo" de cada grupo leva ao hub dele. Nada aqui decide permissão.
 */
export function MenuMais({ aberto, aoMudar }: { aberto: boolean; aoMudar: (aberto: boolean) => void }) {
  const t = useT();
  const { user, activeOrg, signOut } = useAuth();
  const [saindo, startTransition] = useTransition();
  const fechar = () => aoMudar(false);
  const grupos = NAV_GROUPS.map((g) => ({
    g,
    secoes: hubSections(
      g.id,
      user.is_platform_admin && !user.support,
      activeOrg?.role ?? null,
      activeOrg?.interface_settings,
      activeOrg?.modulos_ligados ?? [],
      activeOrg?.capacidades_ligadas ?? [],
    ),
  })).filter(({ secoes }) => secoes.length > 0);

  return (
    <Sheet open={aberto} onOpenChange={aoMudar}>
      <SheetContent
        side="bottom"
        className="flex h-[100dvh] flex-col gap-0 bg-background p-0 pt-(--mb-area-topo) pb-(--mb-area-baixo)"
      >
        <SheetTitle className="flex h-(--mb-titulo-altura) shrink-0 items-center pr-12 pl-4 text-(length:--mb-titulo-fonte) leading-[1.1] font-bold tracking-[-0.015em] text-text">
          {t("Mais")}
        </SheetTitle>
        <div className="min-h-0 flex-1 overflow-y-auto pb-6">
          <CartaoDoPerfil aoNavegar={fechar} />

          {grupos.map(({ g, secoes }) => (
            <section key={g.id} aria-labelledby={`mais-${g.id}`}>
              <h3 id={`mais-${g.id}`} className="px-5 pt-5 pb-1.5 text-(length:--mb-grupo-fonte) font-bold text-text">
                {t(g.label)}
              </h3>
              {secoes.map((secao) => (
                <div key={secao.section || "sem-secao"} className="mb-2">
                  {secao.section ? (
                    <div className="px-5 py-1.5 text-xs font-bold tracking-[0.06em] text-text-subtle uppercase">
                      {t(secao.section)}
                    </div>
                  ) : null}
                  <ul className={`${CARTAO} divide-y divide-border`}>
                    {/* Perfil já tem porta própria: o cartão do topo (lápis). */}
                    {secao.items.filter((item) => item.href !== "/app/settings/profile").map((item) => (
                      <Linha
                        key={item.href}
                        href={item.href}
                        rotulo={t(item.label)}
                        sub={item.description ? t(item.description) : undefined}
                        cor={COR_DO_GRUPO[g.id]}
                        Icone={item.icon}
                        aoTocar={fechar}
                        fim={
                          <>
                            {item.healthDot && <ConnectionHealthDot />}
                            {item.contador === "casos" && <ContadorDeCasos compacto={false} />}
                            {item.contador === "fila" && <ContadorDaFila compacto={false} />}
                            {item.contador === "tarefas" && <ContadorDeTarefas />}
                          </>
                        }
                      />
                    ))}
                  </ul>
                </div>
              ))}
              {g.hub ? (
                <ul className={CARTAO}>
                  <Linha href={g.hub.href} rotulo={t(g.hub.label)} cor={COR_DO_GRUPO[g.id]} aoTocar={fechar} />
                </ul>
              ) : null}
            </section>
          ))}

          {/* O `.out-btn` do protótipo: o mesmo "Sair" do menu do usuário. */}
          <button
            type="button"
            disabled={saindo}
            onClick={() => startTransition(async () => { await signOut(); })}
            className="pele-foco mx-4 mt-4 flex min-h-13 w-[calc(100%-2rem)] items-center justify-center gap-2 rounded-(--mb-cartao-raio) border border-border bg-surface font-bold text-error disabled:opacity-60"
          >
            <SignOut size={18} aria-hidden />
            {t("Sair")}
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
