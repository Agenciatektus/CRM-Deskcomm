/**
 * "ADICIONAR À CAMPANHA" — a barra em lote do Funil põe os contatos dos
 * negócios selecionados no público de uma campanha de disparo (fase 2
 * combinada com o Peterson, 21/10/2026).
 *
 * ═══ Onde a pessoa entra: `audience_filter.incluir_contatos` ═══
 *
 * O público da campanha é FILTRO, não lista (`lib/campanhas/audiencia.ts`), e a
 * lista de verdade (`campaign_recipients`) só nasce no Preparar, congelada com o
 * texto de cada um. O filtro já tem o campo dos "incluídos à mão"; é nele que
 * os contatos entram. Por isso só campanha em RASCUNHO aceita (`ehEditavel`,
 * a mesma régua do PATCH): depois do Preparar a lista está congelada, e
 * agendada ou rodando já não é a lista que o operador conferiu.
 *
 * Campanha de ENTRADA CONTÍNUA não aceita: ela não tem lista — aborda quem
 * chega na etapa (`lib/campanhas/entrada-continua.ts`).
 *
 * ═══ Quem fica de fora, e por quê ═══
 *
 * A confirmação diz quantos entram e quantos ficam de fora POR MOTIVO, com a
 * MESMA classificação da prévia e da preparação (`classificar`): opt-out, sem
 * telefone, telefone repetido, já em outra campanha, lista de exclusão etc.
 * Prévia que mede por outro caminho é prévia que mente. Mais os motivos que só
 * o lote tem: negócio sem contato, o mesmo contato em dois negócios, contato que
 * já estava incluído, e o teto de 5.000 incluídos do filtro.
 *
 * O TEXTO não entra na conta: a campanha em rascunho pode ainda nem ter
 * mensagem, e "falta um dado que a mensagem usa" é veto da preparação, que
 * roda de novo sobre todo mundo. Aqui só os vetos da PESSOA.
 *
 * Só quem entra é gravado. A preparação reconfere todos de qualquer forma —
 * o veto de hoje pode mudar até lá, e quem decide no fim é ela.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { buscaEmLotes } from "@/lib/supabase/em-lotes";

import { FILTRO_VAZIO, filtroDeAudienciaSchema, type FiltroDeAudiencia } from "./audiencia";
import { classificar } from "./preparacao";
import type { MotivoDeExclusao } from "./tipos";

/** O teto do filtro (`incluir_contatos` máx. 5.000). */
export const TETO_DE_INCLUIDOS = 5000;

export const MOTIVOS_DO_LOTE = [
  "negocio_nao_encontrado",
  "sem_contato",
  "repetido_na_selecao",
  "ja_na_campanha",
  "contato_indisponivel",
  "limite_da_campanha",
] as const;
export type MotivoDoLote = (typeof MOTIVOS_DO_LOTE)[number];
export type MotivoDeFora = MotivoDoLote | MotivoDeExclusao;

/** O que a tela lê. Espanhol pelo `traduzir()` da borda. */
export const TEXTO_DO_LOTE: Record<MotivoDoLote, string> = {
  negocio_nao_encontrado: "Negócio não encontrado (apagado ou de outro funil)",
  sem_contato: "Negócio sem contato",
  repetido_na_selecao: "Mesmo contato em mais de um negócio selecionado",
  ja_na_campanha: "Já estava nesta campanha",
  contato_indisponivel: "Contato indisponível (mesclado ou não é pessoa)",
  limite_da_campanha: "A campanha chegou ao limite de 5.000 incluídos",
};

/** Vetos do TEXTO, não da pessoa: não contam aqui (ver o cabeçalho). */
const MOTIVOS_DO_TEXTO: ReadonlySet<MotivoDeExclusao> = new Set(["variavel_ausente", "texto_vazio"]);

export interface ResumoDaInclusao {
  /** Contatos que entram (ordem da seleção). */
  entram: string[];
  /** Quantos ficaram de fora, por motivo. */
  fora: Partial<Record<MotivoDeFora, number>>;
}

/**
 * A conta do lote, PURA: negócios → contatos, com os motivos de quem não entra.
 * `vetoDoContato` é a classificação da pessoa (opt-out etc.): `null` = pode;
 * `undefined` = o contato não voltou da consulta (indisponível).
 */
