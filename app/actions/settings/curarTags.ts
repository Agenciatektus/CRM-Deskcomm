"use server";

/**
 * CURADORIA DO VOCABULÁRIO DE ETIQUETAS — as cinco escritas da migration 9005.
 *
 * ⚠️ PELO CLIENT DA SESSÃO, e nunca `.from("organizations").update(...)`: a
 * única policy de escrita de `organizations` é de platform admin, e o UPDATE de
 * um admin de tenant casa ZERO linhas e devolve SUCESSO — a tela diria "salvo"
 * sobre coisa nenhuma. As RPCs são `security definer` e conferem papel, suporte
 * e MFA por dentro, pelo `auth.uid()`, que o admin client não tem.
 *
 * ⚠️ O PAPEL É CONFERIDO DUAS VEZES, e só a segunda é autoridade: aqui (para
 * não chamar a RPC à toa, e para a tela poder esconder o que seria recusado) e
 * no corpo da função SQL, que decide. Esconder o que a ação recusaria é
 * honestidade, não permissão nova — a mesma frase que `pipelines/page.tsx` já
 * escreve sobre o editor de vocabulário do funil.
 *
 * O `organization_id` vem de `resolveActiveOrg`, NUNCA de argumento — Server
 * Action é endpoint público, e o tipo do parâmetro não chega ao servidor.
 *
 * ─── OS DOIS PAPÉIS ─────────────────────────────────────────────────────────
 *
 * manager ... criar, arquivar. Não tocam conversa nem contato; o custo de um
 *             clique errado é uma sugestão a mais na lista.
 * admin ..... renomear, mesclar, apagar. As três reescrevem `tags` em massa e
 *             nenhuma tem desfazer.
 *
 * É a régua que a casa já aplicou duas vezes: `fn_agenda_settings` é manager
 * porque é configuração reversível que não reescreve dado;
 * `fn_definir_cliente_pela_agenda` é admin porque "ligar reescreve as etiquetas
 * de todo contato com histórico, e desligar não desfaz".
 */
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { audit } from "@/lib/audit";
import type { AuditAction } from "@/lib/audit/actions";
import { loadAuthUser, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK, type Role } from "@/lib/auth/types";
import { supportWriteError } from "@/lib/impersonate/support";
import { logger } from "@/lib/logger";
import {
  erroDeCuradoria,
  escopoDeTagSchema,
  nomeDeTagSchema,
  type EscopoDeTag,
  type RespostaDeCuradoria,
} from "@/lib/schemas/tags";
import { createClient } from "@/lib/supabase/server";

/** O que toda RPC de escrita devolve. Validado: é o número que a tela mostra. */
const corpoSchema = z.object({
  mudou: z.boolean(),
  registros: z.coerce.number().int().nonnegative().default(0),
  motivo: z.string().optional(),
});

type Sessao = { userId: string; orgId: string };

/**
 * O preâmbulo das cinco, escrito uma vez.
 *
 * Repetido cinco vezes, é a quinta cópia que esquece o `supportWriteError` — e
 * uma sessão de acompanhamento de suporte passaria a escrever no vocabulário do
 * cliente, que é justamente o que aquele modo promete não fazer.
 *
 * ⚠️ RECEBE O `user` JÁ RESOLVIDO, e não o resolve por dentro. A primeira versão
 * chamava `loadAuthUser()` aqui, o que funcionava e era invisível para
 * `tests/unit/server-action-valida-sessao.test.ts`: aquele gate procura o nome
 * de um portão no corpo do PRÓPRIO export, e um wrapper o escondia — as cinco
 * apareceram na lista de "Server Action sem portão de sessão".
 *
 * O gate está certo em ser literal. Ele existe porque `dadosDoPasso` nasceu
 * correta na cabeça de quem a escreveu e errada no protocolo HTTP, e um gate que
 * aceitasse "confie, o helper valida" não teria pego aquilo. Deixar
 * `await loadAuthUser()` visível em cada action é o preço, e é barato.
 */
async function abrirSessao(
  user: Awaited<ReturnType<typeof loadAuthUser>>,
  min: Role,
): Promise<Sessao | { erro: RespostaDeCuradoria }> {
  if (!user) return { erro: { ok: false, erro: "sessao" } };
  if (supportWriteError(user.support)) return { erro: { ok: false, erro: "somente_leitura" } };
  const org = await resolveActiveOrg(user);
  if (!org) return { erro: { ok: false, erro: "sem_empresa" } };
  if (ROLE_RANK[org.role] < ROLE_RANK[min]) return { erro: { ok: false, erro: "sem_permissao" } };
  return { userId: user.id, orgId: org.orgId };
}

function ehErro(s: Sessao | { erro: RespostaDeCuradoria }): s is { erro: RespostaDeCuradoria } {
  return "erro" in s;
}

/**
 * Invalida o LAYOUT, e não só esta página: o seletor de etiquetas do Inbox lê o
 * vocabulário, e sem invalidar o layout a palavra recém-criada só apareceria
 * para o atendente no próximo recarregamento completo do app.
 */
function recarregar() {
  revalidatePath("/app/settings/tenant/tags");
  revalidatePath("/app", "layout");
}

