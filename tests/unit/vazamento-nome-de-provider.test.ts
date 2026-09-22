/**
 * O nome do provider de canal não pode chegar ao cliente — e isso não estava vigiado.
 *
 * Medido por sabotagem: zerando `PROVIDERES_DE_CANAL` no detector, os 143 testes de
 * vazamento continuavam VERDES. A cobertura existia no código e não existia em teste
 * nenhum, então qualquer refactor podia removê-la sem sintoma no CI.
 *
 * ⚠️ A primeira versão deste comentário dizia que a guarda era "improibível de escrever",
 * porque `lint-channels` reprovaria o nome do provider dentro de um teste. **Falso, e medido:**
 * o literal num arquivo sob `tests/` passa (exit 0); o mesmo literal em `lib/` reprova
 * (exit 1) — `ROOTS` é `["app","lib","components","workers"]` e nunca incluiu `tests/`.
 * A causa real da ausência é a chata: ninguém escreveu o teste. Fica registrado porque a
 * explicação elegante sobreviveu cercada de medição de verdade (sabotagem, controle
 * positivo, exit codes) — que é exatamente quando ninguém a checa.
 *
 * O teste DERIVA os nomes de `CHANNEL_CAPABILITIES` mesmo assim, por um motivo que se
 * sustenta sozinho: provider novo entra na cobertura sem ninguém lembrar de vir aqui.
 *
 * Derivar da mesma fonte não torna isto tautológico: o que se guarda é a propriedade
 * "todo provider conhecido é barrado". Se alguém esvaziar ou desligar a lista lá dentro,
 * este teste continua sabendo quais deveriam ser — e reprova.
 */
import { describe, expect, it } from "vitest";

import { detectarVazamentoInterno } from "@/lib/agent-engine/guardrails/vazamento-interno";
import {
  PROVIDERS_DE_MARCA_PUBLICA,
  PROVIDERS_DE_NOME_INTERNO,
} from "@/lib/channels/capabilities";

/**
 * A lista deixou de ser `Object.keys(CHANNEL_CAPABILITIES)` — é ela MENOS os providers
 * cujo nome é marca que o cliente pronuncia. Enquanto todo provider se chamava `waha` ou
 * `meta_cloud`, "nome de provider" e "palavra que o cliente não deve ver" eram a mesma
 * coisa, e derivar da matriz inteira estava certo. O primeiro provider com nome de marca
 * separou as duas: barrá-lo impediria o agente de dizer o nome do canal por onde o
 * cliente acabou de escrever.
 *
 * O caso novo no fim do arquivo é o outro lado desta moeda, e é ele que impede a exceção
 * de virar porta larga: marca pública tem de passar, e o vocabulário interno que
 * costuma vir junto continua sendo barrado.
 */
const PROVIDERS = PROVIDERS_DE_NOME_INTERNO;

describe("nome de provider de canal é vazamento", () => {
  /**
   * Guarda de vacuidade. Sem ela, um `CHANNEL_CAPABILITIES` vazio faria o `it.each`
   * abaixo rodar zero caso e o arquivo passar sem ter medido nada — o mesmo verde
   * silencioso que a sabotagem expôs, só que um andar acima.
   */
  it("a fonte derivada não está vazia (senão o resto deste arquivo é vácuo)", () => {
    expect(PROVIDERS.length).toBeGreaterThanOrEqual(2);
  });

  it.each(PROVIDERS)("barra o nome do provider: %s", (p) => {
    const r = detectarVazamentoInterno(`Não consegui enviar pelo ${p}, tente de novo.`);
    expect(r.achou, `o nome do provider chegou ao cliente`).toBe(true);
    expect(r.categorias).toContain("arquitetura");
  });

  it("a exceção de marca pública não está vazia nem cobre tudo", () => {
    // Se alguém puser todo provider na exceção, o `it.each` acima vira vácuo e este
    // arquivo volta a ser o verde silencioso que a sabotagem expôs.
    expect(PROVIDERS_DE_MARCA_PUBLICA.length).toBeGreaterThanOrEqual(1);
    expect(PROVIDERS.length).toBeGreaterThanOrEqual(2);
  });

  it.each([...PROVIDERS_DE_MARCA_PUBLICA])("deixa passar a marca que o cliente diz: %s", (p) => {
    for (const frase of [
      `Vi sua mensagem no ${p}, obrigado por escrever!`,
      `Me chama no ${p} que eu te respondo por lá.`,
    ]) {
      const r = detectarVazamentoInterno(frase);
      expect(r.achou, `barrado por ${r.categorias.join(",")}: ${r.termos.join(", ")}`).toBe(false);
    }
  });

  it("marca pública liberada não libera o vocabulário interno que vem junto", () => {
    // A exceção é sobre UMA palavra, não sobre a frase. O que mais assusta aqui é o
    // cenário em que a marca serve de carona para o resto.
    const p = PROVIDERS_DE_MARCA_PUBLICA[0];
    const r = detectarVazamentoInterno(
      `O webhook do ${p} devolveu payload inválido no endpoint.`,
    );
    expect(r.achou).toBe(true);
  });

  /**
   * O risco deste gate é barrar demais: no follow-up determinístico o veto é drop
   * silencioso. A palavra do cliente que mais se aproxima aqui é "canal" — ele fala
   * "outro canal", "canal de atendimento", e isso NÃO pode morrer.
   */
  it("não barra a palavra do cliente que orbita o termo", () => {
    for (const frase of [
      "Prefere que eu te chame em outro canal?",
      "Esse é o nosso canal de atendimento.",
      "Te respondo pelo mesmo canal, combinado?",
    ]) {
      const r = detectarVazamentoInterno(frase);
      expect(r.achou, `barrado por ${r.categorias.join(",")}: ${r.termos.join(", ")}`).toBe(false);
    }
  });
});
