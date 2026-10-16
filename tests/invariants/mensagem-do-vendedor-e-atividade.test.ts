import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { sql } from "./gov-helpers";

/**
 * A FALA HUMANA DO VENDEDOR É ATIVIDADE DO NEGÓCIO (issue #2953).
 *
 * ## O defeito, medido por quem reportou
 *
 * `crm_leads.last_activity_at` só mudava por `fn_update_last_activity_at`, que é
 * o gatilho `trg_update_last_activity_at` em `crm_lead_activities`. A mensagem do
 * vendedor não cria linha lá, e `fn_mark_conversation_message` carimba apenas
 * `contacts.last_activity_at`. Então o negócio trabalhado todo dia — pelo Inbox
 * ou pelo celular — ficava com o relógio parado, e o radar de risco
 * (`lib/leads/radar-de-risco.ts`) o listava como frio.
 *
 * ## Este arquivo mede COMPORTAMENTO, não a cláusula `when` do gatilho
 *
 * Cada caso insere UMA mensagem de verdade em `public.messages` e olha o relógio
 * dos negócios antes e depois. Conferir a lista de `sent_via` contra si mesma
 * passaria com o `in` virado, com o `where` do `update` sem filtro de status e
 * com o `coalesce(..., '-infinity') < new.created_at` ausente — os três defeitos
 * que este arquivo existe para pegar.
 *
 * ## A bancada, e por que SEIS negócios
 *
 * Da fala do vendedor sobre o contato dependem quatro decisões do gatilho, e cada
 * negócio abaixo isola uma:
 *
 *   `abertoA`, `abertoB`   MESMO contato, MESMA organização, ABERTOS — os dois têm
 *                          de andar (o alvo é "os negócios abertos DO CONTATO",
 *                          não o card que alguém tem na mão).
 *   `ganho`, `perdido`     mesmo contato, MESMA organização, FECHADOS — fechar é o
 *                          fim do relógio, e o radar só olha negócio aberto.
 *   `deOutroContato`       MESMA organização, contato DIFERENTE, aberto — a
 *                          mensagem é sobre um contato, não sobre a empresa.
 *   `deOutraOrg`           OUTRA organização, aberto — o isolamento por tenant.
 *
 * ## Nada fica no banco
 *
 * Cada caso vive inteiro dentro de uma transação REVERTIDA (mesmo desenho de
 * `relogio-do-silencio.test.ts`, com o motivo lá medido: limpeza em `afterAll` de
 * tabela compartilhada torna o VIZINHO intermitente, e intermitente é pior que
 * vermelho porque some quando alguém vai investigar).
 */

const DIAS_TRINTA = "now() - interval '30 days'";

/** Os seis negócios da bancada, na ordem em que são lidos. */
const ROTULOS = [
  "abertoA",
  "abertoB",
  "ganho",
  "perdido",
  "deOutroContato",
  "deOutraOrg",
] as const;

type Rotulo = (typeof ROTULOS)[number];
type Leitura = { antes: string; depois: string };

interface Mensagem {
  /** `messages.direction`. Default `outbound`: quem fala é o vendedor. */
  direction?: "outbound" | "inbound";
  /** `messages.sent_via`. Default `user`: o Inbox do CRM. */
  sentVia?: string;
  /** `messages.type`. Default `text`. */
  type?: string;
  /** Literal jsonb (sem cast) para `messages.metadata`. Default `'{}'`. */
  metadata?: string;
  /** Expressão SQL de `messages.created_at`. Default `now()`. */
  createdAt?: string;
  /**
   * Quando `true`, a LINHA de `messages` nasce na organização B (a "outra" da
   * bancada) apontando para o contato e a conversa da organização A — uma linha
   * incoerente de propósito, que é a única forma de medir o filtro de
   * organização separado do filtro de contato.
   */
  organizacaoDeOutra?: boolean;
}

/**
 * Roda a bancada inteira numa transação revertida e devolve o relógio dos seis
 * negócios ANTES e DEPOIS da mensagem. Os ids vêm do Node para o script dispensar
 * `returning` — nada a extrair da saída do psql, uma fonte de erro a menos.
 *
 * `relogio` é a idade inicial dos negócios (expressão SQL): o caso do "nunca anda
 * para trás" precisa de um negócio com relógio MAIS NOVO que a mensagem.
 */
