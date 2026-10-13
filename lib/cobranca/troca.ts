/**
 * TROCAR DE PLANO — um caminho só, para a empresa (Plano e cobrança) e para o
 * dono (card do tenant). Spec da cobrança do revendedor §7e, §7g; D-3, D-4, D-13.
 *
 *   - teste grátis (estado `trial` e `trial_ate` no futuro): vale na hora; com
 *     provedor, o preço da 1ª cobrança muda junto. Divergência 44: a D-13 vale só
 *     enquanto nada foi pago — pagou dentro do teste (estado `ativa`), agenda;
 *   - a empresa só escolhe plano com `oferecido_ao_cliente` (Task 4A); o dono,
 *     qualquer um ativo (plano negociado);
 *   - depois do teste, upgrade com provedor: cobra a diferença proporcional e
 *     só aplica preço/limites quando o pagamento é confirmado; conserva a data
 *     de renovação. Downgrade segue agendado para a próxima cobrança paga;
 *   - em dívida, ou teste vencido sem assinatura: recusa ("regularize antes");
 *   - teste com link de pagamento em aberto e sem assinatura: a sessão é
 *     expirada NO PROVEDOR e a troca vale na hora (#2609); sem a id da sessão
 *     guardada não há o que expirar, e a recusa continua até o link ser pago ou
 *     expirar (`checkout_em_aberto`);
 *   - uso acima do plano novo: recusa com a lista do que remover (D-4).
 * O provedor é chamado ANTES da escrita e fora de transação; a escrita é um
 * compare-and-set no plano E no agendamento lidos. Se a escrita não acontece
 * depois de o provedor ter aceitado, o preço volta ao que o banco registra
 * (`reconciliar`). Voltar ao plano atual (desfazer o agendamento) não passa pelas
 * portas de arquivado/oferecido/excedente: é só soltar o que já foi aceito.
 * Quem chama audita (o ator muda).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

import { adaptador as adaptadorPadrao } from "@/lib/cobranca/provedores";
import { ErroDoProvedor, type AdaptadorDeCobranca } from "@/lib/cobranca/provedores/contrato";
import { excedenteDoPlano, lerUsoDaOrganizacao } from "@/lib/cobranca/uso";
import { calcularAjusteProporcional } from "@/lib/cobranca/prorata";
import { urlDoPainelDaEmpresa } from "@/lib/cobranca/url";
import type { EstadoDaAssinatura, Intervalo, ProvedorDeCobranca } from "@/lib/cobranca/vocabulario";

export type ResultadoDaTroca =
  | {
      ok: true;
      changed: boolean;
      quando: "imediato" | "agendado" | "nenhum" | "pagamento_pendente";
      planoId: string;
      planoAgendadoId: string | null;
      valeAPartirDe: string | null;
      de: string;
      urlPagamento?: string;
    }
  | { ok: false; status: number; code: string; message: string; details?: unknown };

interface Atual {
  plano_id: string;
  plano_agendado_id: string | null;
  estado: EstadoDaAssinatura;
  trial_ate: string | null;
  provedor: ProvedorDeCobranca | null;
  provedor_cliente_id: string | null;
  provedor_assinatura_id: string | null;
  proximo_vencimento: string | null;
  checkout_url: string | null;
  checkout_expira_em: string | null;
  /** A id da sessão de pagamento no provedor (Stripe `cs_…`, Asaas `pay_…`) — #2609. */
  checkout_sessao_id: string | null;
  periodo_pago_desde: string | null;
  troca_id: string | null;
  plano_troca_pendente_id: string | null;
  troca_status: string | null;
  troca_pagamento_ref: string | null;
  troca_pagamento_url: string | null;
  troca_reserva_ate: string | null;
}
interface Plano {
  id: string;
  nome: string;
  preco_cents: number;
  intervalo: Intervalo;
  max_assentos: number | null;
  max_canais: number | null;
  arquivado_em: string | null;
  oferecido_ao_cliente: boolean;
}

const EM_DIVIDA: readonly EstadoDaAssinatura[] = ["em_atraso", "cancelada"];
const recusa = (status: number, code: string, message: string, details?: unknown): ResultadoDaTroca => ({
  ok: false, status, code, message, ...(details === undefined ? {} : { details }),
});

