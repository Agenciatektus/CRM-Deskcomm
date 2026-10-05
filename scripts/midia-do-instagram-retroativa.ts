/**
 * Recuperar a mídia das mensagens do Instagram gravadas ANTES da #13 da
 * auditoria (77 na auditoria): a linha diz "tem anexo" e não guarda nada.
 *
 * O ponteiro da Meta não foi guardado na linha, mas o payload cru ficou em
 * `webhook_events_log` (provider `instagram`). Este script relê esse payload,
 * acha os anexos e TESTA cada ponteiro pelo mesmo download seguro do worker
 * (`baixarMidiaDaMeta`: allowlist da Meta, IP conferido, redirecionamento
 * validado, teto de bytes). O ponteiro é assinado e vence — o esperado é que a
 * maioria já não responda; o relatório diz quantos ainda dão.
 *
 *  - SIMULA por padrão: baixa para medir e descarta. Nada é gravado.
 *  - `--aplicar`: para o anexo que AINDA responde, devolve o ponteiro à linha
 *    EXISTENTE (`media_url`, tipo) e pede a persistência ao worker — o mesmo
 *    caminho da mensagem nova (miniatura, LGPD, compare-and-set inclusos).
 *  - NUNCA insere linha nova. INSERT inbound em `messages` dispara as triggers
 *    de atendimento (a IA voltaria a responder conversa antiga de cliente
 *    real). Só UPDATE de `media_url`/`type`/`metadata` na linha que já existe —
 *    nenhuma trigger de inbound escuta essas colunas
 *    (`tests/invariants/instagram-uma-linha-por-mensagem.test.ts`). Anexo extra
 *    e permalink entram no `metadata` da mesma linha, como no ingest.
 *  - Idempotente: só pega linha ainda sem `media_url` e sem arquivo, e o UPDATE
 *    exige que ela continue assim.
 *  - O que não responde fica como está: a tela já mostra "Mídia expirada".
 *
 * Uso (contêiner do worker):
 *   pnpm exec tsx scripts/midia-do-instagram-retroativa.ts            # simula
 *   pnpm exec tsx scripts/midia-do-instagram-retroativa.ts --aplicar [--org <uuid>] [--max 100]
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { lerAnexos, type AnexoDoInstagram, type AnexosLidos } from "../lib/channels/instagram/anexos";
import { baixarMidiaDaMeta } from "../lib/messaging/media/baixar-midia-da-meta";

export interface OpcoesDaRecuperacao {
  aplicar: boolean;
  max: number;
  org?: string;
  baixar?: (url: string) => Promise<{ buffer: Buffer; mime: string }>;
  log?: (linha: string) => void;
}

export interface Relatorio {
  mensagens: number;
  semPayload: number;
  anexos: number;
  respondem: number;
  vencidos: number;
  recuperadas: number;
  porTipo: Record<string, number>;
  porMotivo: Record<string, number>;
}

interface Linha {
  id: string;
  organization_id: string;
  conversation_id: string;
  contact_id: string;
  channel_session_id: string;
  external_id: string;
  sent_at: string;
  metadata: Record<string, unknown> | null;
}

function objeto(v: unknown): Record<string, unknown> | null {
  return typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

/** Os anexos do payload arquivado (envelope da Verdash → `evento.message.attachments`). */
export function anexosDoArquivo(payload: unknown): AnexosLidos {
  const mensagem = objeto(objeto(objeto(payload)?.evento)?.message);
  return lerAnexos(mensagem?.attachments);
}

