/**
 * A TELA DE CURADORIA — o que ela mostra, o que ela esconde e o que ela avisa.
 *
 * O defeito que estes testes trancam é o medido na instalação em 18/09: o
 * seletor oferecia 8 etiquetas de semente, NENHUMA conversa tinha etiqueta, e a
 * etiqueta que a lista EXIBIA não estava entre as 8. O operador via a palavra na
 * tela e não conseguia fazer nada com ela.
 *
 * Por isso a medida central aqui é a das ÓRFÃS: uma etiqueta que existe em
 * registro e em vocabulário nenhum tem de aparecer, com contagem e com saída.
 * Uma tela que só listasse as canônicas passaria em qualquer outro teste e
 * deixaria o defeito exatamente onde estava.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { Vocabulario } from "@/lib/schemas/tags";
import { VocabularioSection } from "./_vocabulario";

const criarTag = vi.fn(async () => ({ ok: true as const, registros: 0 }));
const arquivarTag = vi.fn(async () => ({ ok: true as const, registros: 0 }));
const renomearTag = vi.fn(async () => ({ ok: true as const, registros: 3 }));
const mesclarTags = vi.fn(async () => ({ ok: true as const, registros: 7 }));
const apagarTag = vi.fn(async () => ({ ok: true as const, registros: 12 }));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));
vi.mock("@/app/actions/settings/curarTags", () => ({
  criarTag: (...a: unknown[]) => criarTag(...(a as [])),
  arquivarTag: (...a: unknown[]) => arquivarTag(...(a as [])),
  renomearTag: (...a: unknown[]) => renomearTag(...(a as [])),
  mesclarTags: (...a: unknown[]) => mesclarTags(...(a as [])),
  apagarTag: (...a: unknown[]) => apagarTag(...(a as [])),
}));

globalThis.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;

/** O estado real medido: canônicas que ninguém usa, e uso que ninguém canonizou. */
const VOCABULARIO: Vocabulario = {
  canonicas: ["dúvida", "troca", "urgente"],
  arquivadas: ["elogio"],
  em_uso: [
    { tag: "importado-whatsapp", n: 1121 },
    { tag: "urgentr", n: 4 },
    { tag: "urgente", n: 2 },
  ],
};

function montar(over: Partial<Parameters<typeof VocabularioSection>[0]> = {}) {
  return render(
    <VocabularioSection
      escopo="conversa"
      vocabulario={VOCABULARIO}
      podeCurar
      clienteReservada={false}
      substantivo={(n) => `${n} ${n === 1 ? "conversa" : "conversas"}`}
      {...over}
    />,
  );
}

beforeEach(() => vi.clearAllMocks());

describe("o que a tela mostra", () => {
  it("lista as etiquetas EM USO que não estão em vocabulário nenhum", () => {
    // O defeito original em uma asserção: `importado-whatsapp` existe em 1121
    // registros e em nenhuma lista. Se a tela só desenhasse as canônicas, o
    // operador continuaria sem ter o que fazer com ela.
    montar();
    const secao = screen.getByRole("heading", { name: /Em uso, fora da lista/i })
      .parentElement as HTMLElement;
    expect(within(secao).getByText("importado-whatsapp")).toBeTruthy();
    expect(within(secao).getByText("urgentr")).toBeTruthy();
    // `urgente` está EM USO e é canônica: não é órfã, e listá-la duas vezes
    // faria o operador achar que são duas palavras diferentes.
    expect(within(secao).queryByText("urgente")).toBeNull();
  });

  it("mostra a contagem ao lado de cada etiqueta, e 'sem uso' quando é zero", () => {
    montar();
    expect(screen.getByText("1121 conversas")).toBeTruthy();
    // `dúvida` é canônica e não aparece em `em_uso`: o número honesto é nenhum.
    expect(screen.getAllByText("sem uso").length).toBeGreaterThan(0);
  });

  it("separa as arquivadas e oferece devolvê-las", async () => {
    montar();
    const botao = screen.getByRole("button", { name: /elogio/ });
    await userEvent.click(botao);
    expect(arquivarTag).toHaveBeenCalledWith("conversa", "elogio", false);
  });
});

describe("o que a tela esconde de quem não é admin", () => {
  it("manager não vê renomear nem apagar, mas vê acrescentar e arquivar", () => {
    // Esconder o que a Server Action recusaria é honestidade, não permissão
    // nova: o gate real está no corpo da função SQL.
    montar({ podeCurar: false });
    expect(screen.queryByRole("button", { name: /Renomear/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Apagar/ })).toBeNull();
    expect(screen.getByRole("button", { name: /Acrescentar/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Arquivar dúvida/ })).toBeTruthy();
  });

  it("manager também não vê a caixa de seleção que inicia uma mescla", () => {
    montar({ podeCurar: false });
    expect(screen.queryByRole("checkbox")).toBeNull();
  });
});

