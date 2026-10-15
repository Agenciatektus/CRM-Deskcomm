import { describe, expect, it } from "vitest";

import { detectarPromessaDeRetornoDoAssistente } from "@/lib/agent-engine/guardrails/retorno-do-assistente";

/**
 * Calibração do detector léxico de PROMESSA DE RETORNO DO PRÓPRIO ASSISTENTE (issue #2916).
 *
 * É o sinal que o `casePromiseGate` passou a ler em OU com o semântico: a frase em que o
 * assistente se compromete a RETOMAR A CONVERSA ("retomamos daqui a duas horas", "te chamo
 * mais tarde"). Antes dele, o único sinal era o classificador semântico — que é modelo e
 * varia entre execuções (medido pelo autor: 3 de 11 mandavam a confirmação SEM agendar).
 *
 * Como todo detector de veto, o ponto sensível é o FALSO-POSITIVO: vetar texto legítimo
 * bloqueia o envio. Por isso o vocabulário é MÍNIMO, e estes casos congelam os dois lados —
 * o que DEVE casar e, com o mesmo peso, o que NÃO pode.
 */

// DEVEM casar: o próprio assistente prometendo voltar a falar.
const RETORNO_DO_ASSISTENTE: readonly string[] = [
  // O caso MEDIDO da issue: o cliente pediu "pode ser daqui a duas horas".
  "Combinado, retomamos daqui a duas horas.",
  "Combinado, retomamos daqui a duas horas. Até já!",
  "Vou retomar o contato na segunda.",
  "Combinado! Te chamo mais tarde.",
  "Perfeito, volto a falar com você depois.",
  "Vou voltar a falar com você amanhã.",
  "A gente se fala mais tarde, então.",
  // robusto a caixa e acento (normaliza antes de casar)
  "COMBINADO, RETOMAMOS DAQUI A DUAS HORAS!",
];

// NÃO podem casar: fala legítima / promessa de CONTEÚDO (semântico) / pergunta / passado.
const NAO_E_RETORNO_DO_ASSISTENTE: readonly string[] = [
  // falas inocentes
  "Bom dia! Como posso ajudar?",
  "Nosso horário é de segunda a sexta, das 8h às 18h.",
  "Qual prazo você julga ideal?",
  "Consigo te oferecer quinta às 14h ou sexta às 10h.",
  // promessa de retorno de CONTEÚDO — é do classificador SEMÂNTICO (prometeuRetornoHumano),
  // não deste léxico: incluí-la aqui reabriria as cinco frases que vazam sem a camada
  // semântica (congeladas em `cerca-prometer-de-ponta-a-ponta.test.ts`).
  "Te retorno com a proposta em breve.",
  "Vou encaminhar as informações do site imobiliário para análise e te retorno com a proposta.",
  "Vou analisar e te retorno com a proposta.",
  "Vou levar isso para avaliação interna e te dou um retorno.",
  "Combinado! Te retorno amanhã de manhã.",
  // ação própria do bot que NÃO é retomada de conversa
  "vou te enviar o link",
  "vou preparar seu orçamento",
  "já te mando o boleto",
  "vou anotar aqui",
  // perguntas e passado — não são promessa futura
  "Posso te chamar de Marcos?",
  "Como prefere que eu te chame?",
  "Te chamei ontem mas não tive retorno.",
  "Prefiro te chamar de você, tudo bem?",
  // 3ª pessoa / gerúndio de assunto (o "retoma" que NÃO é o assistente prometendo voltar)
  "O sistema retoma automaticamente.",
  "Retomando o que conversamos, o prazo é de 3 dias.",
  "Nos falamos sobre isso na sua última visita.",
  // alvo humano — quem pega é o léxico de humano (`detectHumanPromise`), não este
  "Vou chamar o responsável para te ajudar.",
];

describe("detectarPromessaDeRetornoDoAssistente — calibração (issue #2916)", () => {
  it.each(RETORNO_DO_ASSISTENTE)("DETECTA o retorno do próprio assistente: %s", (body) => {
    expect(detectarPromessaDeRetornoDoAssistente(body)).toBe(true);
  });

  it.each(NAO_E_RETORNO_DO_ASSISTENTE)("NÃO detecta (fala legítima/outra camada): %s", (body) => {
    expect(detectarPromessaDeRetornoDoAssistente(body)).toBe(false);
  });

  it("no-op em string vazia ou só espaços", () => {
    expect(detectarPromessaDeRetornoDoAssistente("")).toBe(false);
    expect(detectarPromessaDeRetornoDoAssistente("   \n  ")).toBe(false);
  });
});
