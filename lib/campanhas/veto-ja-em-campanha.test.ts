/**
 * OS VETOS DO ADAPTER — o de "já em campanha" (dois critérios) e o de "este
 * negócio já fechou" (três sinais). Os dois têm a mesma forma de errar: um
 * predicado que parece cobrir e não cobre.
 *
 * O VETO "JÁ EM CAMPANHA" SÃO DOIS CRITÉRIOS, E A PROVA É QUE ELES NÃO SE MISTURAM.
 *
 * Duas voltas erradas nesta fatia vieram de colapsar os dois num predicado só:
 *
 *   • "linha em campanha VIVA" media o PRESENTE e era usado como passado. A
 *     campanha de entrada contínua nunca conclui, então vetava todo contato que
 *     tocasse de qualquer campanha futura, para sempre.
 *   • "elegível nos últimos 30 dias, menos `cancelled`" tentou medir o PASSADO
 *     com o dado do presente: vetava quem está `pending` e nunca recebeu, e
 *     liberava quem recebeu e depois teve a campanha cancelada.
 *
 * O que estes casos prendem é a SEPARAÇÃO: o ramo do passado não pode olhar o
 * estado da campanha, e o ramo do presente não pode olhar `sent_at`. A semântica
 * ("recebeu em campanha cancelada continua vetado") é provada contra Postgres
 * real em `tests/invariants/entrada-continua-contida-9039.test.ts` — aqui se
 * prova que as duas consultas existem e perguntam coisas diferentes.
 */
import { describe, expect, it } from "vitest";

import { createSupabaseEntradaPorEtapaDb } from "./entrada-por-etapa.db";
import { STATUS_TERMINAIS } from "./maquina-de-estados";
import { NA_FILA_DE_DESPACHO } from "./tipos";

interface Consulta {
  colunas: string;
  filtros: Array<[string, string, unknown]>;
}

