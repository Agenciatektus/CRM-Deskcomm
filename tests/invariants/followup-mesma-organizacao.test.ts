import { beforeAll, describe, expect, it } from "vitest";

import { GOV_MANAGER, GOV_ORG, lastLine, seedGov, sql } from "./gov-helpers";

/**
 * INSCRIÇÃO E VERSÃO SÓ APONTAM PARA FLUXO DA PRÓPRIA ORGANIZAÇÃO (9024).
 *
 * P1 do @Cassio_SecRev na #56: a RLS por operação do upstream (0489/0490)
 * confere a organização da LINHA e o papel, nunca a do ponteiro referenciado.
 * Ao estreitar a guarda da cadência só para a cadência, a conferência de tenant
 * que a 9020 fazia de carona sumiu: um manager da org A gravava inscrição com
 * `organization_id = A` apontando para o fluxo (ou a cadência) da org B, e o
 * worker executaria o fluxo de B num contato de A.
 *
 * `fn_followup_mesma_organizacao` recusa com 42501, para QUALQUER papel. Este
 * arquivo mede com JWT real (`set role authenticated`), e também como dono do
 * banco (o caminho do service_role), cada desenho do ataque — e, ao lado, o
 * controle positivo da mesma org, para o vermelho não vir de outra coisa.
 *
 * Controle negativo (registrado na PR): sem as triggers
 * `trg_followup_mesma_organizacao`, os casos "manager da org A" de inscrição
 * passam a gravar 1 linha e ficam vermelhos.
 */

const ORG_B = "cccccccc-9024-4000-8000-00000000000b";
const FLUXO_A = "cccccccc-9024-4000-8000-0000000000a1";
const VERSAO_A = "cccccccc-9024-4000-8000-0000000000a2";
const FLUXO_B = "cccccccc-9024-4000-8000-0000000000b1";
const VERSAO_B = "cccccccc-9024-4000-8000-0000000000b2";
const INSCRICAO_A = "cccccccc-9024-4000-8000-0000000000a3";
const CONTATO_1 = "cccccccc-9024-4000-8000-0000000000c1";
const CONTATO_2 = "cccccccc-9024-4000-8000-0000000000c2";
const CONTATO_3 = "cccccccc-9024-4000-8000-0000000000c3";
const CONTATO_4 = "cccccccc-9024-4000-8000-0000000000c4";

type Desfecho = { linhas: number } | { erro: string };

/** Roda a DML como `authenticated` com o JWT de `usuario` (ou como dono, se null). */
function tentar(usuario: string | null, dml: string): Desfecho {
  const papel = usuario
    ? `set role authenticated;
       select set_config('request.jwt.claims', '{"sub":"${usuario}"}', false);`
    : "";
  try {
    const out = sql(`${papel}
      with w as (${dml} returning 1) select count(*) from w;`);
    return { linhas: Number(lastLine(out)) };
  } catch (err) {
    return { erro: String((err as { stderr?: string }).stderr ?? err) };
  }
}

function recusadoPorOrganizacao(d: Desfecho) {
  expect("erro" in d ? d.erro : `gravou ${d.linhas} linha(s)`).toMatch(/followup_fora_da_organizacao/);
}

function inscricao(fluxo: string, versao: string, contato: string): string {
  return `insert into public.followup_enrollments (organization_id, pointer_id, version_id, contact_id, current_node_id, status)
    values ('${GOV_ORG}', '${fluxo}', '${versao}', '${contato}', 'start', 'paused_handoff')`;
}