describe("a etiqueta cliente, quando a regra da agenda está ligada", () => {
  it("não oferece renomear nem apagar, e diz que é do sistema", () => {
    // Sem isto a tela desenharia dois botões que o servidor recusa com
    // `tags_etiqueta_do_sistema` — e o operador só descobriria depois de digitar
    // o nome novo e confirmar.
    montar({
      escopo: "contato",
      clienteReservada: true,
      vocabulario: { canonicas: ["cliente", "vip"], arquivadas: [], em_uso: [] },
      substantivo: (n) => `${n} contatos`,
    });
    expect(screen.queryByRole("button", { name: /Renomear cliente/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Apagar cliente/ })).toBeNull();
    expect(screen.getByText(/do sistema/)).toBeTruthy();
    // E a etiqueta vizinha continua editável: a reserva é de uma palavra, não da tela.
    expect(screen.getByRole("button", { name: /Renomear vip/ })).toBeTruthy();
  });

  it("também não deixa selecioná-la para uma MESCLA", async () => {
    // O furo que a primeira versão tinha: renomear e apagar eram escondidos, mas
    // a caixa de seleção não. E `cliente` nasce em `contacts.tags` pela 0262 sem
    // entrar no vocabulário canônico, então ela aparece justamente na lista de
    // órfãs — a única que tem caixa de seleção. A tela oferecia a mescla que o
    // servidor recusa, na etiqueta mais perigosa do produto.
    montar({
      escopo: "contato",
      clienteReservada: true,
      vocabulario: {
        canonicas: [],
        arquivadas: [],
        em_uso: [
          { tag: "cliente", n: 80 },
          { tag: "vip", n: 3 },
        ],
      },
      substantivo: (n) => `${n} contatos`,
    });
    const caixaCliente = screen.getByRole("checkbox", { name: /cliente/ });
    expect((caixaCliente as HTMLInputElement).disabled).toBe(true);
    await userEvent.click(caixaCliente);
    expect((caixaCliente as HTMLInputElement).checked).toBe(false);
    // A vizinha continua selecionável.
    expect((screen.getByRole("checkbox", { name: /vip/ }) as HTMLInputElement).disabled).toBe(
      false,
    );
  });

  it("com a regra desligada, cliente é palavra comum", () => {
    montar({
      escopo: "contato",
      clienteReservada: false,
      vocabulario: { canonicas: ["cliente"], arquivadas: [], em_uso: [] },
      substantivo: (n) => `${n} contatos`,
    });
    expect(screen.getByRole("button", { name: /Renomear cliente/ })).toBeTruthy();
  });
});

describe("apagar mostra o estrago ANTES", () => {
  it("o aviso diz em quantos registros a etiqueta está", async () => {
    montar({
      vocabulario: { canonicas: ["troca"], arquivadas: [], em_uso: [{ tag: "troca", n: 312 }] },
    });
    await userEvent.click(screen.getByRole("button", { name: /Apagar troca/ }));
    // Dentro do DIÁLOGO, e não em qualquer lugar da tela: o mesmo número já
    // aparece no contador da linha, e uma asserção solta passaria mesmo se o
    // aviso de confirmação não citasse número nenhum — que é justamente o que
    // este teste existe para impedir.
    const aviso = screen.getByRole("alertdialog");
    expect(within(aviso).getByText(/312 conversas/)).toBeTruthy();
    // E oferece a saída que preserva o histórico, na mesma frase.
    expect(within(aviso).getByText(/arquive/i)).toBeTruthy();
  });

  it("quando ninguém usa, o aviso diz isso em vez de citar um número", async () => {
    montar({ vocabulario: { canonicas: ["troca"], arquivadas: [], em_uso: [] } });
    await userEvent.click(screen.getByRole("button", { name: /Apagar troca/ }));
    expect(screen.getByText(/Nenhum registro usa essa etiqueta/)).toBeTruthy();
  });

  it("só chama a action depois da confirmação", async () => {
    montar();
    await userEvent.click(screen.getByRole("button", { name: /Apagar troca/ }));
    expect(apagarTag).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: /Apagar mesmo assim/ }));
    expect(apagarTag).toHaveBeenCalledWith("conversa", "troca");
  });
});

describe("mesclar", () => {
  it("a barra só aparece com duas marcadas, e a última é o destino", async () => {
    montar();
    expect(screen.queryByRole("button", { name: /^Mesclar$/ })).toBeNull();
    await userEvent.click(screen.getByRole("checkbox", { name: /urgentr/ }));
    // Uma sozinha não tem para onde ir.
    expect(screen.queryByRole("button", { name: /^Mesclar$/ })).toBeNull();
    await userEvent.click(screen.getByRole("checkbox", { name: /importado-whatsapp/ }));
    await userEvent.click(screen.getByRole("button", { name: /^Mesclar$/ }));
    // O botão ABRE a confirmação; não mescla.
    expect(mesclarTags).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: /^Juntar$/ }));
    expect(mesclarTags).toHaveBeenCalledWith("conversa", ["urgentr"], "importado-whatsapp");
  });

  it("confirma antes, com o número de registros que vai reescrever", async () => {
    // Mesclar é tão irreversível quanto apagar e pega um conjunto potencialmente
    // MAIOR (a união das origens). Sair num clique só ensinava que era a leve.
    montar();
    await userEvent.click(screen.getByRole("checkbox", { name: /urgentr/ }));
    await userEvent.click(screen.getByRole("checkbox", { name: /importado-whatsapp/ }));
    await userEvent.click(screen.getByRole("button", { name: /^Mesclar$/ }));
    const aviso = screen.getByRole("alertdialog");
    expect(within(aviso).getByText(/4 conversas/)).toBeTruthy();
    expect(within(aviso).getByText(/Não dá para desfazer/)).toBeTruthy();
  });
});

describe("promover", () => {
  it("promove a órfã ao vocabulário canônico sem digitar de novo", async () => {
    // É o caminho normal da curadoria: a palavra já existe no banco, escrita por
    // quem atende. Obrigar a redigitá-la convidaria a um erro de digitação que
    // criaria uma terceira variante.
    montar();
    const secao = screen.getByRole("heading", { name: /Em uso, fora da lista/i })
      .parentElement as HTMLElement;
    const linha = within(secao).getByText("urgentr").closest("li") as HTMLElement;
    await userEvent.click(within(linha).getByRole("button", { name: /Promover/ }));
    expect(criarTag).toHaveBeenCalledWith("conversa", "urgentr");
  });
});