export function resumirInclusao(entrada: {
  leadIds: readonly string[];
  contatoDoNegocio: ReadonlyMap<string, string | null>;
  jaIncluidos: readonly string[];
  vetoDoContato: ReadonlyMap<string, MotivoDeExclusao | null>;
}): ResumoDaInclusao {
  const fora: Partial<Record<MotivoDeFora, number>> = {};
  const somar = (m: MotivoDeFora) => {
    fora[m] = (fora[m] ?? 0) + 1;
  };
  const ja = new Set(entrada.jaIncluidos);
  const vistos = new Set<string>();
  const entram: string[] = [];
  let vagas = Math.max(0, TETO_DE_INCLUIDOS - ja.size);
  for (const leadId of new Set(entrada.leadIds)) {
    if (!entrada.contatoDoNegocio.has(leadId)) {
      somar("negocio_nao_encontrado");
      continue;
    }
    const contato = entrada.contatoDoNegocio.get(leadId);
    if (!contato) {
      somar("sem_contato");
      continue;
    }
    if (vistos.has(contato)) {
      somar("repetido_na_selecao");
      continue;
    }
    vistos.add(contato);
    if (ja.has(contato)) {
      somar("ja_na_campanha");
      continue;
    }
    if (!entrada.vetoDoContato.has(contato)) {
      somar("contato_indisponivel");
      continue;
    }
    const veto = entrada.vetoDoContato.get(contato);
    if (veto && !MOTIVOS_DO_TEXTO.has(veto)) {
      somar(veto);
      continue;
    }
    if (vagas === 0) {
      somar("limite_da_campanha");
      continue;
    }
    vagas -= 1;
    entram.push(contato);
  }
  return { entram, fora };
}

/**
 * O filtro guardado, com os defaults, SEM o `refine` de "pelo menos um
 * critério": a campanha recém-criada guarda o filtro vazio, que não passa no
 * refine — e é justamente nela que a inclusão é o primeiro critério. `null` =
 * o guardado não tem a forma de filtro (não se sobrescreve o que não se lê).
 */
export function filtroParaIncluir(guardado: unknown): FiltroDeAudiencia | null {
  if (guardado === null || guardado === undefined) return { ...FILTRO_VAZIO };
  if (typeof guardado !== "object" || Array.isArray(guardado)) return null;
  const base = { ...FILTRO_VAZIO, ...(guardado as Record<string, unknown>) };
  // Sem incluído nenhum, um provisório atravessa o refine (e sai logo abaixo);
  // com incluídos, o refine já passa por eles.
  const semIncluidos = !Array.isArray(base.incluir_contatos) || base.incluir_contatos.length === 0;
  const tentativa = filtroDeAudienciaSchema.safeParse(
    semIncluidos ? { ...base, incluir_contatos: [PROVISORIO] } : base,
  );
  if (!tentativa.success) return null;
  return semIncluidos ? { ...tentativa.data, incluir_contatos: [] } : tentativa.data;
}

const PROVISORIO = "00000000-0000-4000-8000-000000000000";

/** Lê os negócios (da organização) e classifica os contatos com a régua da preparação. */
export async function conferirInclusao(
  admin: SupabaseClient,
  entrada: {
    organizationId: string;
    campanhaId: string;
    filtro: FiltroDeAudiencia;
    leadIds: string[];
    agora: Date;
  },
): Promise<ResumoDaInclusao> {
  const { data: negocios, error } = await buscaEmLotes<{ id: string; contact_id: string | null }>(
    entrada.leadIds,
    async (lote) => {
      const r = await admin
        .from("crm_leads")
        .select("id, contact_id")
        .eq("organization_id", entrada.organizationId)
        .in("id", lote);
      return { data: (r.data ?? null) as Array<{ id: string; contact_id: string | null }> | null, error: r.error };
    },
  );
  if (error) throw new Error(`incluir: negócios — ${error.message}`);
  const contatoDoNegocio = new Map(negocios.map((n) => [n.id, n.contact_id]));

  const ja = new Set(entrada.filtro.incluir_contatos);
  const novos = [...new Set(negocios.map((n) => n.contact_id).filter((c): c is string => !!c && !ja.has(c)))];
  const vetoDoContato = new Map<string, MotivoDeExclusao | null>();
  if (novos.length > 0) {
    const { linhas } = await classificar(admin, {
      organizationId: entrada.organizationId,
      // SÓ os novos, com as exclusões à mão da campanha: o recorte dela não
      // entra (não é a pergunta) e o `temRecorte` garante que a base inteira
      // também não.
      filtro: {
        ...FILTRO_VAZIO,
        incluir_contatos: novos,
        excluir_contatos: entrada.filtro.excluir_contatos,
        limite: TETO_DE_INCLUIDOS,
      },
      // Texto neutro: os vetos do TEXTO são da preparação (ver o cabeçalho).
      corpo: ".",
      agora: entrada.agora,
      campanhaId: entrada.campanhaId,
    });
    for (const l of linhas) vetoDoContato.set(l.candidato.contactId, l.elegivel ? null : l.motivo);
  }
  return resumirInclusao({
    leadIds: entrada.leadIds,
    contatoDoNegocio,
    jaIncluidos: entrada.filtro.incluir_contatos,
    vetoDoContato,
  });
}
