/**
 * O CARD DO LEAD (proposta aprovada, 13/10/2026) — as regras puras.
 *
 * Nome honesto (nunca "Novo contato pelo WhatsApp"), selo do canal, tempo na
 * etapa contra o limite da etapa, próximo passo e os dados do contato que a
 * rota do quadro anexa.
 */
import { describe, expect, it } from "vitest";

import { anexarDadosDoContato, type LinhaDoContatoNoQuadro } from "@/lib/kanban/dados-do-contato";
import {
  canalDoCard,
  ehTituloGenerico,
  iniciaisDoCard,
  linhaDeBaixo,
  nomeDoCard,
  telefoneFormatado,
} from "@/lib/kanban/identidade-do-card";
import { anexarProximoPasso } from "@/lib/kanban/proximo-passo-do-quadro";
import { rotuloDoTempo, tempoNaEtapa } from "@/lib/kanban/tempo-na-etapa";
import type { Lead } from "@/lib/types/leads";

const base = { title: "Novo contato pelo WhatsApp", source: "whatsapp", conversa: null } as Pick<
  Lead,
  "title" | "source" | "conversa" | "contact_name" | "contact_instagram" | "contact_phone"
>;

describe("nome do card — contato → perfil IG → @ → telefone → título", () => {
  it("usa o nome do contato (inclui o nome do perfil do Instagram)", () => {
    expect(nomeDoCard({ ...base, contact_name: "Ana Paula", contact_instagram: "ana" })).toEqual({
      nome: "Ana Paula",
      origem: "contato",
    });
  });

  it("⭐ Direct sem nome: o @usuário, mesmo com o título genérico errado gravado", () => {
    const r = nomeDoCard({ ...base, source: "instagram", contact_instagram: "@carol.decor" });
    expect(r).toEqual({ nome: "@carol.decor", origem: "instagram" });
  });

  it("⭐ só telefone: o número formatado, nunca o título genérico", () => {
    const r = nomeDoCard({ ...base, contact_phone: "5521997021180" });
    expect(r).toEqual({ nome: "+55 21 99702-1180", origem: "telefone" });
  });

  it("negócio sem contato usa o título; o genérico nunca vira nome", () => {
    expect(nomeDoCard({ ...base, title: "Cozinha da Ana" }).nome).toBe("Cozinha da Ana");
    expect(nomeDoCard({ ...base }).nome).toBe("");
    expect(ehTituloGenerico("Novo contato pelo Instagram")).toBe(true);
  });

  it("linha de baixo: telefone sob o nome; canal sob o @; aviso sob o número", () => {
    const comNome = { ...base, contact_name: "Ana", contact_phone: "+5511984312207" };
    expect(linhaDeBaixo(comNome, "contato", "whatsapp")).toEqual({ texto: "+55 11 98431-2207", mono: true });
    expect(linhaDeBaixo({ ...base, contact_instagram: "x" }, "instagram", "direct")?.texto).toBe(
      "Direct do Instagram",
    );
    expect(linhaDeBaixo({ ...base, contact_phone: "5511" }, "telefone", "whatsapp")?.texto).toBe("Sem nome salvo");
  });

  it("iniciais: duas letras do nome, do @, ou o DDD do número", () => {
    expect(iniciaisDoCard("Roberto Lima")).toBe("RL");
    expect(iniciaisDoCard("@carol.decor")).toBe("CD");
    expect(iniciaisDoCard("+55 21 99702-1180")).toBe("21");
  });

  it("telefone fora do Brasil fica no canônico", () => {
    expect(telefoneFormatado("+14155550123")).toMatch(/^\+1/);
    expect(telefoneFormatado(null)).toBe("");
  });
});

