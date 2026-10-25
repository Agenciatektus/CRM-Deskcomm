import { describe, expect, it } from "vitest";

import { ESCOPOS_DA_META } from "@/lib/plataformas-de-anuncio/meta/oauth/oauth";
import {
  desfechoDaVerificacao,
  leituraDoRetorno,
  parametrosDoDesfecho,
} from "@/lib/plataformas-de-anuncio/meta/oauth/verificacao";

const conta = (n: number) => ({ id: `act_${n}`, nome: "Cliente Secreto", moeda: "BRL", status: 1 });

describe("escopos do OAuth da Meta", () => {
  it("são os mesmos da Verdash (IntegracoesPage.tsx)", () => {
    expect(ESCOPOS_DA_META.join(",")).toBe(
      "ads_read,ads_management,business_management,pages_show_list,pages_read_engagement",
    );
  });
});

describe("verificação pós-conexão", () => {
  it("com contas: contagens de contas e empresas", () => {
    const d = desfechoDaVerificacao({ ok: true, dados: [conta(1), conta(2)] }, 2);
    expect(parametrosDoDesfecho(d)).toEqual({ contas: "2", bms: "2" });
  });

  it("0 contas: aviso sem_contas", () => {
    const d = desfechoDaVerificacao({ ok: true, dados: [] }, 1);
    expect(parametrosDoDesfecho(d)).toEqual({ aviso: "sem_contas" });
  });

  it("falha de leitura: aviso leitura_falhou", () => {
    const d = desfechoDaVerificacao({ ok: false, motivo: "token_invalido" } as never, 0);
    expect(parametrosDoDesfecho(d)).toEqual({ aviso: "leitura_falhou" });
  });

  it("o parâmetro de retorno não carrega nome nem id de conta", () => {
    const d = desfechoDaVerificacao({ ok: true, dados: [conta(7)] }, 1);
    const json = JSON.stringify(parametrosDoDesfecho(d));
    expect(json).not.toContain("Cliente Secreto");
    expect(json).not.toContain("act_");
  });
});

describe("mensagem da tela a partir do retorno", () => {
  it("sucesso com a contagem (singular e plural)", () => {
    expect(leituraDoRetorno({ contas: "1" })).toMatchObject({ tipo: "sucesso", contas: 1 });
    expect(leituraDoRetorno({ contas: "33" })).toMatchObject({ tipo: "sucesso", contas: 33 });
  });

  it("0 contas: aviso pedindo a conta que gerencia os anúncios", () => {
    const a = leituraDoRetorno({ aviso: "sem_contas" });
    expect(a?.tipo).toBe("aviso");
    expect(a?.texto).toContain("entre com a conta que gerencia os anúncios");
  });

  it("falha de leitura: aviso, dizendo que a conexão foi gravada", () => {
    const a = leituraDoRetorno({ aviso: "leitura_falhou" });
    expect(a?.tipo).toBe("aviso");
    expect(a?.texto).toContain("conexão foi gravada");
  });

  it("valor fora do combinado não mostra nada", () => {
    expect(leituraDoRetorno({})).toBeNull();
    expect(leituraDoRetorno({ contas: "abc" })).toBeNull();
    expect(leituraDoRetorno({ contas: "0" })).toBeNull();
    expect(leituraDoRetorno({ aviso: "<script>" })).toBeNull();
  });
});
