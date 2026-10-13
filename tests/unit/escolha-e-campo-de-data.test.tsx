/**
 * Os controles do DS que substituem os nativos (PR D, regra 6 do quadro):
 * `Escolha` no lugar do `<select>` e `CampoDeData` no lugar do campo de
 * data/hora. O que importa é a TROCA SEM PERDA: mesmo valor em texto, mesmo
 * `name` no formulário, rótulo ligado ao controle visível.
 */
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { CampoDeData, escreverValorDoCampo, lerValorDoCampo } from "@/components/ui/campo-de-data";
import { Escolha } from "@/components/ui/escolha";

describe("Escolha (no lugar do <select>)", () => {
  function Formulario({ onValueChange }: { onValueChange?: (v: string) => void }) {
    return (
      <form data-testid="form">
        <label htmlFor="resp">Responsável</label>
        <Escolha id="resp" name="responsavel" defaultValue="" onValueChange={onValueChange} data-testid="resp">
          <option value="">Todos</option>
          <option value="ana">Ana Lima</option>
          <optgroup label="Equipe">
            <option value="bruno">Bruno Reis</option>
          </optgroup>
        </Escolha>
      </form>
    );
  }

  it("o rótulo nomeia o gatilho, e a opção vazia aparece com o texto dela", () => {
    render(<Formulario />);
    expect(screen.getByRole("combobox", { name: "Responsável" })).toHaveTextContent("Todos");
  });

  it("escolher pelo gatilho devolve o valor e vai para o FormData pelo name", async () => {
    const mudou = vi.fn();
    render(<Formulario onValueChange={mudou} />);
    await userEvent.click(screen.getByRole("combobox", { name: "Responsável" }));
    await userEvent.click(await screen.findByRole("option", { name: "Bruno Reis" }));
    expect(mudou).toHaveBeenCalledWith("bruno");
    const dados = new FormData(screen.getByTestId("form") as HTMLFormElement);
    expect(dados.get("responsavel")).toBe("bruno");
  });

  it("voltar para a opção vazia devolve \"\" (não o valor interno)", async () => {
    const mudou = vi.fn();
    render(<Formulario onValueChange={mudou} />);
    await userEvent.click(screen.getByRole("combobox", { name: "Responsável" }));
    await userEvent.click(await screen.findByRole("option", { name: "Ana Lima" }));
    await userEvent.click(screen.getByRole("combobox", { name: "Responsável" }));
    await userEvent.click(await screen.findByRole("option", { name: "Todos" }));
    expect(mudou).toHaveBeenLastCalledWith("");
  });

  it("o select escondido repassa a mudança (preenchimento automático) e fica fora do Tab", async () => {
    const mudou = vi.fn();
    render(<Formulario onValueChange={mudou} />);
    const escondido = screen.getByTestId("resp");
    expect(escondido).toHaveAttribute("tabindex", "-1");
    expect(escondido).toHaveAttribute("aria-hidden");
    await userEvent.selectOptions(escondido, "ana");
    expect(mudou).toHaveBeenCalledWith("ana");
    expect(screen.getByRole("combobox", { name: "Responsável" })).toHaveTextContent("Ana Lima");
  });

  it("required continua valendo no formulário pelo select escondido", () => {
    render(
      <form data-testid="f2">
        <Escolha aria-label="Plano" name="plano" required value="" onValueChange={() => undefined}>
          <option value="a">A</option>
        </Escolha>
      </form>,
    );
    expect((screen.getByTestId("f2") as HTMLFormElement).checkValidity()).toBe(false);
  });
});

describe("CampoDeData (no lugar do campo nativo de data/hora)", () => {
  it("lê e escreve o mesmo texto do campo nativo", () => {
    const d = lerValorDoCampo("datetime-local", "2026-10-12T14:30");
    expect(d?.getHours()).toBe(14);
    expect(escreverValorDoCampo("datetime-local", d)).toBe("2026-10-12T14:30");
    expect(escreverValorDoCampo("date", lerValorDoCampo("date", "2026-01-31"))).toBe("2026-01-31");
    expect(escreverValorDoCampo("time", lerValorDoCampo("time", "09:05:00"))).toBe("09:05");
    expect(lerValorDoCampo("date", "lixo")).toBeNull();
    expect(escreverValorDoCampo("date", null)).toBe("");
  });

  it("escolher o dia no calendário devolve yyyy-MM-dd, fecha e vai para o FormData", async () => {
    const mudou = vi.fn();
    render(
      <form data-testid="form">
        <label htmlFor="venc">Vencimento</label>
        <CampoDeData id="venc" tipo="date" name="vencimento" defaultValue="2026-10-12" onValorChange={mudou} />
      </form>,
    );
    const gatilho = screen.getByRole("button", { name: "Vencimento" });
    expect(gatilho).toHaveTextContent("12/10/2026");
    await userEvent.click(gatilho);
    const grupo = await screen.findByRole("group");
    const dia20 = within(grupo).getAllByRole("button").find((b) => b.textContent === "20" && !b.className.includes("text-text-subtle"));
    await userEvent.click(dia20!);
    expect(mudou).toHaveBeenCalledWith("2026-10-20");
    await waitFor(() => expect(screen.queryByRole("group")).toBeNull());
    expect(new FormData(screen.getByTestId("form") as HTMLFormElement).get("vencimento")).toBe("2026-10-20");
  });

  it("horário: o chip escolhe HH:mm", async () => {
    const mudou = vi.fn();
    render(<CampoDeData aria-label="Abre às" tipo="time" value="" onValorChange={mudou} />);
    await userEvent.click(screen.getByRole("button", { name: "Abre às" }));
    await userEvent.click(await screen.findByRole("button", { name: "14:00" }));
    expect(mudou).toHaveBeenCalledWith("14:00");
  });

  it("Limpar apaga o valor quando o campo não é obrigatório", async () => {
    const mudou = vi.fn();
    render(<CampoDeData aria-label="De" tipo="date" value="2026-10-12" onValorChange={mudou} />);
    await userEvent.click(screen.getByRole("button", { name: "Limpar" }));
    expect(mudou).toHaveBeenCalledWith("");
  });

  it("o input escondido leva o data-testid e repassa o que for digitado nele", async () => {
    const mudou = vi.fn();
    render(<CampoDeData aria-label="Até" tipo="date" value="" onValorChange={mudou} data-testid="ate" />);
    await userEvent.type(screen.getByTestId("ate"), "2");
    expect(mudou).toHaveBeenCalledWith("2");
  });
});
