"use client";
import { LogotipoDoProduto, SimboloDoProduto } from "@/components/branding/MarcaDoProduto";
import { useAuth } from "@/hooks/auth/AuthProvider";
import { marcaEhADoProduto } from "@/lib/branding";
import { useMarcaDaInstalacao } from "@/lib/branding/contexto";
import { cn } from "@/lib/utils";

/**
 * A marca no topo da barra: logo de quem hospeda, o desenho do produto ou o nome.
 *
 * Um componente só para as duas barras (a de uma coluna do celular e o trilho de
 * duas colunas do desktop), porque a regra de QUAL marca aparece é a parte que já
 * deu defeito duas vezes (hidratação divergente e logo sumindo no escuro) e não
 * pode existir em duas cópias.
 *
 * `compacta` é o trilho de 72px: logo com largura de ícone, só o símbolo do
 * produto, ou a inicial com o nome para leitor de tela.
 */
export function MarcaDaBarra({ compacta }: { compacta: boolean }) {
  const { activeOrg } = useAuth();
  const brand = useMarcaDaInstalacao();
  /**
   * O CONSUMIDOR do nome por organização.
   *
   * Sem ele, `settings.branding.app_name` seria campo decorativo: medido, o nome
   * da org não aparece em lugar nenhum da casca para o cliente típico de um
   * revendedor — o único leitor é o `TenantSwitcher`, e ele devolve `null` com
   * uma organização só.
   *
   * A marca da INSTALAÇÃO continua embaixo: a organização que não definiu nome
   * vê exatamente o que via antes. O que mudou é POR ONDE ela chega — era
   * `branding()`, que no navegador lê `window.__PUBLIC_ENV__` e no servidor lê
   * `process.env`, e essas duas fontes passaram a divergir quando o layout raiz
   * começou a injetar a marca do BANCO. Divergência entre SSR e cliente aqui não
   * é detalhe: com logo no banco e `APP_LOGO_URL` vazio, o servidor desenhava o
   * `<span>` de baixo e o cliente desenhava o `<img>` — React #418 em toda tela.
   * Hoje a marca vem por PROP do servidor (`useMarcaDaInstalacao`), pela mesma
   * rota de `activeOrg`, e os dois lados leem o mesmo objeto por construção.
   */
  const nome = activeOrg?.marca?.nome ?? brand.name;
  /**
   * O mesmo desenho para o LOGO — e é este par de linhas que fecha o caminho do
   * `logo_url` gravado até a tela.
   *
   * `||` e não `??`: vazio é AUSÊNCIA de logo, não "logo em branco". É a regra
   * que `resolveBranding` e `primeiroDefinido` já aplicam nas camadas de baixo, e
   * com `??` um `""` vindo de cima apagaria o logo do revendedor em vez de
   * descer para ele — que é o contrário do que a precedência por campo promete.
   */
  const logo = activeOrg?.marca?.logoUrl || brand.logoUrl;
  const logoEscuro =
    activeOrg?.marca?.logoDarkUrl !== undefined
      ? activeOrg.marca.logoDarkUrl
      : activeOrg?.marca?.logoUrl
        ? null
        : brand.logoDarkUrl;
  // Só quando NINGUÉM — nem a instalação, nem a organização — pôs marca própria:
  // é a condição de `lib/branding.ts`, avaliada sobre o que a barra vai mostrar.
  const marcaDoProduto = marcaEhADoProduto({ name: nome, logoUrl: logo ?? null });
  // No trilho o logo tem largura de ícone; proporção livre, porque a arte enviada
  // tem formato desconhecido e forçar as duas medidas a distorceria.
  const medidaDoLogo = compacta
    ? "h-8 w-auto max-w-[3.25rem] object-contain"
    : "h-7 w-auto max-w-[10rem] object-contain";

  if (logo || logoEscuro) {
    return (
      // Sem arte própria para o escuro, preserva a proteção de contraste.
      <div
        className={cn(
          "rounded-md",
          !logoEscuro && "dark:bg-white dark:shadow-sm",
          !logoEscuro && (compacta ? "dark:px-1 dark:py-0.5" : "dark:px-2 dark:py-1"),
        )}
      >
        {/* <img> em vez de next/image de propósito: a URL vem de quem hospeda
          (banco ou .env), e next/image exige allowlist de domínios fechada em
          build — a imagem pré-buildada rejeitaria o domínio do self-hoster.
          Altura fixa e largura livre porque a arte enviada tem proporção
          desconhecida; forçar as duas distorceria o logo de quem configurou. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {logo ? (
          <img src={logo} alt={nome} className={cn(medidaDoLogo, logoEscuro && "dark:hidden")} />
        ) : (
          <span className="dark:hidden">{nome}</span>
        )}
        {logoEscuro ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoEscuro} alt={nome} className={cn("hidden dark:block", medidaDoLogo)} />
        ) : null}
      </div>
    );
  }
  if (marcaDoProduto) {
    // O desenho do produto, inline (ver `components/branding/MarcaDoProduto.tsx`):
    // logotipo com espaço, só o símbolo no trilho.
    return compacta ? (
      <SimboloDoProduto nome={nome} className="h-8 w-8" />
    ) : (
      <LogotipoDoProduto nome={nome} className="h-8 w-auto" />
    );
  }
  if (!compacta) return <span className="font-semibold tracking-tight">{nome}</span>;
  return (
    <>
      <span className="sr-only">{nome}</span>
      <span aria-hidden className="text-lg font-bold text-primary">
        {/* Spread e não `[0]`: nome começando com emoji ou acento composto
            quebraria no meio do code point. Mesma regra de `resolveBranding`
            — a inicial precisa acompanhar o nome que a barra mostra, senão
            recolher o menu troca a marca. */}
        {[...nome][0]?.toUpperCase() ?? brand.initial}
      </span>
    </>
  );
}