export async function recuperarMidiaDoInstagram(
  admin: SupabaseClient,
  opcoes: OpcoesDaRecuperacao,
): Promise<Relatorio> {
  const log = opcoes.log ?? ((l: string) => console.info(l));
  const baixar = opcoes.baixar ?? ((url: string) => baixarMidiaDaMeta(url));
  const r: Relatorio = {
    mensagens: 0,
    semPayload: 0,
    anexos: 0,
    respondem: 0,
    vencidos: 0,
    recuperadas: 0,
    porTipo: {},
    porMotivo: {},
  };

  let q = admin
    .from("messages")
    .select("id, organization_id, conversation_id, contact_id, channel_session_id, external_id, sent_at, metadata")
    .eq("metadata->>instagram_tem_anexo", "true")
    .is("media_url", null)
    .is("media_storage_path", null)
    .order("sent_at", { ascending: false })
    .limit(opcoes.max);
  if (opcoes.org) q = q.eq("organization_id", opcoes.org);
  const { data, error } = await q;
  if (error) throw new Error(`ler mensagens: ${error.message}`);

  for (const m of (data ?? []) as Linha[]) {
    r.mensagens++;
    const { data: arquivo } = await admin
      .from("webhook_events_log")
      .select("payload_parsed")
      .eq("organization_id", m.organization_id)
      .eq("provider", "instagram")
      .eq("payload_parsed->>provider_message_id", m.external_id)
      .limit(1)
      .maybeSingle();
    const anexos = anexosDoArquivo((arquivo as { payload_parsed?: unknown } | null)?.payload_parsed);
    if (anexos.midias.length === 0 && anexos.links.length === 0) {
      r.semPayload++;
      continue;
    }

    // Só o PRIMEIRO arquivo pode voltar a ser baixado: é a única mídia que a
    // linha guarda. Os demais (e os permalinks) vão para o metadata.
    const [primeira, ...extras] = anexos.midias;
    let primeiraViva = false;
    for (const anexo of anexos.midias) {
      r.anexos++;
      r.porTipo[anexo.tipoNaMeta] = (r.porTipo[anexo.tipoNaMeta] ?? 0) + 1;
      if (anexo !== primeira) continue;
      try {
        await baixar(anexo.url);
        r.respondem++;
        primeiraViva = true;
      } catch (err) {
        r.vencidos++;
        const motivo = (err instanceof Error ? err.message : String(err)).split(":").slice(0, 2).join(":");
        r.porMotivo[motivo] = (r.porMotivo[motivo] ?? 0) + 1;
      }
    }
    if (!opcoes.aplicar) continue;
    if (!primeiraViva && anexos.links.length === 0) continue;
    if (await atualizarALinha(admin, m, primeiraViva ? primeira! : null, extras, anexos)) r.recuperadas++;
  }

  log(JSON.stringify(r));
  return r;
}

/**
 * UPDATE na linha que já existe — nunca INSERT (ver o cabeçalho). Compare-and-set:
 * só a linha que continua sem ponteiro e sem arquivo.
 */
async function atualizarALinha(
  admin: SupabaseClient,
  m: Linha,
  primeira: AnexoDoInstagram | null,
  extras: AnexoDoInstagram[],
  anexos: AnexosLidos,
): Promise<boolean> {
  const metadata = {
    ...(m.metadata ?? {}),
    ...(primeira ? { instagram_anexo_tipo: primeira.tipoNaMeta } : {}),
    ...(primeira && !primeira.tipoDaMensagem ? { tipo_pelo_mime: true } : {}),
    ...(extras.length > 0 ? { instagram_anexos_extras: extras.map((a) => ({ tipo: a.tipoNaMeta, url: a.url })) } : {}),
    ...(anexos.links.length > 0 ? { instagram_links: anexos.links } : {}),
    recuperada_por: "midia-do-instagram-retroativa",
  };
  const { data: mudadas, error } = await admin
    .from("messages")
    .update(
      primeira
        ? { media_url: primeira.url, type: primeira.tipoDaMensagem ?? "image", metadata }
        : { metadata },
    )
    .eq("id", m.id)
    .eq("organization_id", m.organization_id)
    .is("media_url", null)
    .is("media_storage_path", null)
    .select("id");
  if (error) throw new Error(`atualizar a linha: ${error.message}`);
  if ((mudadas ?? []).length === 0) return false;
  if (!primeira) return true;

  await admin.rpc("emit_event" as never, {
    p_event_type: "media.persist_requested",
    p_entity_kind: "message",
    p_entity_id: m.id,
    p_payload: { message_id: m.id, conversation_id: m.conversation_id },
    p_metadata: { source: "midia-do-instagram-retroativa" },
    p_organization_id: m.organization_id,
  } as never);
  return true;
}

async function principal(): Promise<void> {
  const argv = process.argv.slice(2);
  const valor = (n: string) => {
    const i = argv.indexOf(n);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const opcoes: OpcoesDaRecuperacao = {
    aplicar: argv.includes("--aplicar"),
    max: Math.min(Number(valor("--max") ?? 200) || 200, 1000),
    org: valor("--org"),
  };
  console.info(opcoes.aplicar ? "APLICANDO" : "SIMULAÇÃO (use --aplicar para gravar)");
  const { createAdminClient } = await import("../lib/supabase/admin");
  await recuperarMidiaDoInstagram(createAdminClient() as unknown as SupabaseClient, opcoes);
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("scripts/midia-do-instagram-retroativa.ts")) {
  principal().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
