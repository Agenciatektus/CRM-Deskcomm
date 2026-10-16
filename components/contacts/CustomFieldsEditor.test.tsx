/**
 * O CAMPO CONDICIONAL SOME DA TELA E O VALOR GRAVADO FICA (issue #2728).
 *
 * Este é o ponto de renderização EM SI: `CustomFieldsEditor` é o único
 * renderizador de campos personalizados que existe — a ficha do contato
 * (`EditContactDialog`), o painel do CRM na inbox (`CRMSidePanel`), o dossiê e
 * o diálogo de edição de lead (`LeadDossier` → `LeadFieldsForm`) passam todos
 * por ele. Esconder aqui é esconder nos quatro.
 *
 * O que reprova sem o conserto:
 *
 *   1. o import de `@/lib/schemas/mostrar-quando` falha (módulo não existe);
 *   2. sem filtro, `queryByLabelText` acha o campo condicional mesmo com a
 *      condição fora;
 *   3. um filtro que "conserta" limpando o valor — `registro` teria de voltar
 *      sem a chave, e é justamente o contrário: esconder não é limpar.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CustomFieldsEditor, type CustomFieldDef } from "./CustomFieldsEditor";

vi.mock("@/hooks/auth/AuthProvider", () => ({
  useActiveOrg: () => ({ country: "BR" }),
}));
vi.mock("@/hooks/i18n/useT", () => ({
  useT: () => (texto: string) => texto,
}));

afterEach(cleanup);

const CAMPOS: CustomFieldDef[] = [
  { key: "tipo_servico", label: "Tipo de serviço", type: "text" },
  {
    key: "outro_servico",
    label: "Outro serviço (qual?)",
    type: "text",
    mostrar_quando: { campo: "tipo_servico", contem: "Outro" },
  },
];

describe("CustomFieldsEditor — campos com mostrar_quando", () => {
  it("condição não atendida: o campo não aparece e o registro mantém o valor gravado", () => {
    const registro: Record<string, unknown> = {
      tipo_servico: "Limpeza",
      outro_servico: "Piscina",
    };

    render(
      <CustomFieldsEditor
        fields={CAMPOS}
        value={registro}
        onChange={vi.fn()}
        mode="contact"
      />,
    );

    // O campo condicional some da tela…
    expect(screen.queryByLabelText("Outro serviço (qual?)")).toBeNull();
    // …e o que dispara a condição continua lá (controle).
    expect(screen.getByLabelText("Tipo de serviço")).toBeTruthy();

    // Esconder não é limpar: ninguém mexeu no objeto de valores.
    expect(registro).toEqual({ tipo_servico: "Limpeza", outro_servico: "Piscina" });
  });

  it("condição atendida: o campo aparece com o valor que já estava gravado", () => {
    const registro: Record<string, unknown> = {
      tipo_servico: "Outro (especifique)",
      outro_servico: "Piscina",
    };

    render(
      <CustomFieldsEditor
        fields={CAMPOS}
        value={registro}
        onChange={vi.fn()}
        mode="contact"
      />,
    );

    const campo = screen.getByLabelText("Outro serviço (qual?)") as HTMLInputElement;
    expect(campo.value).toBe("Piscina");
    expect(registro).toEqual({
      tipo_servico: "Outro (especifique)",
      outro_servico: "Piscina",
    });
  });

  it("sem condição nenhuma, os campos seguem aparecendo como sempre (controle)", () => {
    render(
      <CustomFieldsEditor
        fields={[{ key: "segmento", label: "Segmento", type: "text" }]}
        value={{}}
        onChange={vi.fn()}
        mode="lead"
      />,
    );
    expect(screen.getByLabelText("Segmento")).toBeTruthy();
  });
});

describe("CustomFieldsEditor — lista pesquisável recusa o que não está na lista (#2521)", () => {
  const DESTINO: CustomFieldDef[] = [
    {
      key: "destino",
      label: "Destino",
      type: "searchable_select",
      options: [{ value: "maceio-al", label: "Maceió (AL)", aliases: ["maceio", "mcz"] }],
    },
  ];

  it("valor fora da lista, sem allow_new: não grava e explica por quê", () => {
    const onChange = vi.fn();
    render(<CustomFieldsEditor mode="lead" fields={DESTINO} value={{}} onChange={onChange} />);

    const input = screen.getByLabelText(/Destino/);
    fireEvent.change(input, { target: { value: "Recife" } });
    fireEvent.blur(input);

    expect(onChange).not.toHaveBeenCalledWith(expect.objectContaining({ destino: "Recife" }));
    expect(screen.getByText("Esse valor não está na lista. Escolha uma das opções.")).toBeTruthy();

    // A próxima digitação limpa o aviso: ele fala do texto recusado, não do novo.
    fireEvent.change(input, { target: { value: "mace" } });
    expect(screen.queryByText("Esse valor não está na lista. Escolha uma das opções.")).toBeNull();
  });
});
