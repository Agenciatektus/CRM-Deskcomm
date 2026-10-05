/**
 * TODA AÇÃO DE AUTOMAÇÃO QUE MANDA MENSAGEM DECLARA `falaComOCliente`.
 *
 * ═══ Por que esta cerca existe ═══
 *
 * Criação de card em LOTE (importar planilha, iniciar campanha com passos)
 * emite um `lead.created` por linha — centenas. O motor de regras
 * (`lib/automation/engine.ts`) pula, nesse caso, só as ações que FALAM com o
 * cliente, e quem diz que fala é a própria ação, pela flag.
 *
 * O modo de falhar de uma flag esquecida é o pior que existe nesta parte do
 * produto: ninguém vê erro, ninguém vê log, o motor simplesmente MANDA — 500
 * mensagens de uma regra, no mesmo minuto em que a campanha falou com as mesmas
 * 500 pessoas. Uma ação nova que mande mensagem e não se declare passaria por
 * review sem nada vermelho.
 *
 * ═══ Como ela mede ═══
 *
 * Pelo IMPORT, não pela intenção: um arquivo de ação que importa
 * `sendMessageHandler` (envio direto) ou `enrollFollowupFlow` (inscrição num
 * fluxo que manda) está no caminho de falar com o cliente. É a mesma evidência
 * que levantou a lista na revisão: exatamente três dos nove arquivos importam
 * um dos dois, e são exatamente os três que o parecer apontou.
 *
 * Cerca estrutural: lê o repositório, não roda o motor.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const DIR = join(process.cwd(), "lib", "automation", "actions");

/** Os caminhos pelos quais uma ação alcança o cliente. */
const IMPORTS_QUE_FALAM = ["sendMessageHandler", "enrollFollowupFlow"];

function arquivosDeAcao(): string[] {
  return readdirSync(DIR).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts") && f !== "index.ts");
}

describe("ação de automação que fala com o cliente se declara", () => {
  it("quem importa um caminho de envio tem `falaComOCliente: true`", () => {
    const faltando: string[] = [];
    for (const arquivo of arquivosDeAcao()) {
      const fonte = readFileSync(join(DIR, arquivo), "utf-8");
      const fala = IMPORTS_QUE_FALAM.some((nome) =>
        new RegExp(`import\\s*\\{[^}]*\\b${nome}\\b[^}]*\\}`).test(fonte),
      );
      if (!fala) continue;
      if (!/falaComOCliente:\s*true/.test(fonte)) faltando.push(arquivo);
    }
    expect(
      faltando,
      "Ação de automação que importa um caminho de envio (sendMessageHandler / enrollFollowupFlow) " +
        "e NÃO declara `falaComOCliente: true` no `registerAction`. Sem a flag, o motor a executa " +
        "em criação de card em lote (planilha, campanha com passos): uma mensagem por card, " +
        "centenas no mesmo minuto, sem erro e sem log. Declare a flag ou explique aqui por que " +
        "esta ação não alcança o cliente.",
    ).toEqual([]);
  });

  it("as três ações que falam hoje continuam declaradas (controle negativo da regex)", () => {
    // Sem este caso, a regex do teste acima podendo parar de casar deixaria a
    // cerca VERDE medindo zero arquivos — o instrumento que não mede dá verde.
    const declaradas = arquivosDeAcao().filter((arquivo) =>
      /falaComOCliente:\s*true/.test(readFileSync(join(DIR, arquivo), "utf-8")),
    );
    expect(declaradas.sort()).toEqual(
      ["send-ai-message.ts", "send-whatsapp.ts", "start-message-flow.ts"].sort(),
    );
  });
});
