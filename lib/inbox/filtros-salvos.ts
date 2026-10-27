import { z } from "zod";

import { PERIODOS, MAXIMO_DE_ETAPAS, SEM_RESPONSAVEL } from "@/lib/inbox/filtros-do-atendimento";
import { MAXIMO_DE_ETIQUETAS_NO_FILTRO, MODOS_DE_ETIQUETA } from "@/lib/inbox/marcador-da-conversa";
import { TIPOS_DE_CANAL } from "@/lib/inbox/tipo-de-canal";

/**
 * Filtros salvos do Inbox (migration 9079) e o filtro lembrado no navegador.
 *
 * Um schema só para os dois: a rota recusa jsonb livre com ele, e a leitura do
 * localStorage ignora o que não passa. A ABA e a BUSCA não entram: a aba mora na
 * URL, e um termo digitado é de agora, não de um filtro de uso diário.
 */

export const MAXIMO_DE_FILTROS_SALVOS = 20;
export const TAMANHO_DO_NOME = 40;

const uuid = z.string().uuid();
const etiqueta = z.string().min(1).max(100);

export const filtrosSalvosSchema = z
  .object({
    onlyUnread: z.boolean().optional(),
    onlyGroups: z.boolean().optional(),
    semPasso: z.boolean().optional(),
    channel_session_id: uuid.optional(),
    canal: z.enum(TIPOS_DE_CANAL).optional(),
    entrada: z.enum(["direct", "comentario"]).optional(),
    tag: z.union([etiqueta, z.array(etiqueta).max(MAXIMO_DE_ETIQUETAS_NO_FILTRO)]).optional(),
    tagMode: z.enum(MODOS_DE_ETIQUETA).optional(),
    atendimento: z
      .object({
        funil: uuid.optional(),
        etapas: z.array(uuid).max(MAXIMO_DE_ETAPAS).optional(),
        responsavel: z.union([uuid, z.literal(SEM_RESPONSAVEL)]).optional(),
        periodo: z.enum(PERIODOS).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export type FiltrosSalvos = z.infer<typeof filtrosSalvosSchema>;

export const criarFiltroSalvoSchema = z
  .object({
    nome: z.string().trim().min(1).max(TAMANHO_DO_NOME),
    filtros: filtrosSalvosSchema,
  })
  .strict();

/** Só o que está ligado: nada de `false`, vazio ou `undefined` (o que se compara e se guarda). */
export function normalizarFiltros(f: {
  onlyUnread?: boolean;
  onlyGroups?: boolean;
  semPasso?: boolean;
  channel_session_id?: string;
  canal?: string;
  entrada?: string;
  tag?: string | readonly string[];
  tagMode?: string;
  atendimento?: { funil?: string; etapas?: readonly string[]; responsavel?: string; periodo?: string };
}): FiltrosSalvos {
  const tags = f.tag === undefined ? [] : typeof f.tag === "string" ? [f.tag] : [...f.tag];
  const a = f.atendimento ?? {};
  const etapas = a.funil ? [...(a.etapas ?? [])] : [];
  const atendimento = {
    ...(a.funil ? { funil: a.funil } : {}),
    ...(etapas.length > 0 ? { etapas } : {}),
    ...(a.responsavel ? { responsavel: a.responsavel } : {}),
    ...(a.periodo ? { periodo: a.periodo } : {}),
  };
  const bruto = {
    ...(f.onlyUnread ? { onlyUnread: true } : {}),
    ...(f.onlyGroups ? { onlyGroups: true } : {}),
    ...(f.semPasso ? { semPasso: true } : {}),
    ...(f.channel_session_id ? { channel_session_id: f.channel_session_id } : {}),
    ...(f.canal ? { canal: f.canal } : {}),
    ...(f.entrada ? { entrada: f.entrada } : {}),
    ...(tags.length > 0 ? { tag: tags, ...(f.tagMode ? { tagMode: f.tagMode } : {}) } : {}),
    ...(Object.keys(atendimento).length > 0 ? { atendimento } : {}),
  };
  // O que o schema não reconhece (canal novo, período antigo) some em vez de gravar lixo.
  const lido = filtrosSalvosSchema.safeParse(bruto);
  return lido.success ? lido.data : {};
}

export const haFiltroAtivo = (f: Parameters<typeof normalizarFiltros>[0]): boolean =>
  Object.keys(normalizarFiltros(f)).length > 0;

const limparId = (id: string) => id.replace(/[^a-zA-Z0-9-]/g, "");

/** Uma chave por atendente e organização: o filtro de um (ou de outra empresa) não vaza. */
export const chaveDoFiltroLembrado = (usuarioId: string, orgId: string) =>
  `inbox_filtro:${limparId(usuarioId)}:${limparId(orgId)}`;

/** Lê o que o navegador guardou. Ausente, JSON quebrado ou forma fora do schema = `null`. */
export function lerFiltroLembrado(valor: string | null): FiltrosSalvos | null {
  if (!valor) return null;
  try {
    const r = filtrosSalvosSchema.safeParse(JSON.parse(valor));
    return r.success && Object.keys(r.data).length > 0 ? r.data : null;
  } catch {
    return null;
  }
}
