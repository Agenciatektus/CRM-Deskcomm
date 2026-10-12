/**
 * Acabamento dos controles do DS (PR E, os P2 do Cassio na #170):
 * obrigatório anunciado no campo VISÍVEL, `form.reset()` sincronizado, data
 * digitada, ano a ano, e `min`/`max` limitando o horário do mesmo dia.
 */
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { CampoDeData } from "@/components/ui/campo-de-data";
import { lerDataDigitada, soADataSemHora } from "@/components/ui/digitar-data";
import { Escolha } from "@/components/ui/escolha";
import { escolherValor } from "@/tests/unit/helpers/controles-do-ds";

const formulario = () => screen.getByTestId("form") as HTMLFormElement;

describe("obrigatório vazio aparece no campo que a pessoa vê", () => {
  it("Escolha: aria-invalid, mensagem ligada por aria-describedby e foco no gatilho", async () => {
    render(
      <form data-testid="form">
        <label htmlFor="plano">Plano</label>
        <Escolha id="plano" name="plano" required defaultValue="">
          <option value="a">Anual</option>
        </Escolha>
      </form>,
    );
    act(() => {
      formulario().checkValidity();
    });
    const gatilho = screen.getByRole("combobox", { name: "Plano" });
    expect(gatilho).toHaveAttribute("aria-invalid", "true");
    const alerta = screen.getByRole("alert");
    expect(alerta).toHaveTextContent("Escolha uma opção.");
    expect(gatilho.getAttribute("aria-describedby")).toContain(alerta.id);
    expect(gatilho).toHaveFocus();
    escolherValor(gatilho, "a");
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    expect(gatilho).not.toHaveAttribute("aria-invalid");
  });

  it("CampoDeData: o mesmo, e com dois inválidos o foco fica no PRIMEIRO", () => {
    render(
      <form data-testid="form">
        <CampoDeData aria-label="Início" tipo="date" name="inicio" required defaultValue="" />
        <CampoDeData aria-label="Fim" tipo="date" name="fim" required defaultValue="" />
      </form>,
    );
    act(() => {
      formulario().checkValidity();
    });
    expect(screen.getByRole("button", { name: "Início" })).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("button", { name: "Fim" })).toHaveAttribute("aria-invalid", "true");
    expect(screen.getAllByRole("alert")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Início" })).toHaveFocus();
  });
});

describe("form.reset() sincroniza o visível com o escondido", () => {
  it("Escolha não controlada volta ao defaultValue", async () => {
    render(
      <form data-testid="form">
        <Escolha aria-label="Plano" name="plano" defaultValue="a">
          <option value="a">Anual</option>
          <option value="m">Mensal</option>
        </Escolha>
      </form>,
    );
    const gatilho = screen.getByRole("combobox", { name: "Plano" });
    escolherValor(gatilho, "m");
    expect(gatilho).toHaveTextContent("Mensal");
    act(() => formulario().reset());
    await waitFor(() => expect(gatilho).toHaveTextContent("Anual"));
    expect(new FormData(formulario()).get("plano")).toBe("a");
  });

  it("CampoDeData não controlado volta ao defaultValue", async () => {
    render(
      <form data-testid="form">
        <CampoDeData aria-label="Dia" tipo="date" name="dia" defaultValue="2026-10-12" data-testid="dia" />
      </form>,
    );
    await userEvent.type(screen.getByTestId("dia"), "{selectall}2026-01-05");
    act(() => formulario().reset());
    await waitFor(() => expect(screen.getByRole("button", { name: "Dia" })).toHaveTextContent("12/10/2026"));
  });
});