function medir(m: Mensagem, relogio: string = DIAS_TRINTA): Map<Rotulo, Leitura> {
  const b = {
    org: randomUUID(),
    outraOrg: randomUUID(),
    pipeline: randomUUID(),
    outraPipeline: randomUUID(),
    etapa: randomUUID(),
    outraEtapa: randomUUID(),
    sessao: randomUUID(),
    contato: randomUUID(),
    outroContato: randomUUID(),
    contatoDeOutraOrg: randomUUID(),
    conversa: randomUUID(),
    abertoA: randomUUID(),
    abertoB: randomUUID(),
    ganho: randomUUID(),
    perdido: randomUUID(),
    deOutroContato: randomUUID(),
    deOutraOrg: randomUUID(),
  };

  // O mapa rótulo → id viaja para dentro do SQL: a leitura sai ordenada por
  // rótulo, então `antes` e `depois` vêm na MESMA ordem sem o Node adivinhar.
  const mapa = ROTULOS.map((r) => `('${r}', '${b[r]}'::uuid)`).join(",\n        ");
  const leitura = (momento: string): string => `
    select '${momento}', v.rotulo, coalesce(l.last_activity_at::text, 'NULO')
      from (values
        ${mapa}
      ) as v(rotulo, id)
      join public.crm_leads l on l.id = v.id
     order by v.rotulo;`;

  const saida = sql(`
    begin;

    insert into public.organizations (id, slug, legal_name, display_name)
      values ('${b.org}', 'inv-2953-a', 'Inv 2953 A', 'Inv 2953 A'),
             ('${b.outraOrg}', 'inv-2953-b', 'Inv 2953 B', 'Inv 2953 B');
    insert into public.crm_pipelines (id, organization_id, name, slug)
      values ('${b.pipeline}', '${b.org}', 'Inv 2953 A', 'inv-2953-a'),
             ('${b.outraPipeline}', '${b.outraOrg}', 'Inv 2953 B', 'inv-2953-b');
    insert into public.crm_stages (id, organization_id, pipeline_id, name, slug, position)
      values ('${b.etapa}', '${b.org}', '${b.pipeline}', 'Novo', 'novo', 1000),
             ('${b.outraEtapa}', '${b.outraOrg}', '${b.outraPipeline}', 'Novo', 'novo', 1000);
    insert into public.channel_sessions (id, organization_id, waha_session_name, webhook_secret_encrypted)
      values ('${b.sessao}', '${b.org}', 'inv-2953', '\\x00'::bytea);
    insert into public.contacts (id, organization_id, display_name)
      values ('${b.contato}', '${b.org}', 'Vendedor 2953'),
             ('${b.outroContato}', '${b.org}', 'Outro contato 2953'),
             ('${b.contatoDeOutraOrg}', '${b.outraOrg}', 'Contato da outra organização');
    insert into public.conversations (id, organization_id, contact_id, channel_session_id, status)
      values ('${b.conversa}', '${b.org}', '${b.contato}', '${b.sessao}', 'open');
    insert into public.crm_leads
      (id, organization_id, pipeline_id, stage_id, contact_id, title, status, lost_reason, closed_at, last_activity_at, position_in_stage)
      values
        ('${b.abertoA}', '${b.org}', '${b.pipeline}', '${b.etapa}', '${b.contato}',
         'Aberto A', 'open', null, null, ${relogio}, 1000),
        ('${b.abertoB}', '${b.org}', '${b.pipeline}', '${b.etapa}', '${b.contato}',
         'Aberto B', 'open', null, null, ${relogio}, 2000),
        ('${b.ganho}', '${b.org}', '${b.pipeline}', '${b.etapa}', '${b.contato}',
         'Ganho', 'won', null, now(), ${relogio}, 3000),
        ('${b.perdido}', '${b.org}', '${b.pipeline}', '${b.etapa}', '${b.contato}',
         'Perdido', 'lost', 'no_response', now(), ${relogio}, 4000),
        ('${b.deOutroContato}', '${b.org}', '${b.pipeline}', '${b.etapa}', '${b.outroContato}',
         'Aberto de outro contato', 'open', null, null, ${relogio}, 5000),
        ('${b.deOutraOrg}', '${b.outraOrg}', '${b.outraPipeline}', '${b.outraEtapa}', '${b.contatoDeOutraOrg}',
         'Aberto na outra organização', 'open', null, null, ${relogio}, 6000);

    ${leitura("antes")}

    insert into public.messages
      (organization_id, conversation_id, channel_session_id, contact_id, type, direction, status, sent_via, created_at, metadata)
    values ('${m.organizacaoDeOutra ? b.outraOrg : b.org}', '${b.conversa}', '${b.sessao}', '${b.contato}',
            '${m.type ?? "text"}', '${m.direction ?? "outbound"}', 'sent', '${m.sentVia ?? "user"}',
            ${m.createdAt ?? "now()"}, ${m.metadata ?? "'{}'"}::jsonb);

    ${leitura("depois")}

    rollback;
  `);

  const porRotulo = new Map<Rotulo, Leitura>();
  for (const linha of saida.split("\n")) {
    const [momento, rotulo, valor] = linha.split("|");
    if (momento !== "antes" && momento !== "depois") continue;
    const atual = porRotulo.get(rotulo as Rotulo) ?? { antes: "", depois: "" };
    atual[momento] = valor ?? "";
    porRotulo.set(rotulo as Rotulo, atual);
  }
  return porRotulo;
}

/**
 * A régua de TODOS os casos, e é por isso que ela é uma só: em nenhum cenário um
 * negócio fechado, o de outro contato ou o de outra organização pode andar —
 * inclusive nos cenários em que a fala humana CARIMBA os abertos. Um caso que só
 * olhasse o alvo deixaria passar um `update` sem filtro de status.
 */