/**
 * #2609 — melhor esforço: a sessão já expirou no provedor, e esta é a ÚLTIMA
 * chance de tirar o link morto da linha antes da recusa que se segue. O filtro na
 * `checkout_sessao_id` é o compare-and-set: linha que já gravou OUTRA sessão (ou
 * uma reserva em andamento, que zera a id) não é tocada.
 */
async function limparSessaoExpirada(admin: SupabaseClient, orgId: string, sessaoId: string, agora: Date): Promise<void> {
  try {
    await admin
      .from("cobranca_assinaturas")
      .update({ checkout_url: null, checkout_expira_em: null, checkout_sessao_id: null, updated_at: agora.toISOString() })
      .eq("organization_id", orgId)
      .eq("checkout_sessao_id", sessaoId);
  } catch {
    // A recusa seguinte já diz que nada mudou; não jogue 500 por cima dela.
  }
}

async function lerPlanoCompleto(admin: SupabaseClient, id: string): Promise<Plano | null | "erro"> {
  const { data, error } = await admin
    .from("cobranca_planos")
    .select("id, nome, preco_cents, intervalo, max_assentos, max_canais, arquivado_em, oferecido_ao_cliente")
    .eq("id", id)
    .maybeSingle();
  if (error) return "erro";
  return (data as Plano | null) ?? null;
}