beforeAll(() => {
  seedGov();
  sql(`
    delete from public.followup_enrollments where contact_id in ('${CONTATO_1}','${CONTATO_2}','${CONTATO_3}','${CONTATO_4}');
    insert into public.organizations (id, slug, legal_name, display_name) values
      ('${ORG_B}', 'mesma-org-9024-b', 'Mesma org B', 'Mesma org B')
      on conflict (id) do nothing;
    insert into public.contacts (id, organization_id, display_name) values
      ('${CONTATO_1}', '${GOV_ORG}', '9024 contato 1'),
      ('${CONTATO_2}', '${GOV_ORG}', '9024 contato 2'),
      ('${CONTATO_3}', '${GOV_ORG}', '9024 contato 3'),
      ('${CONTATO_4}', '${GOV_ORG}', '9024 contato 4')
      on conflict (id) do nothing;
    insert into public.followup_flow_pointers (id, organization_id, name, status) values
      ('${FLUXO_A}', '${GOV_ORG}', '9024 fluxo A', 'active'),
      ('${FLUXO_B}', '${ORG_B}', '9024 fluxo B', 'active')
      on conflict (id) do nothing;
    insert into public.followup_flow_versions (id, organization_id, pointer_id, graph) values
      ('${VERSAO_A}', '${GOV_ORG}', '${FLUXO_A}', '{}'::jsonb),
      ('${VERSAO_B}', '${ORG_B}', '${FLUXO_B}', '{}'::jsonb)
      on conflict (id) do nothing;
    insert into public.followup_enrollments (id, organization_id, pointer_id, version_id, contact_id, current_node_id, status) values
      ('${INSCRICAO_A}', '${GOV_ORG}', '${FLUXO_A}', '${VERSAO_A}', '${CONTATO_1}', 'start', 'paused_handoff')
      on conflict (id) do nothing;
  `);
});

describe("manager da org A (JWT) não aponta inscrição para fluxo da org B", () => {
  it("INSERT com o ponteiro da org B é recusado", () => {
    recusadoPorOrganizacao(tentar(GOV_MANAGER, inscricao(FLUXO_B, VERSAO_A, CONTATO_2)));
  });

  it("INSERT com a versão da org B é recusado", () => {
    recusadoPorOrganizacao(tentar(GOV_MANAGER, inscricao(FLUXO_A, VERSAO_B, CONTATO_2)));
  });

  it("UPDATE trocando o ponteiro para o da org B é recusado, e a linha fica como estava", () => {
    recusadoPorOrganizacao(
      tentar(GOV_MANAGER, `update public.followup_enrollments set pointer_id = '${FLUXO_B}' where id = '${INSCRICAO_A}'`),
    );
    expect(lastLine(sql(`select pointer_id from public.followup_enrollments where id = '${INSCRICAO_A}';`))).toBe(FLUXO_A);
  });

  it("controle positivo: a mesma org passa", () => {
    expect(tentar(GOV_MANAGER, inscricao(FLUXO_A, VERSAO_A, CONTATO_3))).toEqual({ linhas: 1 });
  });
});

describe("a versão também (o manager não cria versão pela RLS, então mede-se pelo dono)", () => {
  it("manager da org A: INSERT de versão com o ponteiro da org B é recusado pela organização", () => {
    recusadoPorOrganizacao(
      tentar(
        GOV_MANAGER,
        `insert into public.followup_flow_versions (organization_id, pointer_id, graph) values ('${GOV_ORG}', '${FLUXO_B}', '{}'::jsonb)`,
      ),
    );
  });

  it("nem o dono do banco (caminho do service_role) grava versão da org A no fluxo da org B", () => {
    recusadoPorOrganizacao(
      tentar(
        null,
        `insert into public.followup_flow_versions (organization_id, pointer_id, graph) values ('${GOV_ORG}', '${FLUXO_B}', '{}'::jsonb)`,
      ),
    );
    recusadoPorOrganizacao(tentar(null, `update public.followup_flow_versions set pointer_id = '${FLUXO_B}' where id = '${VERSAO_A}'`));
  });

  it("nem o dono do banco grava inscrição da org A no fluxo da org B", () => {
    recusadoPorOrganizacao(tentar(null, inscricao(FLUXO_B, VERSAO_B, CONTATO_4)));
  });

  it("controle positivo: versão e inscrição da mesma org passam pelo dono", () => {
    expect(
      tentar(
        null,
        `insert into public.followup_flow_versions (organization_id, pointer_id, graph) values ('${GOV_ORG}', '${FLUXO_A}', '{}'::jsonb)`,
      ),
    ).toEqual({ linhas: 1 });
    expect(tentar(null, inscricao(FLUXO_A, VERSAO_A, CONTATO_4))).toEqual({ linhas: 1 });
  });
});
