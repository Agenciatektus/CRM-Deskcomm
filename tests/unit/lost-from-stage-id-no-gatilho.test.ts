/**
 * Invariante de `lost_from_stage_id` (issue #1537) — a etapa de onde o negócio
 * saiu precisa estar gravada por TODOS os caminhos de perda, e o único lugar
 * que decide isso é o gatilho `fn_crm_lead_close_on_stage`.
 *
 * Este teste é ESTATICO de propósito: ele compara o `baseline.sql` (o que uma
 * instalação nova executa) com a ÚLTIMA migration que redefine o gatilho (o que
 * uma instalação existente executa). Se os dois corpos divergirem, instalação
 * nova e atualizadas passam a gravar coisas diferentes para o mesmo evento — e
 * nenhum teste de comportamento com um único banco pegaria a divergência, porque
 * cada um roda no seu.
 *
 * ⚠️ O ALVO DA COMPARAÇÃO ANDA, e andou duas vezes. A 0426 foi o alvo enquanto era
 * ela que redefinia a função; a 9040 redefiniu de novo (acrescentando
 * `fechado_alguma_vez_em` nos ramos de ganho e de perda) e o baseline foi editado
 * no lugar junto com ela, então o alvo é a 9040. Quem redefinir o gatilho outra
 * vez reponta `MIGRATION_ATUAL` aqui — e NÃO apaga a 0426, pelo motivo abaixo.
 *
 * ⚠️ A 0426 FICA como terceira referência. As asserções de `toContain` deste
 * arquivo são a cerca que a issue #1537 deixou, e elas valem para os TRÊS
 * artefatos: baseline, a migration que criou a regra (0426) e a que a carrega
 * hoje (9040). Trocar simplesmente um alvo pelo outro removeria a cerca de quem
 * APLICA a cadeia a partir de um banco antigo, que é justamente quem a 0426 serve.
 *
 * O comportamento em si (mover para a etapa de perda preenche a origem) é o que
 * o corpo testado aqui assegura; rodar contra Postgres efêmero exigiria o banco
 * (`pnpm test:db`), que este gate não abre — a regressão possível SEM banco é
 * exatamente a deriva entre os dois arquivos, e é ela que se trava aqui.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";

const BASELINE = readFileSync(join(process.cwd(), "supabase", "baseline.sql"), "utf8");
/** A migration que CRIOU a regra do #1537 — a cerca da issue vive nela. */
const MIGRATION_0426 = readFileSync(
  join(process.cwd(), "supabase", "migrations", "20260926150000_0426_motivo_de_perda_com_categoria.sql"),
  "utf8",
);
/** A ÚLTIMA que redefine o gatilho: é o corpo que o banco atualizado executa. */
const MIGRATION_ATUAL = readFileSync(
  join(process.cwd(), "supabase", "migrations", "20261006210000_9040_negocio_fechado_alguma_vez.sql"),
  "utf8",
);
/** Os três artefatos em que a regra do #1537 tem de aparecer. */
const COM_O_GATILHO = [BASELINE, MIGRATION_0426, MIGRATION_ATUAL];
const MANIFEST = readFileSync(join(process.cwd(), "supabase", "migrations", "MANIFEST.md"), "utf8");
const TIPOS = readFileSync(join(process.cwd(), "lib", "database.types.ts"), "utf8");

