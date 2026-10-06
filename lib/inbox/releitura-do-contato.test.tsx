/**
 * O painel do lead relê o crm-summary quando outra peça da tela (o menu de
 * contexto da lista) avisa que o CRM DESTE contato mudou, e ignora o aviso de
 * outro contato (controle).
 */
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { conversaDeExemplo } from "@/components/inbox/__fixtures__/conversa";
import { useResumoDoContato } from "@/components/inbox/painel/useResumoDoContato";

import { avisarQueOCrmDoContatoMudou } from "./releitura-do-contato";

const get = vi.hoisted(() => vi.fn(async () => ({ data: { leads: [], orders: [], activities: [], demandas: [] } })));
vi.mock("@/lib/api/client", () => ({ apiClient: { get } }));

describe("releitura do painel pelo aviso do menu", () => {
  it("relê no aviso do mesmo contato e ignora o de outro", async () => {
    renderHook(() => useResumoDoContato(conversaDeExemplo.conversation));
    await waitFor(() => expect(get).toHaveBeenCalledTimes(1));

    act(() => avisarQueOCrmDoContatoMudou("outro-contato"));
    await new Promise((r) => setTimeout(r, 20));
    expect(get).toHaveBeenCalledTimes(1);

    act(() => avisarQueOCrmDoContatoMudou("contact-1"));
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
    expect(get).toHaveBeenLastCalledWith("/api/v1/contacts/contact-1/crm-summary");
  });
});
