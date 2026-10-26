import type { ReactNode } from "react";

/**
 * Moldura de navegador em volta de uma tela do app. A barra mostra o endereço do próprio
 * sistema; o conteúdo é HTML (não imagem), então fica nítido em qualquer densidade de tela,
 * é indexável e pode se mover.
 */
export function Janela({
  rota,
  children,
  className = "",
  semBarra = false,
  interativa = false,
}: {
  rota: string;
  children: ReactNode;
  className?: string;
  semBarra?: boolean;
  /** Tela com controles de verdade (abas): fica navegável, sem `role=img` nem `aria-hidden`. */
  interativa?: boolean;
}) {
  return (
    <div
      className={`janela-app borda-luz overflow-hidden rounded-modal bg-[#0f1013] ${className}`}
      role={interativa ? "group" : "img"}
      aria-label={`Tela do Verdash CRM: ${rota}.`}
    >
      {semBarra ? null : (
        <div className="flex h-9 items-center gap-3 border-b border-border bg-[#14161a] px-3.5" aria-hidden="true">
          <span className="flex gap-1.5">
            <i className="size-2.5 rounded-full bg-[#ff5f57]/80" />
            <i className="size-2.5 rounded-full bg-[#febc2e]/80" />
            <i className="size-2.5 rounded-full bg-[#28c840]/80" />
          </span>
          <span className="mx-auto flex h-6 min-w-0 max-w-[26rem] flex-1 items-center justify-center truncate rounded-card bg-bg px-3 font-mono text-[0.68rem] text-text-subtle">
            crm.verdash.com.br/app/{rota}
          </span>
          <span className="w-12" />
        </div>
      )}
      <div aria-hidden={interativa ? undefined : "true"}>{children}</div>
    </div>
  );
}
