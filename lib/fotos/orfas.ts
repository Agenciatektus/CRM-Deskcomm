/**
 * A LIMPEZA DAS FOTOS ÓRFÃS do bucket `fotos-de-perfil` (migration 9061).
 *
 * As rotas de foto já apagam a anterior ao trocar e ao remover
 * (`lib/fotos/servidor.ts`, `apagarFoto`). Sobram três caminhos em que um
 * arquivo fica sem dono, e nenhum deles passa por rota de foto:
 *
 *   1. UPLOAD SIMULTÂNEO: duas trocas ao mesmo tempo leem o mesmo "anterior",
 *      as duas sobem, e só a última fica no ponteiro — a outra é órfã;
 *   2. CONTA EXCLUÍDA: o usuário sai do GoTrue e a pasta `usuarios/<id>/` fica;
 *   3. ORGANIZAÇÃO EXCLUÍDA: a linha sai de `organizations` e a pasta
 *      `organizacoes/<id>/` fica.
 *
 * Quem decide é o PONTEIRO: um arquivo da pasta de um dono que não é o
 * `avatar_path` (pessoa) ou o `foto_path` (organização) dele é órfão, e dono
 * que não existe mais não tem ponteiro nenhum.
 *
 * ── O que esta limpeza NÃO faz, de propósito ─────────────────────────────────
 *
 *  - Não ESCREVE no banco: só lê o ponteiro e apaga no Storage.
 *  - Não apaga arquivo NOVO: dentro da CARÊNCIA (1 h) um upload pode estar entre
 *    "subiu" e "gravou o ponteiro" (`app/api/v1/perfil/foto/route.ts`), e
 *    apagá-lo ali deixaria o ponteiro apontando para o nada.
 *  - Não apaga quando a pergunta sobre o dono FALHOU (rede, banco): dúvida não
 *    vira exclusão. Só "não existe" (404 do GoTrue, linha ausente) conta.
 *  - Não toca nome fora da forma `<uuid>.<png|jpg|webp>`: não foi uma rota de
 *    foto que o gravou, e não é esta limpeza que vai julgar.
 *
 * Idempotente: a segunda rodada não acha o que a primeira apagou. Com teto
 * (`maxRemocoes`, `maxPastas`): o que sobrar fica para a próxima rodada.
 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

import { logger } from "@/lib/logger";

import { BUCKET_DE_FOTOS, PREFIXO_DE_ORGANIZACOES, PREFIXO_DE_USUARIOS } from "./foto";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const NOME_DE_FOTO = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(?:png|jpg|webp)$/;

/** Um arquivo mais novo que isto pode ser um upload no meio do caminho. */
export const CARENCIA_DA_FOTO_MS = 60 * 60 * 1000;
const PAGINA_DO_STORAGE = 1000;
const LOTE_DE_REMOCAO = 100;
const LOTE_DE_CONSULTA = 100;

export interface ResultadoDaLimpeza {
  /** Pastas de dono examinadas (pessoa + organização). */
  pastas: number;
  /** Arquivos olhados dentro delas. */
  arquivos: number;
  removidos: number;
  /** Bateu num teto: sobrou trabalho para a próxima rodada. */
  truncado: boolean;
  /** Donos cuja pergunta falhou (nada foi apagado deles). */
  duvidas: number;
}

type Arquivo = { name: string; id: string | null; created_at?: string | null };

/** Dono → ponteiro. `undefined` = dono não existe; `null` = existe sem foto; ausente do mapa = não deu para saber. */
type Ponteiros = Map<string, string | null | undefined>;

async function listar(admin: SupabaseClient, prefixo: string, maximo: number): Promise<Arquivo[] | null> {
  const todos: Arquivo[] = [];
  for (let offset = 0; todos.length < maximo; offset += PAGINA_DO_STORAGE) {
    const { data, error } = await admin.storage
      .from(BUCKET_DE_FOTOS)
      .list(prefixo, { limit: PAGINA_DO_STORAGE, offset, sortBy: { column: "name", order: "asc" } });
    if (error) {
      logger.warn("[fotos-orfas] listagem falhou", { prefixo, detalhe: error.message });
      return null;
    }
    const pagina = (data ?? []) as Arquivo[];
    todos.push(...pagina);
    if (pagina.length < PAGINA_DO_STORAGE) break;
  }
  return todos.slice(0, maximo);
}

/** O `avatar_path` de cada pessoa, pela admin API do GoTrue (o ponteiro mora no `app_metadata`). */
async function ponteirosDePessoas(admin: SupabaseClient, ids: string[]): Promise<Ponteiros> {
  const mapa: Ponteiros = new Map();
  for (const id of ids) {
    const { data, error } = await admin.auth.admin.getUserById(id);
    if (error) {
      // Só o 404 é "a conta não existe mais". Qualquer outro erro é dúvida.
      if ((error as { status?: number }).status === 404) mapa.set(id, undefined);
      continue;
    }
    const valor = (data?.user?.app_metadata as Record<string, unknown> | undefined)?.avatar_path;
    mapa.set(id, typeof valor === "string" ? valor : null);
  }
  return mapa;
}

