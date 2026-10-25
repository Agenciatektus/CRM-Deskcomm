import { CTA, NAV } from "@/lib/conteudo";

import { BotaoPrimario } from "./Botao";
import { Logotipo } from "./Marca";

export function Cabecalho() {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-bg/90 backdrop-blur-sm">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-2 px-4 sm:gap-4 sm:px-5">
        <a href="/" aria-label="Verdash CRM, início" className="rounded-controle no-underline">
          <Logotipo />
        </a>
        <nav aria-label="Principal" className="hidden items-center gap-7 lg:flex">
          {NAV.map((n) => (
            <a
              key={n.href}
              href={n.href}
              className="inline-flex min-h-11 items-center text-[0.95rem] text-text-muted no-underline hover:text-text"
            >
              {n.rotulo}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <a
            href="/login"
            className="rounded-grande hover:text-link inline-flex min-h-11 items-center px-2 text-[0.95rem] font-semibold text-text no-underline sm:border sm:border-border-strong sm:px-4 sm:hover:border-text-subtle sm:hover:text-text"
          >
            Entrar
          </a>
          <BotaoPrimario href={CTA.comprar.href} externo compacto>
            <span className="sm:hidden">Quero o CRM</span>
            <span className="hidden sm:inline">Quero o Verdash CRM</span>
          </BotaoPrimario>
        </div>
      </div>
    </header>
  );
}
