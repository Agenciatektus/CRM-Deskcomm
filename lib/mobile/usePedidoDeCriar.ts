"use client";
import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * O FAB "+" do celular chega na tela com `?criar=1` (ver `acaoDeCriar`): a tela abre
 * a criação dela e o parâmetro sai da URL, para voltar ou recarregar não abrir de novo.
 * `habilitado: false` (quem não pode criar) só limpa o parâmetro.
 */
export function usePedidoDeCriar(abrir: () => void, habilitado = true): void {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const pedido = searchParams?.get("criar") === "1";

  useEffect(() => {
    if (!pedido) return;
    if (habilitado) abrir();
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    params.delete("criar");
    const query = params.toString();
    window.history.replaceState(null, "", query ? `${pathname}?${query}` : pathname);
    // `abrir` muda a cada render nas telas; o gatilho é só o parâmetro.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pedido]);
}
