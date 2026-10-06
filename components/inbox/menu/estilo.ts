/**
 * As classes do menu de contexto da conversa (`ctxm`, `mi` e `ctx-sub` do
 * protótipo do visual v2), num lugar só para o menu e os submenus não
 * divergirem.
 *
 * A altura máxima vem da variável que o Radix calcula a partir do espaço que
 * sobra na janela: menu ou submenu maior que a tela ganha rolagem própria em
 * vez de ser cortado pela borda.
 */
export const CLASSE_DO_MENU =
  "w-[272px] max-h-[var(--radix-dropdown-menu-content-available-height)] overflow-y-auto overscroll-contain rounded-[14px] border-border bg-surface p-1.5 shadow-lg";

export const CLASSE_DO_SUBMENU =
  "w-[236px] max-h-[var(--radix-dropdown-menu-content-available-height)] overflow-y-auto overscroll-contain rounded-xl border-border bg-surface p-1.5 shadow-lg";

export const CLASSE_DO_ITEM =
  "h-[34px] gap-2.5 rounded-lg px-2 text-[13.5px] text-text focus:bg-surface-elevated focus:text-text data-[state=open]:bg-surface-elevated [&>svg]:text-text-muted";

/** O item que muda o atendimento de mãos: o primeiro e em negrito. */
export const CLASSE_DO_PRINCIPAL = "font-bold [&>svg]:text-accent";

/** Texto secundário à direita do item (contagem, papel, etapa atual). */
export const CLASSE_DO_DETALHE = "ml-auto truncate pl-2 text-xs text-text-subtle";

export const CLASSE_DO_TITULO = "px-2 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-text-subtle";
