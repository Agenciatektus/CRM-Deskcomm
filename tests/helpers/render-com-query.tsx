import { render as renderSemProvider, type RenderOptions } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement, ReactNode } from "react";

/**
 * `render` com `QueryClientProvider` (cliente novo por chamada, `retry: false`).
 * O popover de filtros lê os filtros salvos via react-query; sem provider o teste
 * cai em "No QueryClient set". O wrapper vale também para `rerender`.
 */
export function render(ui: ReactElement, opts?: Omit<RenderOptions, "wrapper">) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return renderSemProvider(ui, { wrapper, ...opts });
}