/** O `foto_path` de cada organização. Linha ausente = organização excluída. */
async function ponteirosDeOrganizacoes(admin: SupabaseClient, ids: string[]): Promise<Ponteiros> {
  const mapa: Ponteiros = new Map();
  for (let i = 0; i < ids.length; i += LOTE_DE_CONSULTA) {
    const lote = ids.slice(i, i + LOTE_DE_CONSULTA);
    const { data, error } = await admin.from("organizations").select("id, foto_path").in("id", lote);
    if (error) {
      logger.warn("[fotos-orfas] leitura das organizações falhou", { detalhe: error.message });
      continue; // o lote inteiro fica em dúvida
    }
    const achadas = new Map(
      ((data ?? []) as Array<{ id: string; foto_path: string | null }>).map((o) => [o.id, o.foto_path]),
    );
    for (const id of lote) mapa.set(id, achadas.has(id) ? (achadas.get(id) ?? null) : undefined);
  }
  return mapa;
}

/** Os caminhos órfãos de uma pasta de dono. Puro — é o coração da regra. */
export function orfasDaPasta(
  prefixoDoDono: string,
  arquivos: readonly Arquivo[],
  ponteiro: string | null | undefined,
  agora: Date,
): string[] {
  const limite = agora.getTime() - CARENCIA_DA_FOTO_MS;
  return arquivos
    .filter((a) => a.id !== null && NOME_DE_FOTO.test(a.name))
    .filter((a) => {
      const criado = a.created_at ? Date.parse(a.created_at) : Number.NaN;
      // Sem data não há como provar que passou da carência: fica.
      return Number.isFinite(criado) && criado < limite;
    })
    .map((a) => `${prefixoDoDono}${a.name}`)
    .filter((caminho) => caminho !== (ponteiro ?? "").trim());
}

export async function limparFotosOrfas(
  admin: SupabaseClient,
  opcoes: { agora: Date; maxRemocoes?: number; maxPastas?: number },
): Promise<ResultadoDaLimpeza> {
  const maxRemocoes = opcoes.maxRemocoes ?? 500;
  const maxPastas = opcoes.maxPastas ?? 1000;
  const r: ResultadoDaLimpeza = { pastas: 0, arquivos: 0, removidos: 0, truncado: false, duvidas: 0 };
  const aRemover: string[] = [];

  const raizes = [
    { prefixo: PREFIXO_DE_USUARIOS, ponteiros: ponteirosDePessoas },
    { prefixo: PREFIXO_DE_ORGANIZACOES, ponteiros: ponteirosDeOrganizacoes },
  ];
  for (const raiz of raizes) {
    if (aRemover.length >= maxRemocoes) break;
    // `list("usuarios")` devolve as PASTAS (id nulo) — uma por dono.
    const entradas = await listar(admin, raiz.prefixo.slice(0, -1), maxPastas + 1);
    if (!entradas) {
      r.duvidas += 1;
      continue;
    }
    const donos = entradas.filter((e) => e.id === null && UUID.test(e.name)).map((e) => e.name);
    if (donos.length > maxPastas) {
      r.truncado = true;
      donos.length = maxPastas;
    }
    const ponteiros = await raiz.ponteiros(admin, donos);
    for (const dono of donos) {
      if (aRemover.length >= maxRemocoes) {
        r.truncado = true;
        break;
      }
      r.pastas += 1;
      if (!ponteiros.has(dono)) {
        r.duvidas += 1;
        continue;
      }
      const prefixoDoDono = `${raiz.prefixo}${dono}/`;
      const arquivos = await listar(admin, prefixoDoDono.slice(0, -1), PAGINA_DO_STORAGE);
      if (!arquivos) {
        r.duvidas += 1;
        continue;
      }
      r.arquivos += arquivos.filter((a) => a.id !== null).length;
      for (const caminho of orfasDaPasta(prefixoDoDono, arquivos, ponteiros.get(dono), opcoes.agora)) {
        if (aRemover.length >= maxRemocoes) {
          r.truncado = true;
          break;
        }
        aRemover.push(caminho);
      }
    }
  }

  for (let i = 0; i < aRemover.length; i += LOTE_DE_REMOCAO) {
    const lote = aRemover.slice(i, i + LOTE_DE_REMOCAO);
    const { error } = await admin.storage.from(BUCKET_DE_FOTOS).remove(lote);
    if (error) {
      logger.warn("[fotos-orfas] remoção falhou; fica para a próxima rodada", { detalhe: error.message });
      r.truncado = true;
      break;
    }
    r.removidos += lote.length;
  }
  return r;
}
