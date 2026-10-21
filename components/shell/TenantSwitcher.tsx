"use client";
import Link from "next/link";
import { useState } from "react";
import { flushSync } from "react-dom";
import { toast } from "sonner";
import { useT } from "@/hooks/i18n/useT";
import { useOrganizationTransitionOpcional } from "./OrganizationTransitionProvider";
import { CaretDown, Storefront } from "@/lib/ui/icons";
import { useAuth } from "@/hooks/auth/AuthProvider";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { setActiveOrg } from "@/app/actions/shell/setActiveOrg";

/** A sigla da organização (`.rail-tenant`): as iniciais das duas primeiras palavras. */
export function siglaDaOrganizacao(nome: string | null | undefined): string {
  const palavras = (nome ?? "").trim().split(/\s+/).filter(Boolean);
  if (palavras.length === 0) return "?";
  const letras = palavras.length === 1 ? palavras[0]!.slice(0, 2) : palavras[0]![0]! + palavras[1]![0]!;
  return letras.toUpperCase();
}

/** A URL da foto de uma organização da pessoa, ou `null`. */
function fotoDe(
  organizacoes: ReadonlyArray<{ organization_id: string; foto_url?: string | null }> | undefined,
  orgId: string | undefined,
): string | null {
  if (!orgId) return null;
  return organizacoes?.find((o) => o.organization_id === orgId)?.foto_url ?? null;
}

/**
 * A foto da organização, ou a sigla quando não há foto OU quando a imagem não
 * carrega (assinatura vencida, arquivo apagado): o quadrado nunca fica vazio nem
 * mostra o ícone de imagem quebrada.
 */
