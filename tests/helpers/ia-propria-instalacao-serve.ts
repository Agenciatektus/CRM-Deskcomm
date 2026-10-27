/**
 * Dublê central do plano com IA própria (migration 9075) para os testes que NÃO
 * são sobre IA própria.
 *
 * O helper real (`lib/cobranca/ia-propria.ts`) consulta
 * `fn_org_pode_usar_ia_da_instalacao` e falha FECHADO: um dublê de banco que não
 * conhece a função faz a chave da instalação ser negada, e o teste passa a medir
 * o plano em vez do que ele mede de verdade. Aqui a resposta é "a instalação
 * serve a org" (o comportamento de sempre, de org sem plano).
 *
 * Uso, uma linha no arquivo de teste:
 *
 *   vi.mock("@/lib/cobranca/ia-propria", async (orig) =>
 *     (await import("@/tests/helpers/ia-propria-instalacao-serve")).instalacaoServeAOrg(await orig()));
 *
 * Teste de IA própria NÃO usa este dublê: dubla `false` explicitamente, e o
 * controle negativo dele tem de falhar quando a trava é desligada.
 */
type ModuloIaPropria = typeof import("@/lib/cobranca/ia-propria");

export function instalacaoServeAOrg(real: ModuloIaPropria): ModuloIaPropria {
  return {
    ...real,
    instalacaoPodeServirIa: async () => true,
    instalacaoPodeServirIaViaRpc: async () => true,
    instalacaoPodeServirIaComMemo: async () => true,
  };
}