/** O corpo do gatilho, sem comentários e sem espaços — o que o banco executa. */
function corpoDoGatilho(sql: string): string {
  // O âncora é o `if v_is_won then`, não a assinatura: o baseline é dump
  // (`CREATE OR REPLACE FUNCTION "public"."…"() RETURNS "trigger"`) e a
  // migration é lowercase (`… public.fn_…() returns trigger`) — a assinatura
  // escrita de um jeito só não acha as duas.
  expect(sql).toContain("fn_crm_lead_close_on_stage");
  const a = sql.lastIndexOf("  if v_is_won then");
  const b = sql.indexOf("  return new;", a);
  expect(a, "corpo do gatilho não encontrado").toBeGreaterThan(-1);
  expect(b, "fim do corpo do gatilho não encontrado").toBeGreaterThan(a);
  return sql
    .slice(a, b + "  return new;".length)
    .split("\n")
    .map((linha) => linha.replace(/--.*$/, "").trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ");
}

describe("lost_from_stage_id gravado pelo gatilho (#1537)", () => {
  it("baseline e a ÚLTIMA migration do gatilho executam o MESMO corpo", () => {
    // Instalação nova (baseline) × instalação atualizada (fim da cadeia).
    expect(corpoDoGatilho(MIGRATION_ATUAL)).toBe(corpoDoGatilho(BASELINE));
  });

  it("a 0426 diverge do baseline, e isso É o esperado depois da 9040", () => {
    // Trava o motivo do repontamento. Sem este caso, alguém que repontasse
    // `MIGRATION_ATUAL` de volta para a 0426 veria vermelho e não saberia se o
    // problema é o alvo ou o corpo. A cadeia aplica 0426 e DEPOIS 9040, então
    // converge; o que não pode é o baseline divergir do FIM da cadeia.
    expect(corpoDoGatilho(MIGRATION_0426)).not.toBe(corpoDoGatilho(BASELINE));
    // E a divergência é exatamente a marca da 9040, nada mais: a 0426 não a tem,
    // o baseline tem, e o resto do corpo é igual depois de removê-la.
    const SEM_MARCA = /new\.fechado_alguma_vez_em := coalesce\(new\.fechado_alguma_vez_em, now\(\)\); ?/g;
    expect(corpoDoGatilho(BASELINE).replace(SEM_MARCA, "")).toBe(corpoDoGatilho(MIGRATION_0426));
  });

  it("a origem só nasce na transição para `lost`, preservando o que já havia", () => {
    for (const sql of COM_O_GATILHO) {
      expect(sql).toContain(
        "new.lost_from_stage_id := coalesce(new.lost_from_stage_id, old.stage_id);",
      );
      expect(sql).toContain("if tg_op = 'UPDATE' and old.status is distinct from 'lost' then");
    }
  });

  it("reabrir zera a origem — negócio aberto não tem etapa de perda", () => {
    // Pelo corpo JÁ sem comentários: o texto entre `closed_at` e a limpeza é
    // comentário, e um teste que casa comentário quebra quando alguém explica
    // melhor a linha.
    for (const sql of COM_O_GATILHO) {
      expect(corpoDoGatilho(sql)).toContain(
        "new.status := 'open'; new.closed_at := null; new.lost_from_stage_id := null;",
      );
    }
  });

  it("a 9040 NÃO limpa a marca ao reabrir — é o que ela existe para fazer", () => {
    // A 9040 depende de o ramo de reabertura NÃO tocar `fechado_alguma_vez_em`.
    // Se alguém a acrescentar à limpeza, o veto da campanha contínua volta a
    // deixar passar cliente ganho reaberto, e nenhum outro teste deste arquivo
    // pegaria — os de cima medem as colunas do #1537.
    for (const sql of [BASELINE, MIGRATION_ATUAL]) {
      const corpo = corpoDoGatilho(sql);
      const reabertura = corpo.slice(corpo.indexOf("new.status := 'open';"));
      expect(reabertura).not.toContain("fechado_alguma_vez_em := null");
      expect(reabertura).not.toContain("fechado_alguma_vez_em :=");
    }
  });

  it("a coluna existe nos TRÊS lugares da tripla", () => {
    // A coluna do #1537 nasce na 0426, não na 9040 — esta asserção continua na
    // migration que a criou.
    expect(MIGRATION_0426).toContain("add column if not exists lost_from_stage_id uuid");
    expect(BASELINE).toContain("add column if not exists lost_from_stage_id uuid");
    expect(MANIFEST).toContain("0426_motivo_de_perda_com_categoria");
    // Row, Insert e Update; e a FK em Relationships, que é o que o PostgREST vê
    // — a segunda FK para `crm_stages` torna ambíguo o embed sem dica.
    expect(TIPOS.match(/lost_from_stage_id\??:/g) ?? []).toHaveLength(3);
    expect(TIPOS).toContain('foreignKeyName: "fk_crm_leads_lost_from_stage"');
  });

  it("o trigger de validação lê o RÓTULO dos dois formatos de lost_reasons", () => {
    // Sem isto, `{ label, categoria }` é recusado com 22023 e o funil inteiro
    // não consegue perder negócio — o defeito que a issue descreve viraria
    // travamento de escrita.
    // `fn_validate_lost_reason_required` é da 0426 e a 9040 não a toca.
    for (const sql of [BASELINE, MIGRATION_0426]) {
      expect(sql).toContain("jsonb_typeof(e) = 'object'");
      expect(sql).toContain("nullif(e ->> 'label', '')");
      expect(sql).toContain("nullif(e #>> '{}', '')");
    }
  });
});
