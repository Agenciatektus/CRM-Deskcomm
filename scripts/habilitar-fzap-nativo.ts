/**
 * HABILITA (ou desabilita) o modo nativo do FZAP numa organização: grava a pasta
 * do FZAP e o token dela, CIFRADO, em `verdash_fzap_pastas`. A existência da
 * linha é o que liga o botão "Conectar por QR" da organização.
 *
 * O token da pasta vem SÓ de `FZAP_PASTA_TOKEN` (ambiente): nunca por argumento
 * (iria para o histórico do shell e para a lista de processos), nunca impresso.
 * O CRM não usa nem guarda o ADMIN_TOKEN do FZAP.
 *
 * Uso (DRY-RUN é o padrão; só `--aplicar` escreve):
 *
 *   FZAP_PASTA_TOKEN=... tsx --env-file=.env scripts/habilitar-fzap-nativo.ts \
 *     --org <uuid> --pasta <id-da-pasta-no-fzap> [--aplicar]
 *
 *   tsx --env-file=.env scripts/habilitar-fzap-nativo.ts --desabilitar --org <uuid> [--aplicar]
 *
 * Runbook: docs/runbooks/fzap-pastas-e-habilitar-org-crm.md (workspace Tektus).
 * Conexão: NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (ambiente ou .env.local).
 */
import { createClient } from "@supabase/supabase-js";

import { credenciaisSupabaseDeTeste, anunciarDestino } from "./lib/env-de-teste";
import { desabilitar, habilitar, type Deps, type Resultado } from "./lib/habilitar-fzap-nativo";

const ARGV = process.argv.slice(2);
const flag = (n: string) => ARGV.includes(`--${n}`);
const opcao = (n: string): string | undefined => {
  const i = ARGV.indexOf(`--${n}`);
  return i >= 0 && ARGV[i + 1] && !ARGV[i + 1]!.startsWith("--") ? ARGV[i + 1] : undefined;
};

function imprimir(r: Resultado): never {
  for (const l of r.linhas) console.info(l);
  process.exit(r.ok ? 0 : 1);
}

async function main(): Promise<void> {
  if (flag("token")) {
    console.error("Token por argumento é recusado. Use a variável de ambiente FZAP_PASTA_TOKEN.");
    process.exit(2);
  }
  const aplicar = flag("aplicar");
  const orgId = opcao("org") ?? "";

  const creds = credenciaisSupabaseDeTeste();
  anunciarDestino("habilitar-fzap-nativo", creds);
  const admin = createClient(creds.url, creds.serviceRole, { auth: { persistSession: false } });

  const { encryptWebhookSecret } = await import("../lib/webhooks/secrets");
  const { fzapRequest } = await import("../lib/channels/verdash/client");
  const { verdashBaseUrl } = await import("../lib/channels/verdash/credentials");

  const deps: Deps = {
    async buscarOrg(id) {
      const { data, error } = await admin.from("organizations").select("id, status").eq("id", id).limit(1);
      if (error) throw new Error(`org_lookup_failed: ${error.code ?? "sem_codigo"}`);
      return (data?.[0] as { id: string; status: string } | undefined) ?? null;
    },
    async pastaAtualDaOrg(org) {
      const { data, error } = await admin
        .from("verdash_fzap_pastas")
        .select("fzap_folder_id")
        .eq("organization_id", org)
        .limit(1);
      if (error) throw new Error(`pasta_lookup_failed: ${error.code ?? "sem_codigo"}`);
      return (data?.[0]?.fzap_folder_id as string | undefined) ?? null;
    },
    async donoDaPasta(folderId) {
      const { data, error } = await admin
        .from("verdash_fzap_pastas")
        .select("organization_id")
        .eq("fzap_folder_id", folderId)
        .limit(1);
      if (error) throw new Error(`pasta_lookup_failed: ${error.code ?? "sem_codigo"}`);
      return (data?.[0]?.organization_id as string | undefined) ?? null;
    },
    listarDaPasta: (token) =>
      fzapRequest(
        { instanceName: "", token, vinculoId: null, baseUrl: verdashBaseUrl() },
        "/folder/instances",
      ),
    cifrar: (token) => encryptWebhookSecret(admin, token),
    async gravar(org, folderId, cifrado) {
      const { error } = await admin
        .from("verdash_fzap_pastas")
        .upsert(
          { organization_id: org, fzap_folder_id: folderId, folder_token_encrypted: cifrado },
          { onConflict: "organization_id" },
        );
      if (error) throw new Error(`pasta_upsert_failed: ${error.code ?? "sem_codigo"}`);
    },
    async apagar(org) {
      const { data, error } = await admin
        .from("verdash_fzap_pastas")
        .delete()
        .eq("organization_id", org)
        .select("organization_id");
      if (error) throw new Error(`pasta_delete_failed: ${error.code ?? "sem_codigo"}`);
      return data?.length ?? 0;
    },
  };

  if (flag("desabilitar")) imprimir(await desabilitar(deps, { orgId, aplicar }));

  imprimir(
    await habilitar(deps, {
      orgId,
      pastaId: opcao("pasta") ?? "",
      token: process.env.FZAP_PASTA_TOKEN?.trim() ?? "",
      aplicar,
      proxyBrPresente: (process.env.FZAP_PROXY_URL_BR?.trim() ?? "") !== "",
    }),
  );
}

main().catch((err: unknown) => {
  const token = process.env.FZAP_PASTA_TOKEN ?? "";
  const m = err instanceof Error ? err.message : "erro_desconhecido";
  console.error(`Falhou: ${(token ? m.split(token).join("[token]") : m).slice(0, 200)}`);
  process.exit(1);
});