describe("data distante: digitar e pular de ano", () => {
  it("lê dd/mm/aaaa, sem barras e com horário; recusa ano de 2 dígitos", () => {
    expect(lerDataDigitada("12/10/1985", false)?.getFullYear()).toBe(1985);
    expect(lerDataDigitada("12101985", false)?.getMonth()).toBe(9);
    expect(lerDataDigitada("12/10/1985 14:30", true)?.getHours()).toBe(14);
    expect(lerDataDigitada("1/1/85", false)).toBeNull();
    expect(lerDataDigitada("31/02/1985", false)).toBeNull();
  });

  it("digitar a data de nascimento grava yyyy-MM-dd sem navegar mês a mês", async () => {
    const mudou = vi.fn();
    render(<CampoDeData aria-label="Nascimento" tipo="date" value="" onValorChange={mudou} />);
    await userEvent.click(screen.getByRole("button", { name: "Nascimento" }));
    await userEvent.type(await screen.findByLabelText("Digite a data"), "12/10/1985");
    expect(mudou).toHaveBeenLastCalledWith("1985-10-12");
  });

  it("com passado, o calendário tem ano anterior e próximo ano", async () => {
    render(<CampoDeData aria-label="Nascimento" tipo="date" value="2026-10-12" />);
    await userEvent.click(screen.getByRole("button", { name: "Nascimento" }));
    await userEvent.click(await screen.findByRole("button", { name: "Ano anterior" }));
    expect(screen.getByText(/2025/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Próximo ano" })).toBeInTheDocument();
  });
});

describe("min/max limitam o horário do mesmo dia", () => {
  it("só horário: antes do min e depois do max ficam desligados", async () => {
    render(<CampoDeData aria-label="Abre" tipo="time" value="" min="10:00" max="16:00" />);
    await userEvent.click(screen.getByRole("button", { name: "Abre" }));
    expect(await screen.findByRole("button", { name: "09:00" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "14:00" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "18:00" })).toBeDisabled();
  });

  it("data e hora: no dia do min, horário antes dele fica desligado; digitado avisa", async () => {
    const mudou = vi.fn();
    render(
      <CampoDeData aria-label="Quando" tipo="datetime-local" value="2026-10-12T16:00" min="2026-10-12T15:00" onValorChange={mudou} />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Quando" }));
    expect(await screen.findByRole("button", { name: "14:00" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "16:00" })).toBeEnabled();
    await userEvent.type(screen.getByLabelText("Outro horário"), "0800");
    expect(screen.getByText("Fora do limite permitido.")).toBeInTheDocument();
    expect(mudou).not.toHaveBeenCalled();
  });
});

describe("data e hora digitada pede a hora; passado começa em 1900 (P2 do Cassio na #171)", () => {
  it("no campo de data e hora, só a data não vale (nada de meia-noite escondida)", () => {
    expect(lerDataDigitada("12/10/1985", true)).toBeNull();
    expect(soADataSemHora("12/10/1985")).toBe(true);
    expect(soADataSemHora("12/10/1985 14:30")).toBe(false);
    expect(lerDataDigitada("12/10/1985 14:30", true)?.getHours()).toBe(14);
  });

  it("ano antes de 1900 é recusado; 1900 vale (CONTROLE da borda)", () => {
    expect(lerDataDigitada("31/12/1899", false)).toBeNull();
    expect(lerDataDigitada("01/01/1900", false)?.getFullYear()).toBe(1900);
  });

  it("digitar só a data no data e hora não grava e pede o horário", async () => {
    const mudou = vi.fn();
    render(<CampoDeData aria-label="Lembrar" tipo="datetime-local" value="" onValorChange={mudou} />);
    await userEvent.click(screen.getByRole("button", { name: "Lembrar" }));
    await userEvent.type(await screen.findByLabelText("Digite a data"), "12/10/2026");
    expect(screen.getByText("Digite também o horário (hh:mm).")).toBeInTheDocument();
    expect(mudou).not.toHaveBeenCalled();
    await userEvent.type(screen.getByLabelText("Digite a data"), " 14:30");
    expect(mudou).toHaveBeenLastCalledWith("2026-10-12T14:30");
  });

  it("no calendário, o ano anterior para em 1900", async () => {
    render(<CampoDeData aria-label="Nascimento" tipo="date" value="1900-06-10" />);
    await userEvent.click(screen.getByRole("button", { name: "Nascimento" }));
    expect(await screen.findByRole("button", { name: "Ano anterior" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Próximo ano" })).toBeEnabled();
  });
});

