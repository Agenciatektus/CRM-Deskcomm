/**
 * `send_message` recusa restatemente quase idêntico do que JÁ saiu no turno
 * (regressão de segurança do gate near-dup).
 *
 * Defeito observado em produção: uma única pergunta levou 4 respostas — 3 do
 * caminho de recuperação do "turno mudo" (o modelo chamou `send_message` 3× com
 * corpos quase idênticos) e 1 de um follow-up de promessa. O contrato é UMA
 * resposta adequada e completa por turno; restatemente imediato é redundância.
 *
 * Mesma técnica de `send-message-corpo-vazio.test.ts`: o `execute` é uma closure
 * dentro do turno, sem ponto de injeção barato, então o teste prende o `if` no
 * caminho que fala no canal — presença, ordem, e o fato de a recusa devolver erro
 * de ENSINO (`ok:false`) e NUNCA marcar nada como entregue (sem ledger row).
 *
 * Também pinça, aqui, as quatro mudanças da revisão do #2996:
 *  - item 1: seeding com `!preview &&` (o `liveJob()` do preview lança);
 *  - item 6: `checar` → `reservar` síncronos antes do primeiro `await`, `promover`
 *    no aceite e `liberar` em todo caminho de não-envio (finally incluso);
 *  - item 7: a supressão emite `send_vetoed` na timeline, sem conteúdo de mensagem.
 *
 * A régua pura de similaridade (normalização + Dice + exceções) vive em
 * `near-dup.test.ts`; a janela de banco em `memoria-envio-janela.test.ts`.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const FONTE = readFileSync(join(process.cwd(), "lib/agent-engine/agent/inbound-turn.ts"), "utf8");
const corpoDoSend = (() => {
  const i = FONTE.indexOf("send_message: tool({");
  const j = FONTE.indexOf("update_lead_state: tool({", i);
  expect(i).toBeGreaterThan(-1);
  expect(j).toBeGreaterThan(i);
  return FONTE.slice(i, j);
})();

describe("send_message nunca reenvia restatemente do mesmo turno", () => {
  it("o execute recusa duplicata próxima com erro de ENSINO (ok:false, nunca entregue)", () => {
    // A recusa é um `ok:false` com code distinto — mesma forma de corpo_vazio/
    // resposta_obsoleta. Não há `outcomes.push`, ledger nem chamada de canal
    // dentro do ramo: nada é marcado como entregue.
    expect(corpoDoSend).toMatch(
      /const corpoRepetido = dupTrava\.checar\(body\);\s*if \(corpoRepetido !== null\) \{\s*runLog\.info\('duplicate_suppressed/,
    );
    expect(corpoDoSend).toContain("code: 'duplicate_suppressed'");
    expect(corpoDoSend).toMatch(/code: 'duplicate_suppressed',\s*message:/);
  });

  it("a recusa vem antes do teto de envios — duplicata não gasta a cota do turno", () => {
    const dup = corpoDoSend.indexOf("'duplicate_suppressed'");
    const teto = corpoDoSend.indexOf("'max_sends_per_turn'");
    expect(dup).toBeGreaterThan(-1);
    expect(teto).toBeGreaterThan(-1);
    expect(dup).toBeLessThan(teto);
  });

  it("corpo vazio é checado primeiro — ordem vazio → duplicata → cota", () => {
    const vazio = corpoDoSend.indexOf("'corpo_vazio'");
    const dup = corpoDoSend.indexOf("'duplicate_suppressed'");
    expect(vazio).toBeGreaterThan(-1);
    expect(dup).toBeGreaterThan(vazio);
  });
});

describe("a memória de duplicata só cresce com envio REAL e é semeada por histórico", () => {
  it("candidato aceito (sent/already_sent/queued) PROMOVE de em-voo para a memória", () => {
    // O `promover` está DEPOIS de `outcomes.push(outcome)` e sob os kinds que
    // saíram — transição exatamente uma vez (em-voo → aceitos), nunca dupla.
    expect(FONTE).toMatch(
      /if \(outcome\.kind === 'sent' \|\| outcome\.kind === 'already_sent' \|\| outcome\.kind === 'queued'\) \{\s*dupTrava\.promover\(body\);/,
    );
  });

  it("o turno semeia a memória com o que já saiu desde a última inbound (cobre follow-up)", () => {
    // Janela "desde a última inbound": vazia num turno fresco (não suprime
    // resposta legítima), cheia num follow-up que re-responde conversa calada.
    expect(FONTE).toContain("corposEnviadosDesdeUltimaInbound(");
    expect(FONTE).toMatch(/dupTrava\.semear\(jaDito\)/);
  });
});

// ─── #2996 item 1: preview não pode entrar no seeding ───────────────────────
describe("preview safety: o seeding não chama liveJob() em preview", () => {
  const blocoDeSeeding = (() => {
    const i = FONTE.indexOf("MEMÓRIA DE DUPLICATA CRUZADA");
    expect(i).toBeGreaterThan(-1);
    return FONTE.slice(i, i + 1600);
  })();

  it("o guard do seeding carrega `!preview &&` (mesma forma da guarda irmã)", () => {
    expect(blocoDeSeeding).toContain("if (!preview && turnoVaiFalarComOLead(liveJob()))");
    // Sem o `!preview &&`, `liveJob()` lança `preview_operational_job_forbidden`
    // no `runAgentPreview` — é exatamente o crash reportado na revisão.
    expect(blocoDeSeeding).not.toMatch(/if \(turnoVaiFalarComOLead\(liveJob\(\)\)\)/);
  });
});

// ─── #2996 item 6: reserva em voo / promoção / liberação ────────────────────
describe("reserva em voo fecha a corrida de tool calls paralelas", () => {
  it("`checar` → `reservar` síncronos no caminho de passagem e antes da cadeia", () => {
    const gi = corpoDoSend.indexOf("dupTrava.checar(body)");
    const ri = corpoDoSend.indexOf("dupTrava.reservar(body)");
    expect(gi).toBeGreaterThan(-1);
    expect(ri).toBeGreaterThan(gi);
    // O ramo de SUPRESSÃO termina em `return` e pode conter await (o emit do
    // item 7 mora lá). O caminho que LEVA à reserva é o que precisa ser
    // síncrono: do fim daquele ramo até `reservar`, nenhuma operação assíncrona
    // — se houvesse, a chamada paralela seguinte rodaria durante o yield e
    // passaria pela checagem antes da reserva.
    const fimRamSupressao = corpoDoSend.indexOf("if (claimsCurrentInboundIsEmpty", gi);
    expect(fimRamSupressao).toBeGreaterThan(gi);
    expect(fimRamSupressao).toBeLessThan(ri);
    expect(corpoDoSend.slice(fimRamSupressao, ri)).not.toMatch(/\bawait\b/);
    // E antes do primeiro ponto assíncrono de qualquer espécie (a cadeia e a
    // checagem de obsolescência): se a reserva fosse depois, as paralelas
    // passariam pela checagem durante o await.
    expect(ri).toBeLessThan(corpoDoSend.indexOf("runBeforeSend(", gi));
    expect(ri).toBeLessThan(corpoDoSend.indexOf("respostaFicouObsoleta", gi));
  });

  it("toda tentativa não-aceita libera a reserva (returns explícitos + finally)", () => {
    // resposta_obsoleta e falha de preparo de foto: liberação explícita antes
    // do return (estão FORA do try/catch da cadeia).
    const obs = corpoDoSend.indexOf("turnoDescartado = true;");
    expect(obs).toBeGreaterThan(-1);
    expect(corpoDoSend.slice(obs, obs + 220)).toContain("dupTrava.liberar(body)");
    const prep = corpoDoSend.indexOf("if (!preparadas.ok) {");
    expect(prep).toBeGreaterThan(-1);
    expect(corpoDoSend.slice(prep, prep + 240)).toContain("dupTrava.liberar(body);");
    // Vetos, outcomes não-aceitos, exception e timeout saem pelo finally da
    // cadeia: nenhuma reserva sobrevive à tentativa.
    expect(corpoDoSend).toMatch(
      /code: 'internal_error'[\s\S]*\} finally \{[\s\S]*dupTrava\.liberar\(body\);/,
    );
  });

  it("a candidata checada nunca se auto-suprime (reservar DEPOIS do checar)", () => {
    const gi = corpoDoSend.indexOf("dupTrava.checar(body)");
    const ri = corpoDoSend.indexOf("dupTrava.reservar(body)");
    expect(ri).toBeGreaterThan(gi);
    // O corpo só entra em `emVoo` depois da própria checagem — `checar` consulta
    // aceitos ∪ emVoo, então a ordem é a garantia contra auto-supressão.
    expect(corpoDoSend.slice(gi, ri)).not.toContain("dupTrava.reservar");
  });
});

// ─── #2996 item 7: rastro visível para o operador ───────────────────────────
describe("supressão vira atividade na timeline do negócio (sem PII)", () => {
  it("emite `send_vetoed` pelo vocabulário existente, dentro do ramo de supressão", () => {
    const gi = corpoDoSend.indexOf("dupTrava.checar(body)");
    const emit = corpoDoSend.indexOf("await emitAgentActivityForContact({", gi);
    // Fim do ramo: o próximo statement depois do `return` de ensino. O emit
    // precisa estar ENTRE o checar e esse fim — ou seja, dentro do ramo que
    // devolve o erro, antes de qualquer caminho que siga adiante.
    const fimRam = corpoDoSend.indexOf("if (claimsCurrentInboundIsEmpty", gi);
    expect(gi).toBeGreaterThan(-1);
    expect(emit).toBeGreaterThan(gi);
    expect(fimRam).toBeGreaterThan(emit);
    const bloco = corpoDoSend.slice(gi, fimRam);
    expect(bloco).toContain("type: 'send_vetoed'");
    expect(bloco).toContain("sourceModule: 'near-dup'");
    expect(bloco).toContain("reason: vetoReason('near_dup', 'duplicate_suppressed')");
    // O erro de ensino continua devolvido ao modelo no mesmo ramo (com `message:`
    // — distingue o `code:` do return do `code:` do payload, que vem antes).
    expect(bloco).toMatch(/code: 'duplicate_suppressed',\s*message:/);
    // Nunca lança: a timeline não derruba a recusa que ela descreve.
    expect(bloco).toMatch(/try \{\s*const roteou = await emitAgentActivityForContact\(\{/);
    expect(bloco).toContain("if (!roteou.routed)");
    expect(bloco).toContain("runLog.warn('atividade da supressão near-dup não gravada'");
  });

  it("o payload carrega só ids e tamanhos — nunca o texto das mensagens (PII)", () => {
    const emit = corpoDoSend.indexOf("await emitAgentActivityForContact({");
    const payloadStart = corpoDoSend.indexOf("payload: {", emit);
    const payloadEnd = corpoDoSend.indexOf("}", corpoDoSend.indexOf("candidato_len", payloadStart));
    expect(payloadStart).toBeGreaterThan(-1);
    const payload = corpoDoSend.slice(payloadStart, payloadEnd);
    expect(payload).toContain("prior_len");
    expect(payload).toContain("candidato_len");
    expect(payload).toContain("conversation_id");
    // Valores são `.length`/ids — nunca o corpo cru (nem o memorizado).
    expect(payload).not.toMatch(/:\s*(body|corpoRepetido)\s*[,}]/);
  });
});