function ImagemOuSigla({ foto, sigla, classe }: { foto: string | null; sigla: string; classe?: string }) {
  const [quebrou, setQuebrou] = useState(false);
  if (!foto || quebrou) {
    return classe ? (
      <span aria-hidden className={`${classe} grid place-items-center bg-accent text-[9px] font-bold text-accent-foreground`}>
        {sigla}
      </span>
    ) : (
      <span aria-hidden>{sigla}</span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- a URL é a rota que confere o vínculo e assina
    <img
      src={foto}
      alt=""
      aria-hidden
      data-testid="foto-da-organizacao"
      onError={() => setQuebrou(true)}
      className={classe ? `${classe} object-cover` : "size-full rounded-[inherit] object-cover"}
    />
  );
}

/**
 * A troca de organização. Duas formas:
 *  - `trilho` (quadro DS, `.rail-tenant`): o quadrado de 40px no topo do
 *    trilho, com a sigla da organização na cor da marca (degradê no escuro).
 *    Abre a troca; com uma organização só, é só a identificação.
 *  - `cabecalho`: o botão do topo, que fica só no celular (sem trilho).
 */
export function TenantSwitcher({
  variante = "cabecalho",
  classeDaLinha,
}: {
  variante?: "cabecalho" | "trilho" | "linha";
  /** Só na `linha` (menu "Mais" do celular): a caixa da linha, que some junto quando não há troca. */
  classeDaLinha?: string;
}) {
  const t = useT();
  const { user, activeOrg: active } = useAuth();
  const transition = useOrganizationTransitionOpcional();
  const [isPending, setPending] = useState(false);
  const switchTo = async (orgId: string) => {
    if (orgId === active?.orgId) return;
    flushSync(() => { setPending(true); transition?.begin(t("Carregando organização…")); });
    try {
      const result = await setActiveOrg(orgId);
      if (!result.ok) throw new Error(result.error);
      // Novo documento elimina QueryClient, subscriptions e respostas em voo.
      window.location.assign("/app/inbox");
    } catch {
      transition?.cancel();
      setPending(false);
      toast.error(t("Não foi possível trocar de organização. Seu acesso pode ter mudado. Tente novamente."));
    }
  };

  const podeTrocar = (user.organizations?.length ?? 0) > 1 || !!user.is_platform_admin;
  const sigla = siglaDaOrganizacao(active?.name);
  // A FOTO da organização (migration 9061) no lugar da sigla, quando houver. A
  // URL vem pronta das memberships; sem foto, a sigla fica como sempre foi.
  const fotoAtiva = fotoDe(user.organizations, active?.orgId);
  // O texto branco sobre o degradê do escuro é rótulo de 13px/700: vai no
  // degradê do contador (meio 4,92:1), o mesmo piso dos selos pequenos.
  const QUADRADO =
    "pele-grad-contador grid size-10 shrink-0 place-items-center rounded-[11px] bg-accent text-label font-bold text-accent-foreground transition-shadow";
  if (variante === "trilho" && !podeTrocar) {
    return (
      <span className={QUADRADO} title={active?.name ?? undefined} data-testid="sigla-da-organizacao">
        <ImagemOuSigla foto={fotoAtiva} sigla={sigla} />
        <span className="sr-only">{`${t("Organização")}: ${active?.name ?? ""}`}</span>
      </span>
    );
  }
  if (!podeTrocar) return null;

  const menu = (
    // `modal={false}` (aqui, no UserMenu e no SeletorDeIdioma): o menu modal do Radix
    // trava a rolagem do <body>; com a página rolada, a barra lateral e o topo
    // (sticky) saíam do lugar e a rolagem ficava presa (bug relatado em 20/10).
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        {variante === "trilho" ? (
          <button
            type="button"
            disabled={isPending || !!user.support}
            aria-label={`${t("Organização")}: ${active?.name ?? t("Selecionar org")}. ${t("Trocar de organização")}`}
            title={user.support ? "Saia do acompanhamento para trocar de organização" : (active?.name ?? undefined)}
            data-testid="tenant-switcher"
            className={`${QUADRADO} hover:shadow-[0_0_0_3px_var(--color-accent-soft)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-70`}
          >
            <ImagemOuSigla foto={fotoAtiva} sigla={sigla} />
          </button>
        ) : variante === "linha" ? (
          // No "Mais" do celular há espaço: o nome da organização vai escrito, e a
          // linha inteira é o alvo do toque (antes era só o ícone, quase invisível).
          <button
            type="button"
            disabled={isPending || !!user.support}
            aria-label={`${t("Organização")}: ${active?.name ?? t("Selecionar org")}. ${t("Trocar de organização")}`}
            data-testid="tenant-switcher"
            className="pele-foco flex min-w-0 flex-1 items-center gap-3 rounded-md text-left disabled:opacity-70"
          >
            {fotoAtiva ? (
              <ImagemOuSigla foto={fotoAtiva} sigla={sigla} classe="size-8 shrink-0 rounded-[9px]" />
            ) : (
              <Storefront size={20} weight="duotone" aria-hidden className="shrink-0 text-text-muted" />
            )}
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-xs text-text-muted">{t("Organização")}</span>
              <span className="truncate text-base font-semibold text-text">{active?.name ?? t("Selecionar org")}</span>
            </span>
            <CaretDown size={16} aria-hidden className="shrink-0 text-text-muted" />
          </button>
        ) : (
        /*
          ⚠️ NO CELULAR ESTE BOTÃO É SÓ O ÍCONE, e isso não é economia de estilo:
          é o que faz o cabeçalho caber.

          Medido na tela, numa instalação real em 360px: com o nome escrito, o
          botão ocupava 153px e o cabeçalho tinha 14 sobreposições, a pior de
          96px — o nome da organização por baixo do campo de busca, e a busca por
          cima do sino. Hambúrguer + nome + busca + sino + avatar não cabem em
          360px, e o bloco do meio é `flex-1 justify-center` entre dois
          `shrink-0`: quando falta espaço ele transborda por cima dos vizinhos em
          vez de encolher.

          Só o ícone: 40px, e as sobreposições vão a zero. O nome completo
          continua a UM TOQUE, dentro do menu que este botão já abre — e
          continua no `aria-label`, para quem usa leitor de tela.

          `min-w-0` sozinho NÃO resolve (medido): ele deixa o flex comprimir o
          texto, mas a 18px visíveis o nome vira "M…", e as colisões de 13px com
          a busca continuam. O espaço é que não existe.
        */
        <Button
          variant="ghost"
          size="sm"
          disabled={isPending || !!user.support}
          className="gap-2"
          aria-label={`${t("Organização")}: ${active?.name ?? t("Selecionar org")}`}
          title={user.support ? "Saia do acompanhamento para trocar de organização" : undefined}
          data-testid="tenant-switcher"
        >
          {fotoAtiva ? (
            <ImagemOuSigla foto={fotoAtiva} sigla={sigla} classe="size-6 shrink-0 rounded-[7px]" />
          ) : (
            <Storefront size={16} weight="duotone" aria-hidden />
          )}
          <span className="hidden max-w-[160px] truncate md:inline">
            {active?.name ?? "Selecionar org"}
          </span>
          <CaretDown size={12} aria-hidden className="hidden md:inline" />
        </Button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side={variante === "trilho" ? "right" : "bottom"} className="min-w-[220px]">
        {(user.organizations ?? []).map((org) => (
          <DropdownMenuItem
            key={org.organization_id}
            data-testid={`tenant-switcher-item-${org.organization_id}`}
            onClick={() => { void switchTo(org.organization_id); }}
            className="flex items-center justify-between gap-2"
          >
            <span className="flex min-w-0 items-center gap-2">
              {org.foto_url ? (
                <ImagemOuSigla
                  foto={org.foto_url}
                  sigla={siglaDaOrganizacao(org.organization_name)}
                  classe="size-5 shrink-0 rounded-[6px]"
                />
              ) : null}
              <span className="truncate">{org.organization_name}</span>
            </span>
            {active?.orgId === org.organization_id && <span className="text-xs text-muted-foreground">✓</span>}
          </DropdownMenuItem>
        ))}
        {user.is_platform_admin && <DropdownMenuItem asChild>
          <Link href="/admin/tenants">{t("Gerenciar organizações")}</Link>
        </DropdownMenuItem>}
      </DropdownMenuContent>
    </DropdownMenu>
  );
  return variante === "linha" ? <div className={classeDaLinha}>{menu}</div> : menu;
}
