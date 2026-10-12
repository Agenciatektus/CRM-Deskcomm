/**
 * O APP DE CELULAR EM 390x844 (M5) — a volta completa pela tela.
 *
 * Abaixo de 760px a casca troca o topo e a barra lateral pelas 5 abas do protótipo
 * (`docs/design/mobile/MobileVerdash.dc.html`). Esta spec anda por elas como quem
 * usa o celular: abas inferiores, conversa aberta e voltar, Funil, Tarefas, Avisos,
 * Mais > Ajustes > uma seção > voltar, e a busca em tela cheia com busca recente.
 *
 * Precisa do stack local (`.env.e2e`, `pnpm e2e:env`), como todas as specs daqui.
 * Semeia a própria conversa pelo service role e apaga no fim: a organização de
 * teste é compartilhada.
 */
import { createClient } from "@supabase/supabase-js";

import { carregarEnvLocal } from "../../scripts/lib/env-de-teste";
import { lerCreds, loginComoAdmin } from "./helpers/login-admin";
import { expect, test, type Page } from "./helpers/test";

const env = carregarEnvLocal();
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const CONTATO = "Odete Celular-390";
const SESSAO = "aaaaaaaa-e2e0-4000-8000-00000000c390";

let creds = lerCreds();
let orgId = "";
let conversaId = "";

async function limpar(): Promise<void> {
  if (!orgId) return;
  const { data } = await admin.from("contacts").select("id").eq("organization_id", orgId).eq("display_name", CONTATO);
  for (const c of data ?? []) {
    const id = (c as { id: string }).id;
    await admin.from("conversations").delete().eq("organization_id", orgId).eq("contact_id", id);
    await admin.from("contacts").delete().eq("organization_id", orgId).eq("id", id);
  }
  await admin.from("channel_sessions").delete().eq("organization_id", orgId).eq("id", SESSAO);
}

async function semear(): Promise<void> {
  await limpar();
  const { error: eSess } = await admin.from("channel_sessions").insert({
    id: SESSAO,
    organization_id: orgId,
    waha_session_name: `celular-390-${Date.now()}`,
    webhook_secret_encrypted: "\\x00",
    status: "WORKING",
  });
  if (eSess) throw new Error(`fixture de canal falhou: ${eSess.message}`);
  const { data: ct, error: eCt } = await admin
    .from("contacts")
    .insert({ organization_id: orgId, display_name: CONTATO })
    .select("id")
    .single();
  if (eCt) throw new Error(`fixture de contato falhou: ${eCt.message}`);
  const agora = new Date().toISOString();
  const { data: conv, error: eConv } = await admin
    .from("conversations")
    .insert({
      organization_id: orgId,
      contact_id: (ct as { id: string }).id,
      channel_session_id: SESSAO,
      status: "open",
      last_inbound_at: agora,
      last_message_at: agora,
      last_message_preview: "oi, pelo celular",
    })
    .select("id")
    .single();
  if (eConv) throw new Error(`fixture de conversa falhou: ${eConv.message}`);
  conversaId = (conv as { id: string }).id;
}

const abas = (page: Page) => page.getByRole("navigation", { name: "Seções do CRM" });
const aba = (page: Page, nome: string) => abas(page).getByRole("link", { name: nome, exact: true });

test.describe("App de celular em 390x844", () => {
  test.setTimeout(120_000);
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test.beforeAll(async () => {
    orgId = (lerCreds() as unknown as { org_id: string }).org_id;
    await semear();
  });
  test.afterAll(limpar);

  test("[P0] abas, conversa e voltar, Funil, Tarefas, Avisos, Mais > Ajustes e busca", async ({ page }) => {
    creds = await loginComoAdmin(page, creds);
    await page.goto("/app/inbox");

    // A casca do celular: 5 abas na ordem do protótipo, Conversas acesa; o topo do desktop fora.
    await expect(abas(page)).toBeVisible();
    for (const nome of ["Conversas", "Funil", "Tarefas", "Avisos"]) await expect(aba(page, nome)).toBeVisible();
    await expect(abas(page).getByRole("button", { name: "Mais" })).toBeVisible();
    await expect(aba(page, "Conversas")).toHaveAttribute("aria-current", "page");

    // Conversa aberta: tela cheia (sem abas), e o voltar devolve a lista.
    await page.goto(`/app/inbox?id=${conversaId}`);
    await expect(page.getByRole("button", { name: `Abrir ficha de ${CONTATO}` })).toBeVisible();
    await expect(abas(page)).toHaveCount(0);
    await page.getByRole("button", { name: "Voltar" }).first().click();
    await expect(page).toHaveURL(/\/app\/inbox(\?(?!.*id=).*)?$/);
    await expect(abas(page)).toBeVisible();

    // Funil, Tarefas e Avisos: cada aba acende e abre o começo dela, com o título grande.
    for (const [nome, rota] of [
      ["Funil", /\/app\/kanban/],
      ["Tarefas", /\/app\/tasks/],
      ["Avisos", /\/app\/ai\/inbox/],
    ] as const) {
      await aba(page, nome).click();
      await expect(page).toHaveURL(rota);
      await expect(aba(page, nome)).toHaveAttribute("aria-current", "page");
      await expect(page.getByRole("heading", { level: 1, name: nome }).first()).toBeVisible();
    }

    // Mais > Ajustes > uma seção > voltar à lista de seções.
    await abas(page).getByRole("button", { name: "Mais" }).click();
    const mais = page.getByRole("dialog", { name: "Mais" });
    await expect(mais).toBeVisible();
    await mais.locator('a[href="/app/settings"]').first().click();
    await expect(page).toHaveURL(/\/app\/settings$/);
    await page.locator('main a[href="/app/settings/profile"]').first().click();
    await expect(page).toHaveURL(/\/app\/settings\/profile/);
    await page.getByRole("button", { name: "Voltar" }).first().click();
    await expect(page).toHaveURL(/\/app\/settings$/);

    // Busca em tela cheia: abre pelo campo da lista, acha o contato, e o termo vira busca recente.
    await aba(page, "Conversas").click();
    await page.getByRole("button", { name: "Buscar contato, conversa ou lead" }).click();
    const busca = page.getByTestId("busca-do-celular");
    await expect(busca).toBeVisible();
    const caixa = await busca.boundingBox();
    expect(caixa?.width).toBe(390);
    await busca.getByRole("combobox").fill("Odete Celular");
    await busca.getByRole("option", { name: new RegExp(CONTATO) }).first().click();
    await expect(busca).toHaveCount(0);

    await page.goto("/app/inbox");
    await page.getByRole("button", { name: "Buscar contato, conversa ou lead" }).click();
    await expect(busca.getByRole("region", { name: "Buscas recentes" })).toContainText("Odete Celular");
    await busca.getByRole("button", { name: "Voltar" }).click();
    await expect(busca).toHaveCount(0);
  });
});