async function chamar(
  sessao: Sessao,
  fn: string,
  args: Record<string, unknown>,
  acao: AuditAction,
): Promise<RespostaDeCuradoria> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(fn, { p_org: sessao.orgId, ...args });

  if (error) {
    const erro = erroDeCuradoria(error.code, error.message);
    // `falha` é o único desfecho que ninguém previu. Os outros são decisões do
    // domínio (recusa por papel, destino repetido, etiqueta reservada) e não
    // merecem ruído no log de erro — log que grita a cada recusa esperada é log
    // que ninguém lê quando acontece a que importa.
    if (erro === "falha") {
      logger.error(`[curar-tags] ${fn} falhou`, {
        organization_id: sessao.orgId,
        code: error.code,
        error: error.message,
      });
    }
    return { ok: false, erro };
  }

  const corpo = corpoSchema.safeParse(data);
  if (!corpo.success) {
    logger.error(`[curar-tags] ${fn} devolveu um corpo inesperado`, {
      organization_id: sessao.orgId,
    });
    return { ok: false, erro: "falha" };
  }

  if (corpo.data.mudou) {
    await audit({
      action: acao,
      actorUserId: sessao.userId,
      organizationId: sessao.orgId,
      resourceType: "organization",
      resourceId: sessao.orgId,
      metadata: { ...args, registros: corpo.data.registros },
    });
    recarregar();
  }
  return { ok: true, registros: corpo.data.registros, motivo: corpo.data.motivo };
}

/** Valida o par (escopo, nome) que toda ação recebe. Server Action é endpoint público. */
function lerAlvo(escopo: unknown, tag: unknown): { escopo: EscopoDeTag; tag: string } | null {
  const e = escopoDeTagSchema.safeParse(escopo);
  const t = nomeDeTagSchema.safeParse(tag);
  return e.success && t.success ? { escopo: e.data, tag: t.data } : null;
}

// ─── manager ────────────────────────────────────────────────────────────────

export async function criarTag(escopo: unknown, tag: unknown): Promise<RespostaDeCuradoria> {
  const alvo = lerAlvo(escopo, tag);
  if (!alvo) return { ok: false, erro: "nome_invalido" };
  const s = await abrirSessao(await loadAuthUser(), "manager");
  if (ehErro(s)) return s.erro;
  return chamar(s, "fn_tags_criar", { p_escopo: alvo.escopo, p_tag: alvo.tag }, "tags.criada");
}

export async function arquivarTag(
  escopo: unknown,
  tag: unknown,
  arquivar: unknown,
): Promise<RespostaDeCuradoria> {
  const alvo = lerAlvo(escopo, tag);
  const flag = z.boolean().safeParse(arquivar);
  if (!alvo || !flag.success) return { ok: false, erro: "nome_invalido" };
  const s = await abrirSessao(await loadAuthUser(), "manager");
  if (ehErro(s)) return s.erro;
  return chamar(
    s,
    "fn_tags_arquivar",
    { p_escopo: alvo.escopo, p_tag: alvo.tag, p_arquivar: flag.data },
    flag.data ? "tags.arquivada" : "tags.desarquivada",
  );
}

// ─── admin ──────────────────────────────────────────────────────────────────

export async function renomearTag(
  escopo: unknown,
  de: unknown,
  para: unknown,
): Promise<RespostaDeCuradoria> {
  const alvo = lerAlvo(escopo, de);
  const destino = nomeDeTagSchema.safeParse(para);
  if (!alvo || !destino.success) return { ok: false, erro: "nome_invalido" };
  const s = await abrirSessao(await loadAuthUser(), "admin");
  if (ehErro(s)) return s.erro;
  return chamar(
    s,
    "fn_tags_renomear",
    { p_escopo: alvo.escopo, p_de: alvo.tag, p_para: destino.data },
    "tags.renomeada",
  );
}

export async function mesclarTags(
  escopo: unknown,
  origens: unknown,
  destino: unknown,
): Promise<RespostaDeCuradoria> {
  const e = escopoDeTagSchema.safeParse(escopo);
  const o = z.array(nomeDeTagSchema).min(1).max(50).safeParse(origens);
  const d = nomeDeTagSchema.safeParse(destino);
  if (!e.success || !o.success || !d.success) return { ok: false, erro: "nome_invalido" };
  const s = await abrirSessao(await loadAuthUser(), "admin");
  if (ehErro(s)) return s.erro;
  return chamar(
    s,
    "fn_tags_mesclar",
    { p_escopo: e.data, p_origens: o.data, p_destino: d.data },
    "tags.mesclada",
  );
}

export async function apagarTag(escopo: unknown, tag: unknown): Promise<RespostaDeCuradoria> {
  const alvo = lerAlvo(escopo, tag);
  if (!alvo) return { ok: false, erro: "nome_invalido" };
  const s = await abrirSessao(await loadAuthUser(), "admin");
  if (ehErro(s)) return s.erro;
  return chamar(s, "fn_tags_apagar", { p_escopo: alvo.escopo, p_tag: alvo.tag }, "tags.apagada");
}