/** Cliente mínimo que registra o que cada consulta pediu. */
function supabaseFake() {
  const consultas: Consulta[] = [];
  const client = {
    from: () => {
      const atual: Consulta = { colunas: "", filtros: [] };
      const encadeavel: Record<string, unknown> = {};
      encadeavel.select = (colunas: string) => {
        atual.colunas = colunas;
        consultas.push(atual);
        return encadeavel;
      };
      for (const verbo of ["eq", "neq", "gte", "lte", "in", "not", "is"]) {
        encadeavel[verbo] = (coluna: string, a: unknown, b?: unknown) => {
          atual.filtros.push([verbo, coluna, b === undefined ? a : `${String(a)} ${String(b)}`]);
          return encadeavel;
        };
      }
      encadeavel.limit = () => encadeavel;
      encadeavel.maybeSingle = () => Promise.resolve({ data: null, error: null });
      encadeavel.then = (fn: (r: unknown) => unknown) =>
        Promise.resolve({ data: [], error: null }).then(fn);
      return encadeavel;
    },
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { client: client as any, consultas };
}

function colunas(c: Consulta): string[] {
  return c.filtros.map(([, coluna]) => coluna);
}

describe("estaEmOutraCampanha: os dois critérios não se misturam", () => {
  it("faz DUAS consultas, e a primeira é a do passado", async () => {
    const { client, consultas } = supabaseFake();
    await createSupabaseEntradaPorEtapaDb(client).estaEmOutraCampanha("org-1", "c-1", "camp-1");
    expect(consultas).toHaveLength(2);
  });

  it("o ramo do PASSADO filtra `sent_at` e NÃO olha o estado da campanha", async () => {
    // É a correção do segundo erro: cancelar a campanha não desfaz a mensagem
    // que a pessoa leu, então o estado dela não pode entrar neste ramo.
    const { client, consultas } = supabaseFake();
    await createSupabaseEntradaPorEtapaDb(client).estaEmOutraCampanha("org-1", "c-1", "camp-1");
    const passado = consultas[0]!;
    expect(passado.filtros).toContainEqual(["gte", "sent_at", expect.any(String)]);
    expect(colunas(passado)).not.toContain("campaigns.status");
    // E não olha o status do destinatário: quem recebeu está `sent`, mas também
    // pode estar `delivered`, `read` ou `replied` — e `cancelled` depois de
    // enviado também já recebeu.
    expect(colunas(passado)).not.toContain("status");
    expect(passado.colunas).not.toContain("campaigns");
  });

  it("o ramo do PRESENTE olha a fila ativa e o estado da campanha, e NÃO olha `sent_at`", async () => {
    // É a correção do primeiro erro, pelo caminho certo: o estado da campanha
    // importa só para "ainda vai falar?".
    const { client, consultas } = supabaseFake();
    await createSupabaseEntradaPorEtapaDb(client).estaEmOutraCampanha("org-1", "c-1", "camp-1");
    const presente = consultas[1]!;
    expect(presente.filtros).toContainEqual(["in", "status", NA_FILA_DE_DESPACHO]);
    expect(presente.filtros).toContainEqual([
      "not",
      "campaigns.status",
      `in (${STATUS_TERMINAIS.join(",")})`,
    ]);
    expect(colunas(presente)).not.toContain("sent_at");
    // Pelo embed, e não por lista de ids: a lista de campanhas não terminais
    // cresce com o tempo (a contínua nunca conclui) e estoura a URL.
    expect(presente.colunas).toContain("campaigns!inner(status)");
  });

  it("os dois ramos isolam o tenant, o contato e a própria campanha", async () => {
    const { client, consultas } = supabaseFake();
    await createSupabaseEntradaPorEtapaDb(client).estaEmOutraCampanha("org-1", "c-1", "camp-1");
    for (const c of consultas) {
      expect(c.filtros).toContainEqual(["eq", "organization_id", "org-1"]);
      expect(c.filtros).toContainEqual(["eq", "contact_id", "c-1"]);
      // Sem isto, repreparar vetaria o contato por causa da linha que esta
      // mesma campanha gravou na tentativa anterior.
      expect(c.filtros).toContainEqual(["neq", "campaign_id", "camp-1"]);
      // Redundante hoje nos dois ramos, e mantido de propósito: ver o cabeçalho
      // de `entrada-por-etapa.db.ts`.
      expect(c.filtros).toContainEqual(["eq", "eligibility_status", "eligible"]);
    }
  });
});

/**
 * `carregaNegocio` compõe TRÊS sinais num OU, e cada um existe por um motivo
 * diferente. O teste da decisão (`entrada-por-etapa.test.ts`) recebe
 * `jaFoiFechado` já resolvido, então a composição só se prova aqui.
 */
describe("carregaNegocio: os três sinais de \"já foi fechado\"", () => {
  const LEAD = { contact_id: "c-1", status: "open" } as const;

  async function jaFoiFechado(extra: Record<string, unknown>): Promise<boolean> {
    const client = {
      from: () => {
        const e: Record<string, unknown> = {};
        for (const m of ["select", "eq"]) e[m] = () => e;
        e.maybeSingle = () =>
          Promise.resolve({
            data: {
              ...LEAD,
              fechado_alguma_vez_em: null,
              lost_reason: null,
              retomado_de_lead_id: null,
              ...extra,
            },
            error: null,
          });
        return e;
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;
    const r = await createSupabaseEntradaPorEtapaDb(client).carregaNegocio("org-1", "lead-1");
    return r!.jaFoiFechado;
  }

  it("negócio sem sinal nenhum: pode ser abordado", () => {
    // O controle positivo: sem ele um `jaFoiFechado` que devolvesse sempre
    // `true` passaria nos três casos abaixo e vetaria a base inteira.
    return expect(jaFoiFechado({})).resolves.toBe(false);
  });

  it("`fechado_alguma_vez_em` veta — o funil `mesmo_registro` (9040)", () => {
    return expect(jaFoiFechado({ fechado_alguma_vez_em: "2026-03-01T00:00:00Z" })).resolves.toBe(
      true,
    );
  });

  it("`lost_reason` veta — a PERDA histórica, que nenhum backfill alcança", () => {
    // Ele sobrevive à reabertura desde sempre (o CHECK só o exige com
    // `status='lost'` e nenhum caminho o limpa).
    return expect(jaFoiFechado({ lost_reason: "price" })).resolves.toBe(true);
  });

  it("`lost_reason` em BRANCO não veta", () => {
    // `''` e `'   '` existem em dado legado; um teste de `!== null` os trataria
    // como perda e vetaria prospect legítimo.
    return expect(jaFoiFechado({ lost_reason: "   " })).resolves.toBe(false);
  });

  it("`retomado_de_lead_id` veta — o funil `novo_negocio`, que era PERMANENTE", () => {
    // Num funil `settings.reabertura = 'novo_negocio'` nada reabre: nasce um card
    // NOVO apontando para o encerrado, e `CAMPOS_COPIAVEIS_NA_RETOMADA` não copia
    // `lost_reason` nem a coluna da 9040. Sem este sinal, o cliente que comprou
    // em março e foi retomado em outubro receberia a copy de primeiro contato —
    // e não como lacuna histórica, mas para sempre.
    return expect(jaFoiFechado({ retomado_de_lead_id: "lead-antigo" })).resolves.toBe(true);
  });

  it("o negócio ABERTO continua sendo reportado como aberto", () => {
    // `aberto` e `jaFoiFechado` são perguntas diferentes, e o caso perigoso é
    // justamente o negócio ABERTO que já fechou antes.
    const client = {
      from: () => {
        const e: Record<string, unknown> = {};
        for (const m of ["select", "eq"]) e[m] = () => e;
        e.maybeSingle = () =>
          Promise.resolve({
            data: {
              ...LEAD,
              fechado_alguma_vez_em: "2026-03-01T00:00:00Z",
              lost_reason: null,
              retomado_de_lead_id: null,
            },
            error: null,
          });
        return e;
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;
    return expect(
      createSupabaseEntradaPorEtapaDb(client).carregaNegocio("org-1", "lead-1"),
    ).resolves.toEqual({ contactId: "c-1", aberto: true, jaFoiFechado: true });
  });
});

describe("as duas listas são DERIVADAS, não digitadas", () => {
  it("terminais são completed e cancelled — e `failed` NÃO é terminal", () => {
    // É a distinção que uma lista escrita à mão erra: `failed` volta a rascunho
    // para conserto, então uma campanha `failed` AINDA VAI falar. Tratá-la como
    // terminal liberaria para outra campanha quem está na fila dela.
    expect([...STATUS_TERMINAIS].sort()).toEqual(["cancelled", "completed"]);
    expect(STATUS_TERMINAIS).not.toContain("failed");
  });

  it("a fila ativa é pending, queued e sending", () => {
    expect([...NA_FILA_DE_DESPACHO].sort()).toEqual(["pending", "queued", "sending"]);
    // `sent` fica FORA: quem já recebeu é assunto do ramo do passado, e contá-lo
    // aqui faria o veto depender do estado da campanha para um fato que não
    // depende dele.
    expect(NA_FILA_DE_DESPACHO).not.toContain("sent");
  });
});