function conferir(leitura: Map<Rotulo, Leitura>, moveram: readonly Rotulo[]): void {
  expect(
    [...leitura.keys()].sort(),
    "a bancada não foi lida inteira — algum negócio não existe, e o caso abaixo passaria por vacuidade",
  ).toEqual([...ROTULOS].sort());

  for (const rotulo of ROTULOS) {
    const { antes, depois } = leitura.get(rotulo)!;
    // As duas leituras têm de EXISTIR: comparar "" com "" passaria em qualquer
    // cenário, inclusive com a bancada falhando calada.
    expect(antes, `${rotulo} sem leitura de partida`).not.toBe("");
    expect(antes, `${rotulo} nasceu sem relógio — a bancada não montou o caso`).not.toBe("NULO");
    expect(depois, `${rotulo} sem leitura final`).not.toBe("");
    if (moveram.includes(rotulo)) {
      expect(
        depois,
        `${rotulo} NÃO andou com a fala do vendedor — é o defeito da issue #2953: o radar de risco segue marcando negócio trabalhado como frio`,
      ).not.toBe(antes);
    } else {
      expect(depois, `${rotulo} andou e não podia`).toBe(antes);
    }
  }
}

/** Os negócios que a fala do vendedor sobre o contato tem de mover. */
const A_ABERTA_DO_CONTATO = ["abertoA", "abertoB"] as const;

describe("0683 · a mensagem do vendedor é atividade do negócio", () => {
  it("(1) fala pelo Inbox do CRM (sent_via='user'): carimba os negócios ABERTOS do contato, e só eles", () => {
    conferir(medir({ sentVia: "user", direction: "outbound" }), A_ABERTA_DO_CONTATO);
  });

  it("(2) fala pelo aparelho conectado (sent_via='external_device'): carimba os abertos do contato", () => {
    conferir(medir({ sentVia: "external_device", direction: "outbound" }), A_ABERTA_DO_CONTATO);
  });

  it("(3) fala pelo vocabulário antigo de envio do CRM (sent_via='crm'): carimba os abertos do contato", () => {
    conferir(medir({ sentVia: "crm", direction: "outbound" }), A_ABERTA_DO_CONTATO);
  });

  it("(4) mensagem da IA (sent_via='ai') não carimba: o relógio do negócio é de GENTE", () => {
    conferir(medir({ sentVia: "ai", direction: "outbound" }), []);
  });

  it("(5) mensagem da automação (sent_via='automation') não carimba", () => {
    conferir(medir({ sentVia: "automation", direction: "outbound" }), []);
  });

  it("(6) reação de emoji (type='reaction') não é fala", () => {
    conferir(medir({ sentVia: "external_device", type: "reaction" }), []);
  });

  it("(7) aviso de sistema (sent_via='system', type='system') não é fala", () => {
    conferir(medir({ sentVia: "system", type: "system" }), []);
  });

  it("(8) histórico importado (metadata.historico_importado='true') não é atendimento de agora", () => {
    conferir(
      medir({ sentVia: "external_device", metadata: `'{"historico_importado": "true"}'` }),
      [],
    );
  });

  it("(8b) histórico importado também na forma booleana (metadata.historico_importado=true)", () => {
    conferir(medir({ sentVia: "external_device", metadata: `'{"historico_importado": true}'` }), []);
  });

  it("(9) a fala do CLIENTE (inbound) não é trabalho do vendedor: quem espera resposta é o risco que o radar deve mostrar", () => {
    conferir(medir({ sentVia: "external_device", direction: "inbound" }), []);
  });

  it("(10) envio de OUTRA organização não atravessa o tenant, mesmo apontando para o MESMO contato", () => {
    // Bancada adversarial: a linha de `messages` nasce na organização B e aponta
    // para o CONTATO e a conversa da organização A (as FKs permitem; nenhuma
    // constraint promete coerência de tenant na linha). O contato casa, a
    // organização não: se o `update` do gatilho perdesse
    // `l.organization_id = new.organization_id`, o negócio de A seria carimbado
    // por um envio de B — a escrita cross-tenant que este repo persegue.
    const outra = medir({ sentVia: "user", direction: "outbound", organizacaoDeOutra: true });
    conferir(outra, []);

    // A mesma bancada com o envio de A continua carimbando: a sonda acima é
    // viva, o que ela mede não é "o gatilho não funciona neste arquivo".
    const mesma = medir({ sentVia: "user", direction: "outbound" });
    conferir(mesma, A_ABERTA_DO_CONTATO);
  });

  it("(11) a data NUNCA anda para trás: negócio com relógio mais NOVO que a mensagem fica intocado", () => {
    conferir(
      medir(
        { sentVia: "user", direction: "outbound", createdAt: "now() - interval '10 days'" },
        "now() - interval '1 hour'",
      ),
      [],
    );
  });

  it("(11b) e o mesmo envio humano carimba o negócio de relógio VELHO — a régua do caso (11) tem os dois lados", () => {
    conferir(
      medir(
        { sentVia: "user", direction: "outbound", createdAt: "now() - interval '10 days'" },
        "now() - interval '30 days'",
      ),
      A_ABERTA_DO_CONTATO,
    );
  });
});