export async function trocarPlanoDaOrg(
  admin: SupabaseClient,
  orgId: string,
  planoId: string,
  deps: { adaptador?: (id: ProvedorDeCobranca) => AdaptadorDeCobranca; agora?: () => Date; origem?: "empresa" | "dono" } = {},
): Promise<ResultadoDaTroca> {
  const agora = (deps.agora ?? (() => new Date()))();
  const { data: lida, error } = await admin
    .from("cobranca_assinaturas")
    .select("plano_id, plano_agendado_id, estado, trial_ate, provedor, provedor_cliente_id, provedor_assinatura_id, proximo_vencimento, periodo_pago_desde, checkout_url, checkout_expira_em, checkout_sessao_id, troca_id, plano_troca_pendente_id, troca_status, troca_pagamento_ref, troca_pagamento_url, troca_reserva_ate")
    .eq("organization_id", orgId)
    .maybeSingle();
  if (error) return recusa(500, "internal_error", "Não foi possível ler a assinatura.");
  const atual = lida as Atual | null;
  if (!atual) return recusa(404, "not_found", "Esta empresa não tem assinatura (é isenta).");

  const nada = (quando: "nenhum" | "agendado"): ResultadoDaTroca => ({
    ok: true, changed: false, quando, planoId: atual.plano_id, planoAgendadoId: atual.plano_agendado_id,
    valeAPartirDe: quando === "agendado" ? atual.proximo_vencimento : null, de: atual.plano_id,
  });
  if (planoId === atual.plano_id && atual.plano_agendado_id === null) return nada("nenhum");
  if (planoId === atual.plano_agendado_id) return nada("agendado");
  if (EM_DIVIDA.includes(atual.estado)) return recusa(409, "pagamento_pendente", "Regularize o pagamento antes de trocar de plano.");
  const emTeste = atual.estado === "trial" && atual.trial_ate !== null && Date.parse(atual.trial_ate) > agora.getTime();
  if (!emTeste && !atual.provedor) {
    return recusa(409, "pagamento_pendente", "O teste grátis acabou e não há pagamento. A troca de plano vale depois da assinatura.");
  }

  const [novo, antigo] = await Promise.all([lerPlanoCompleto(admin, planoId), lerPlanoCompleto(admin, atual.plano_id)]);
  if (novo === "erro" || antigo === "erro") return recusa(500, "internal_error", "Não foi possível ler o plano.");
  const desfazendo = novo !== null && novo.id === atual.plano_id;
  if (!novo || !antigo || (!desfazendo && (novo.arquivado_em !== null || novo.intervalo !== antigo.intervalo))) {
    return recusa(422, "plano_invalido", "Escolha um plano ativo com o mesmo intervalo de cobrança.");
  }
  // Enquanto houver link de pagamento em aberto, o plano não muda — a menos que
  // dê para expirá-lo no provedor (#2609): aí a troca vale na hora e o link
  // antigo deixa de valer. Sem a id da sessão guardada (linha anterior à 0641)
  // não há o que expirar, e o link continuaria valendo FORA: vale a recusa.
  const linkEmAberto = atual.checkout_url !== null && atual.checkout_expira_em !== null && Date.parse(atual.checkout_expira_em) > agora.getTime();
  const bloqueia = !desfazendo && emTeste && atual.provedor !== null && atual.provedor_assinatura_id === null && linkEmAberto;
  // O `atual.provedor !== null` repete uma condição de `bloqueia` de propósito:
  // é ele que estreita o tipo aqui embaixo (`bloqueia` sozinho não estreita nada).
  const sessaoAExperrar = bloqueia && atual.provedor !== null && atual.checkout_sessao_id !== null
    ? { provedor: atual.provedor, id: atual.checkout_sessao_id }
    : null;
  if (bloqueia && sessaoAExperrar === null) {
    return recusa(409, "checkout_em_aberto", "Há um link de pagamento em aberto com o plano atual. Conclua o pagamento ou aguarde o link expirar para trocar de plano.");
  }
  if (!desfazendo) {
    // Plano negociado: só o dono atribui (a tela da empresa nem o lista).
    if ((deps.origem ?? "empresa") === "empresa" && !novo.oferecido_ao_cliente) {
      return recusa(422, "plano_invalido", "Este plano não está disponível para troca. Fale com quem administra o sistema.");
    }
    const uso = await lerUsoDaOrganizacao(admin, orgId);
    if (!uso) return recusa(500, "internal_error", "Não foi possível medir o uso da empresa.");
    const excedente = excedenteDoPlano(uso, novo);
    if (Object.keys(excedente).length > 0) {
      return recusa(409, "plan_limit_reached", "O uso atual não cabe no plano escolhido.", { excedente });
    }
  }

  const provedorDaTroca = atual.provedor && atual.provedor_assinatura_id ? { provedor: atual.provedor, ref: atual.provedor_assinatura_id } : null;
  const aoProvedor = (p: Plano) =>
    (deps.adaptador ?? adaptadorPadrao)(provedorDaTroca!.provedor).trocarPlano({
      assinaturaRef: provedorDaTroca!.ref,
      plano: { id: p.id, nome: p.nome, precoCents: p.preco_cents, intervalo: p.intervalo },
    });
  // O preço no provedor tem de ser o do que o banco registra (agendado, senão o atual).
  // Relê a linha (outra troca pode ter vencido a corrida); se a leitura falha, vale o que líamos.
  // Devolve false quando não conseguiu desfazer: aí a divergência fica dita na resposta.
  const reconciliar = async (): Promise<boolean> => {
    let alvo = atual.plano_agendado_id ?? atual.plano_id;
    const { data: relida } = await admin
      .from("cobranca_assinaturas").select("plano_id, plano_agendado_id").eq("organization_id", orgId).maybeSingle();
    if (relida) alvo = (relida as Atual).plano_agendado_id ?? (relida as Atual).plano_id;
    const p = await lerPlanoCompleto(admin, alvo);
    if (!p || p === "erro") return false;
    try { await aoProvedor(p); return true; } catch { return false; }
  };
  const divergiu = "O preço no provedor de pagamento pode estar diferente do plano registrado; confira com quem administra o sistema.";

  // #2609 — a sessão de pagamento aberta expira NO PROVEDOR antes da escrita,
  // como todo chamado ao provedor (fora de transação, §7). Se ele não confirmar,
  // a troca NÃO segue: o link antigo continuaria vivo com o preço do plano velho,
  // que é exatamente o que a recusa `checkout_em_aberto` protegia. Transitório →
  // 503 (tente de novo); o resto → a mesma recusa de sempre (o link continua em aberto).
  if (sessaoAExperrar !== null) {
    try {
      await (deps.adaptador ?? adaptadorPadrao)(sessaoAExperrar.provedor).expirarSessao(sessaoAExperrar.id);
    } catch (e) {
      if (!(e instanceof ErroDoProvedor)) throw e;
      if (e.transitorio) {
        return recusa(503, "provedor_indisponivel", "O provedor de pagamento não respondeu. A troca não foi feita; tente de novo.");
      }
      return recusa(409, "checkout_em_aberto", "Há um link de pagamento em aberto com o plano atual. Conclua o pagamento ou aguarde o link expirar para trocar de plano.");
    }
  }

  // Upgrade durante um período pago: cobra a diferença pelo tempo restante e
  // só troca preço/limites quando o provedor confirma essa cobrança avulsa.
  if (!emTeste && novo.preco_cents > antigo.preco_cents && provedorDaTroca && atual.provedor_cliente_id) {
    if (atual.plano_troca_pendente_id === novo.id && atual.troca_status === "aguardando_pagamento" && atual.troca_pagamento_ref) {
      const ad = (deps.adaptador ?? adaptadorPadrao)(provedorDaTroca.provedor);
      const estadoDoPagamento = await ad.lerPagamentoProporcional(atual.troca_pagamento_ref);
      if (estadoDoPagamento !== "encerrado") {
        return { ok: true, changed: false, quando: "pagamento_pendente", planoId: atual.plano_id, planoAgendadoId: null, valeAPartirDe: null, de: atual.plano_id, urlPagamento: atual.troca_pagamento_url ?? undefined };
      }
      await admin.from("cobranca_assinaturas").update({ troca_id: null, plano_troca_pendente_id: null, troca_valor_cents: null,
        troca_status: null, troca_pagamento_ref: null, troca_pagamento_url: null, troca_reserva_ate: null })
        .eq("organization_id", orgId).eq("troca_id", atual.troca_id);
    }
    if (atual.troca_status === "criando" && atual.troca_reserva_ate && Date.parse(atual.troca_reserva_ate) > agora.getTime()) return recusa(409, "troca_em_preparo", "Estamos preparando o ajuste proporcional. Aguarde alguns segundos e tente novamente.");
    if (atual.troca_status === "criando" && atual.troca_id) {
      await admin.from("cobranca_assinaturas").update({ troca_id: null, plano_troca_pendente_id: null, troca_valor_cents: null,
        troca_status: null, troca_pagamento_ref: null, troca_pagamento_url: null, troca_reserva_ate: null })
        .eq("organization_id", orgId).eq("troca_id", atual.troca_id);
    }
    const valorCents = calcularAjusteProporcional({
      precoAtualCents: antigo.preco_cents,
      precoNovoCents: novo.preco_cents,
      periodoPagoDesde: atual.periodo_pago_desde ? new Date(atual.periodo_pago_desde) : null,
      proximoVencimento: atual.proximo_vencimento ? new Date(atual.proximo_vencimento) : null,
      agora,
    });
    if (valorCents === null) return recusa(409, "periodo_indisponivel", "Não foi possível calcular o período pago. Atualize a assinatura e tente novamente.");
    if (valorCents > 0) {
      const id = randomUUID();
      const { data: reserva, error: erroReserva } = await admin.from("cobranca_assinaturas").update({
        troca_id: id, plano_troca_pendente_id: novo.id, troca_valor_cents: valorCents,
        troca_status: "criando", troca_pagamento_ref: null, troca_pagamento_url: null,
        troca_reserva_ate: new Date(agora.getTime() + 120_000).toISOString(), updated_at: agora.toISOString(),
      }).eq("organization_id", orgId).eq("plano_id", atual.plano_id).is("troca_id", null).select("organization_id").maybeSingle();
      if (erroReserva || !reserva) return recusa(409, "troca_em_preparo", "A assinatura mudou enquanto você solicitava a troca. Atualize a página e tente novamente.");
      try {
        const pagamento = await (deps.adaptador ?? adaptadorPadrao)(provedorDaTroca.provedor).iniciarAjusteProporcional({
          clienteRef: atual.provedor_cliente_id, orgId, plano: { id: novo.id, nome: novo.nome, precoCents: novo.preco_cents, intervalo: novo.intervalo },
          valorCents, chaveIdempotencia: id, urlDeVolta: urlDoPainelDaEmpresa(),
        });
        await admin.from("cobranca_assinaturas").update({ troca_status: "aguardando_pagamento", troca_pagamento_ref: pagamento.pagamentoRef,
          troca_pagamento_url: pagamento.url, troca_reserva_ate: null, updated_at: agora.toISOString() }).eq("organization_id", orgId).eq("troca_id", id);
        return { ok: true, changed: false, quando: "pagamento_pendente", planoId: atual.plano_id, planoAgendadoId: null, valeAPartirDe: null, de: atual.plano_id, urlPagamento: pagamento.url };
      } catch (e) {
        await admin.from("cobranca_assinaturas").update({ troca_id: null, plano_troca_pendente_id: null, troca_valor_cents: null,
          troca_status: null, troca_pagamento_ref: null, troca_pagamento_url: null, troca_reserva_ate: null }).eq("organization_id", orgId).eq("troca_id", id);
        if (e instanceof ErroDoProvedor) return recusa(e.transitorio ? 503 : 502, e.transitorio ? "provedor_indisponivel" : "provedor_recusou", "Não foi possível gerar a cobrança proporcional. Tente novamente.");
        throw e;
      }
    }
  }

  if (provedorDaTroca) {
    try {
      await aoProvedor(novo);
    } catch (e) {
      if (!(e instanceof ErroDoProvedor)) throw e;
      if (e.codigo === "pagamento_do_periodo_pendente") {
        return recusa(
          409,
          "pagamento_do_periodo_pendente",
          'A mensalidade de agora ainda não foi paga. Pague em "Pagar agora" e troque de plano depois que o pagamento for confirmado (Pix: minutos; boleto: até 1 dia útil).',
        );
      }
      if (e.transitorio) {
        // A resposta pode ter se perdido com o preço já mudado: não afirme "nada mudou".
        const ok = await reconciliar();
        return recusa(503, "provedor_indisponivel", ok
          ? "O provedor de pagamento não respondeu. A troca não foi feita; tente de novo."
          : `O provedor de pagamento não respondeu e não foi possível confirmar a troca. ${divergiu}`);
      }
      return recusa(502, "provedor_recusou", "O provedor de pagamento recusou a troca.");
    }
  } else if (!emTeste) {
    return recusa(409, "state_conflict", "A assinatura ainda não foi criada no provedor. Conclua o pagamento antes de trocar.");
  }

  const campos = emTeste
    ? {
        plano_id: novo.id,
        plano_agendado_id: null,
        updated_at: agora.toISOString(),
        // O link em aberto sem assinatura foi EXPIRADO no provedor (#2609); o que
        // sobra sai junto, e o próximo "Assinar" parte do plano gravado. Com a
        // assinatura já no provedor (o Asaas a cria no Assinar), o provedor acabou de
        // pôr o preço novo na fatura aberta: o link é o mesmo e fica.
        ...(atual.checkout_url && !provedorDaTroca ? { checkout_url: null, checkout_expira_em: null, checkout_sessao_id: null } : {}),
      }
    : { plano_agendado_id: novo.id === atual.plano_id ? null : novo.id, updated_at: agora.toISOString() };
  let pedido = admin.from("cobranca_assinaturas").update(campos).eq("organization_id", orgId).eq("plano_id", atual.plano_id);
  pedido = atual.plano_agendado_id ? pedido.eq("plano_agendado_id", atual.plano_agendado_id) : pedido.is("plano_agendado_id", null);
  pedido = atual.provedor ? pedido.eq("provedor", atual.provedor) : pedido.is("provedor", null);
  // No teste grátis, o link (ou a reserva dele) gravado depois da leitura faz esta troca perder.
  if (emTeste) {
    pedido = atual.checkout_expira_em ? pedido.eq("checkout_expira_em", atual.checkout_expira_em) : pedido.is("checkout_expira_em", null);
  }
  const { data: gravada, error: erroDaGravacao } = await pedido.select("organization_id").maybeSingle();
  if (erroDaGravacao || !gravada) {
    // A sessão já morreu no provedor, mas a linha mudou no meio: o link local não
    // pode sobreviver apontando para uma sessão morta (o "Assinar" devolveria um
    // link morto). Limpa SÓ a linha que ainda carrega ESTA sessão — quem já gravou
    // outra não tem o que perder. Melhor esforço: a recusa abaixo vale sozinha.
    if (sessaoAExperrar) await limparSessaoExpirada(admin, orgId, sessaoAExperrar.id, agora);
    // O provedor já aceitou o preço novo e o banco não o registrou: desfaz no provedor.
    const desfeito = !provedorDaTroca || (await reconciliar());
    const aviso = desfeito ? "" : ` ${divergiu}`;
    return erroDaGravacao
      ? recusa(500, "internal_error", `Não foi possível trocar o plano.${aviso}`)
      : recusa(409, "state_conflict", `A assinatura mudou enquanto você trocava o plano. Recarregue e tente de novo.${aviso}`);
  }

  return emTeste
    ? { ok: true, changed: true, quando: "imediato", planoId: novo.id, planoAgendadoId: null, valeAPartirDe: null, de: atual.plano_id }
    : {
        ok: true, changed: true, quando: "agendado", planoId: atual.plano_id,
        planoAgendadoId: novo.id === atual.plano_id ? null : novo.id, valeAPartirDe: atual.proximo_vencimento, de: atual.plano_id,
      };
}
