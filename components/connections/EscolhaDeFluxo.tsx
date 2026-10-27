"use client";
import type { ComponentType, KeyboardEvent, ReactNode } from "react";
import { useRouter } from "next/navigation";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useT } from "@/hooks/i18n/useT";
import { CaretRight, InstagramLogo, Lock, Phone, WhatsappLogo } from "@/lib/ui/icons";
import { cn } from "@/lib/utils";

type Icone = ComponentType<{ size?: number; className?: string; "aria-hidden"?: boolean }>;

type LinhaProps = {
  titulo: string;
  ajuda: string;
  pista?: string;
  Icone: Icone;
  onClick: () => void;
  destaque?: boolean;
  selo?: ReactNode;
  secundaria?: boolean;
  indisponivel?: boolean;
};

function Linha({ titulo, ajuda, pista, Icone, onClick, destaque, selo, secundaria, indisponivel }: LinhaProps) {
  return (
    <button
      type="button"
      data-linha
      // aria-disabled (e não disabled): continua focável e o leitor de tela lê o motivo.
      aria-disabled={indisponivel || undefined}
      onClick={indisponivel ? undefined : onClick}
      className={cn(
        "group flex min-h-16 w-full items-center gap-3.5 rounded-xl border border-transparent p-3 text-left transition-[background-color,border-color,transform] duration-150 sm:min-h-0",
        "hover:border-border-strong hover:bg-hover active:translate-y-px active:border-accent active:bg-accent-soft",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        destaque && "border-border bg-surface-elevated",
        secundaria && "py-2.5 hover:border-transparent hover:bg-transparent active:bg-transparent",
        indisponivel &&
          "cursor-not-allowed border-dashed border-border-strong bg-surface hover:bg-surface active:translate-y-0 active:border-border-strong active:bg-surface",
      )}
    >
      <span
        className={cn(
          "grid size-10 flex-none place-items-center rounded-xl border border-border bg-surface-elevated text-text-muted",
          destaque && "border-transparent bg-accent-soft text-accent-text",
          secundaria && "border-dashed border-border-strong bg-transparent",
          indisponivel && "text-text-subtle",
        )}
      >
        <Icone size={22} aria-hidden />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span
          className={cn(
            "flex flex-wrap items-center gap-2 text-[15px] font-bold leading-tight text-text",
            secundaria && "text-sm font-semibold text-accent-text group-hover:underline group-hover:underline-offset-4",
            indisponivel && "text-text-muted",
          )}
        >
          {titulo}
          {selo}
        </span>
        <span className={cn("text-[13.5px] text-text-muted", indisponivel && "text-text-subtle")}>{ajuda}</span>
        {pista && <span className="mt-0.5 text-xs font-semibold text-text-subtle">{pista}</span>}
      </span>
      {!secundaria && (
        <CaretRight
          size={18}
          aria-hidden
          className={cn(
            "flex-none text-text-subtle transition-transform duration-150 group-hover:translate-x-[3px] group-hover:text-accent-text",
            indisponivel && "invisible",
          )}
        />
      )}
    </button>
  );
}

function Grupo({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div role="group" aria-label={rotulo} className="flex flex-col gap-1">
      <p aria-hidden className="m-0 px-3 pb-1 pt-3.5 text-xs font-bold uppercase tracking-wider text-text-subtle">
        {rotulo}
      </p>
      {children}
    </div>
  );
}

/**
 * "Conectar": o que a pessoa quer ligar. WhatsApp abre o assistente unico (nome, método,
 * conexão); Instagram, voz e telefone levam à tela que já existia. Desenho aprovado: direção B
 * (lista agrupada); no celular vira bottom sheet com alvos de 64 px.
 *
 * `instagramIndisponivel`: texto do motivo. Quando vem, a linha do Instagram fica tracejada,
 * com cadeado, e não navega (continua focável). Sem a prop, nada muda. O texto deve vir JÁ
 * traduzido por quem chama; o componente não aplica t() nele.
 */
export function EscolhaDeFluxo({
  onWhatsapp,
  onFechar,
  instagramIndisponivel,
}: {
  onWhatsapp: () => void;
  onFechar: () => void;
  instagramIndisponivel?: string;
}) {
  const t = useT();
  const router = useRouter();
  const ir = (aba: string) => {
    onFechar();
    router.push(`/app/connections?aba=${aba}`);
  };
  // Setas sobem e descem entre as linhas (Tab também percorre).
  const setas = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    const linhas = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>("button[data-linha]"));
    const i = linhas.indexOf(document.activeElement as HTMLButtonElement);
    if (i < 0) return;
    e.preventDefault();
    linhas[(i + (e.key === "ArrowDown" ? 1 : -1) + linhas.length) % linhas.length]?.focus();
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onFechar()}>
      <DialogContent
        className={cn(
          "max-w-[480px] gap-0 p-0 sm:rounded-2xl",
          // Celular: bottom sheet colado embaixo.
          "max-sm:bottom-0 max-sm:left-0 max-sm:top-auto max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-t-(--mb-folha-raio) max-sm:data-[state=open]:animate-folha-sobe max-sm:motion-reduce:animate-none",
        )}
      >
        <span aria-hidden className="mx-auto mt-2 hidden h-(--mb-pegador-altura) w-(--mb-pegador-largura) rounded-full bg-border-strong max-sm:block" />
        <DialogHeader className="px-6 pb-1 pr-14 pt-6">
          <DialogTitle>{t("O que você quer conectar?")}</DialogTitle>
          <DialogDescription>{t("Cada canal tem o seu passo a passo. Dá para conectar mais de um.")}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-1 px-3 pb-4 pt-1 max-sm:pb-[calc(10px+var(--mb-area-baixo))]" onKeyDown={setas}>
          <Grupo rotulo={t("Mensagens")}>
            <Linha
              destaque
              titulo="WhatsApp"
              selo={
                <span className="inline-flex h-[22px] items-center rounded-md bg-accent-soft px-2 text-xs font-semibold text-text">
                  {t("Mais usado")}
                </span>
              }
              ajuda={t("O número que atende seus clientes.")}
              pista={t("Abre o passo a passo")}
              Icone={WhatsappLogo}
              onClick={() => {
                onFechar();
                onWhatsapp();
              }}
            />
            <Linha
              titulo="Instagram"
              ajuda={instagramIndisponivel ? t("Ainda não liberado nesta conta.") : t("Mensagens do Direct na aba Conversas.")}
              pista={instagramIndisponivel ?? t("Pede o login da Meta")}
              selo={
                instagramIndisponivel ? (
                  <span className="inline-flex h-[22px] items-center gap-1 rounded-md border border-border bg-surface-elevated px-2 text-xs font-semibold text-text-muted">
                    <Lock size={13} aria-hidden />
                    {t("Indisponível")}
                  </span>
                ) : undefined
              }
              Icone={InstagramLogo}
              indisponivel={!!instagramIndisponivel}
              onClick={() => ir("instagram")}
            />
          </Grupo>
          <Grupo rotulo={t("Voz")}>
            <Linha
              titulo={t("Ligação telefônica")}
              ajuda={t("Chamadas de voz e linha de telefone.")}
              pista={t("Abre voz e telefonia")}
              Icone={Phone}
              onClick={() => ir("voz")}
            />
            <Linha
              secundaria
              titulo={t("Cadastrar número de telefone (DID)")}
              ajuda={t("Para receber e fazer ligações por um número próprio.")}
              Icone={Phone}
              onClick={() => ir("telefonia")}
            />
          </Grupo>
        </div>
      </DialogContent>
    </Dialog>
  );
}
