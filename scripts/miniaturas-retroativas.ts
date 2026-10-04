/**
 * Preenchimento RETROATIVO das miniaturas de imagem (migration 9033).
 *
 * Mensagem de imagem salva antes da 9033 não tem `media_thumb_path` e a tela usa
 * a original — funciona, só pesa. Este script gera a miniatura dessas linhas.
 *
 * Seguro para produção, de propósito:
 *  - SIMULA por padrão. Só grava com `--aplicar`.
 *  - Lotes pequenos (`--lote`, padrão 20) com pausa entre eles (`--pausa-ms`,
 *    padrão 1000) e teto por rodada (`--max`, padrão 500): não disputa CPU nem
 *    banda com o atendimento.
 *  - IDEMPOTENTE: só pega linha com `media_thumb_path` nulo, e a gravação exige
 *    que a linha AINDA esteja assim e com a MESMA original. Rodar duas vezes não
 *    refaz nada; parar no meio e rodar de novo continua de onde ficou.
 *  - Se a original sumiu no meio (poda, LGPD), a miniatura recém-subida é
 *    apagada: nada fica no bucket sem linha que aponte para ele.
 *  - Imagem que não gera miniatura (já pequena, tipo sem miniatura) é pulada;
 *    `--depois-de` retoma a varredura a partir do cursor que a rodada imprime.
 *
 * Uso (no contêiner do worker, que tem o `sharp` e as variáveis do Supabase):
 *   pnpm exec tsx scripts/miniaturas-retroativas.ts                 # simula
 *   pnpm exec tsx scripts/miniaturas-retroativas.ts --aplicar --lote 20 --max 500
 *   pnpm exec tsx scripts/miniaturas-retroativas.ts --aplicar --org <uuid>
 *   pnpm exec tsx scripts/miniaturas-retroativas.ts --aplicar --depois-de '<created_at>|<id>'
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  MIMES_COM_MINIATURA,
  caminhoDaMiniatura,
  gerarMiniatura,
} from "../lib/messaging/media/miniatura";

const BUCKET = "whatsapp-media";

export interface OpcoesDoRetroativo {
  aplicar: boolean;
  lote: number;
  max: number;
  pausaMs: number;
  org?: string;
  depoisDe?: { createdAt: string; id: string };
  log?: (linha: string) => void;
}

export interface ResultadoDoRetroativo {
  lidas: number;
  geradas: number;
  puladas: number;
  falhas: number;
  cursor: string | null;
}

interface Linha {
  id: string;
  organization_id: string;
  conversation_id: string;
  media_storage_path: string;
  media_mime: string | null;
  created_at: string;
}

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function preencherMiniaturas(
  admin: SupabaseClient,
  opcoes: OpcoesDoRetroativo,
): Promise<ResultadoDoRetroativo> {
  const log = opcoes.log ?? ((l: string) => console.info(l));
  const r: ResultadoDoRetroativo = { lidas: 0, geradas: 0, puladas: 0, falhas: 0, cursor: null };
  let cursor = opcoes.depoisDe ?? null;

  while (r.lidas < opcoes.max) {
    let q = admin
      .from("messages")
      .select("id, organization_id, conversation_id, media_storage_path, media_mime, created_at")
      .eq("type", "image")
      .not("media_storage_path", "is", null)
      .is("media_thumb_path", null)
      .in("media_mime", [...MIMES_COM_MINIATURA])
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(Math.min(opcoes.lote, opcoes.max - r.lidas));
    if (opcoes.org) q = q.eq("organization_id", opcoes.org);
    if (cursor) {
      q = q.or(`created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`);
    }
    const { data, error } = await q;
    if (error) throw new Error(`ler mensagens: ${error.message}`);
    const linhas = (data ?? []) as Linha[];
    if (linhas.length === 0) break;

    for (const m of linhas) {
      r.lidas++;
      cursor = { createdAt: m.created_at, id: m.id };
      try {
        const feito = await umaMiniatura(admin, m, opcoes.aplicar);
        if (feito) r.geradas++;
        else r.puladas++;
      } catch (err) {
        r.falhas++;
        log(`falha ${m.id}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    r.cursor = cursor ? `${cursor.createdAt}|${cursor.id}` : null;
    log(`lote: lidas=${r.lidas} geradas=${r.geradas} puladas=${r.puladas} falhas=${r.falhas} cursor=${r.cursor}`);
    if (linhas.length < opcoes.lote) break;
    await dormir(opcoes.pausaMs);
  }
  return r;
}

async function umaMiniatura(admin: SupabaseClient, m: Linha, aplicar: boolean): Promise<boolean> {
  const { data: blob, error: baixarErr } = await admin.storage.from(BUCKET).download(m.media_storage_path);
  if (baixarErr || !blob) throw new Error(`baixar original: ${baixarErr?.message ?? "vazio"}`);
  const original = new Uint8Array(await blob.arrayBuffer());
  const miniatura = await gerarMiniatura(original, m.media_mime);
  if (!miniatura) return false;
  if (!aplicar) return true;

  const caminho = caminhoDaMiniatura(m.organization_id, m.conversation_id, m.id);
  const { error: subirErr } = await admin.storage
    .from(BUCKET)
    .upload(caminho, miniatura, { contentType: "image/webp", upsert: true });
  if (subirErr) throw new Error(`subir miniatura: ${subirErr.message}`);

  // Só grava se a linha AINDA está sem miniatura e com a MESMA original.
  const { data: gravadas, error: gravarErr } = await admin
    .from("messages")
    .update({ media_thumb_path: caminho })
    .eq("id", m.id)
    .eq("organization_id", m.organization_id)
    .eq("media_storage_path", m.media_storage_path)
    .is("media_thumb_path", null)
    .select("id");
  if (gravarErr) throw new Error(`gravar caminho: ${gravarErr.message}`);
  if ((gravadas ?? []).length === 0) {
    // A original saiu (ou outra rodada gravou antes): não deixa arquivo sem dono.
    await admin.storage.from(BUCKET).remove([caminho]);
    return false;
  }
  return true;
}

function lerOpcoes(argv: string[]): OpcoesDoRetroativo {
  const valor = (nome: string) => {
    const i = argv.indexOf(nome);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const numero = (nome: string, padrao: number) => {
    const v = Number(valor(nome) ?? padrao);
    if (!Number.isFinite(v) || v <= 0) throw new Error(`${nome} precisa ser número positivo`);
    return v;
  };
  const depois = valor("--depois-de");
  const [createdAt, id] = depois ? depois.split("|") : [];
  return {
    aplicar: argv.includes("--aplicar"),
    lote: Math.min(numero("--lote", 20), 200),
    max: numero("--max", 500),
    pausaMs: numero("--pausa-ms", 1000),
    org: valor("--org"),
    depoisDe: createdAt && id ? { createdAt, id } : undefined,
  };
}

async function principal(): Promise<void> {
  const opcoes = lerOpcoes(process.argv.slice(2));
  const { createAdminClient } = await import("../lib/supabase/admin");
  console.info(
    `${opcoes.aplicar ? "APLICANDO" : "SIMULAÇÃO (use --aplicar para gravar)"} — lote=${opcoes.lote} max=${opcoes.max}` +
      (opcoes.org ? ` org=${opcoes.org}` : ""),
  );
  const r = await preencherMiniaturas(createAdminClient() as unknown as SupabaseClient, opcoes);
  console.info(JSON.stringify(r));
  if (r.cursor) console.info(`Para continuar: --depois-de '${r.cursor}'`);
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("scripts/miniaturas-retroativas.ts")) {
  principal().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
