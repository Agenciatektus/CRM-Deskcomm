"use client";
import { Button } from "@/components/ui/button";
import { useT } from "@/hooks/i18n/useT";
import { MagnifyingGlass, X } from "@/lib/ui/icons";

/**
 * O campo da busca dentro da conversa (#1793), logo abaixo do cabeçalho.
 * Filtra só as mensagens já carregadas; Esc e o X fecham e devolvem o foco a
 * quem abriu (quem decide para onde é o `fecharBusca` do layout).
 */
export function CampoDeBuscaNaConversa({
  termo,
  onTermo,
  onFechar,
}: {
  termo: string;
  onTermo: (termo: string) => void;
  onFechar: () => void;
}) {
  const t = useT();
  return (
    <div className="flex items-center gap-2 border-b border-border px-4 py-1.5">
      <MagnifyingGlass size={16} className="shrink-0 text-muted-foreground" aria-hidden />
      <input
        type="search"
        autoFocus
        className="min-w-0 flex-1 bg-transparent py-1 text-sm outline-hidden placeholder:text-muted-foreground"
        aria-label={t("Buscar nas mensagens carregadas")}
        placeholder={t("Buscar nas mensagens carregadas")}
        value={termo}
        onChange={(e) => onTermo(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") onFechar();
        }}
      />
      <Button
        variant="ghost"
        size="sm"
        className="w-11 shrink-0 px-0 lg:w-8"
        aria-label={t("Fechar busca")}
        onClick={onFechar}
      >
        <X size={16} aria-hidden />
      </Button>
    </div>
  );
}