describe("selo do canal", () => {
  const conversa = (instagram_entrada: string | null) =>
    ({ id: "c", preview: null, last_message_at: null, unread: 0, instagram_entrada }) as Lead["conversa"];

  it("Direct e comentário vêm da conversa; WhatsApp da origem", () => {
    expect(canalDoCard({ source: "x", conversa: conversa("direct") })).toBe("direct");
    expect(canalDoCard({ source: "x", conversa: conversa("comentario") })).toBe("comentario");
    expect(canalDoCard({ source: "instagram", conversa: null })).toBe("direct");
    expect(canalDoCard({ source: "whatsapp", conversa: null })).toBe("whatsapp");
    expect(canalDoCard({ source: "manual", conversa: null })).toBeNull();
  });
});

describe("tempo na etapa contra o limite", () => {
  it("sem limite: neutro, 'há X dias'", () => {
    const tempo = tempoNaEtapa(73, null)!;
    expect(tempo.nivel).toBe("neutro");
    expect(rotuloDoTempo(tempo)).toBe("há 3 dias");
  });

  it("⭐ acima do limite: âmbar; no dobro: vermelho", () => {
    expect(tempoNaEtapa(49, 48)!.nivel).toBe("alerta");
    expect(rotuloDoTempo(tempoNaEtapa(6 * 24, 72)!)).toBe("Parado há 6 dias");
    expect(tempoNaEtapa(97, 48)!.nivel).toBe("critico");
    expect(tempoNaEtapa(48, 48)!.nivel).toBe("neutro");
  });

  it("o radar diz que esfriou (janela padrão): âmbar mesmo sem limite", () => {
    expect(tempoNaEtapa(100, null, true)!.nivel).toBe("alerta");
  });

  it("horas e agora", () => {
    expect(rotuloDoTempo(tempoNaEtapa(5.5, null)!)).toBe("há 5h");
    expect(rotuloDoTempo(tempoNaEtapa(0.2, null)!)).toBe("agora");
    expect(tempoNaEtapa(null, 10)).toBeNull();
  });
});

describe("próximo passo e dados do contato anexados pelo quadro", () => {
  const lead = (id: string, contact_id: string | null = null) => ({ id, contact_id }) as Lead;

  it("⭐ a tarefa aberta de prazo mais cedo; sem tarefa = null explícito", () => {
    const r = anexarProximoPasso(
      [lead("l1"), lead("l2")],
      [
        { lead_id: "l1", title: "sem prazo", due_date: null, created_at: "2026-10-01T00:00:00Z" },
        { lead_id: "l1", title: "amanhã", due_date: "2026-10-14T10:00:00+00:00", created_at: "2026-10-02T00:00:00Z" },
        { lead_id: "l1", title: "depois", due_date: "2026-10-20T10:00:00+00:00", created_at: "2026-10-01T00:00:00Z" },
      ],
    );
    expect(r[0]!.proximo_passo).toEqual({ titulo: "amanhã", prazo: "2026-10-14T10:00:00+00:00" });
    expect(r[1]!.proximo_passo).toBeNull();
  });

  it("⭐ nome, @ e foto do contato; anonimizado não vaza nada", () => {
    const linha = (over: Partial<LinhaDoContatoNoQuadro>): LinhaDoContatoNoQuadro => ({
      id: "c1",
      phone_number: null,
      email: null,
      custom_fields: null,
      is_anonymized: false,
      ...over,
    });
    const [comFoto] = anexarDadosDoContato(
      [lead("l1", "c1")],
      [linha({ name: "Maria Souza", instagram_username: "@maria", avatar_storage_path: "a/b.jpg" })],
    );
    expect(comFoto).toMatchObject({ contact_name: "Maria Souza", contact_instagram: "maria", contact_tem_foto: true });

    const [anon] = anexarDadosDoContato(
      [lead("l1", "c1")],
      [linha({ name: "X", avatar_storage_path: "a/b.jpg", is_anonymized: true })],
    );
    expect(anon!.contact_name).toBeUndefined();
    expect(anon!.contact_tem_foto).toBeUndefined();
  });
});
