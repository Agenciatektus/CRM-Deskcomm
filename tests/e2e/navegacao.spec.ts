/**
 * Navegação agrupada — prova pela TELA (DoD item 12).
 *
 * Os testes unitários provam que o registro e os componentes fazem o que
 * dizem. Isto prova o que o usuário reclamou: que dá para *achar* as coisas.
 * O caso que originou a mudança é o primeiro — chegar em Funis sem saber que
 * ele morava em Configurações.
 *
 * Pré-requisito: `.e2e-creds.json` (gerado por scripts/seed-e2e-credentials.ts).
 */
import { mkdirSync } from "node:fs";
import * as path from "node:path";

import { test, expect, type Page } from "./helpers/test";

import { lerCreds, loginComoAdmin } from "./helpers/login-admin";
import { afirmarAdminDeTenantPuro } from "./utils/precondicao";

let creds = lerCreds();
const EVIDENCE = path.join(process.cwd(), ".superpowers", "evidence");

mkdirSync(EVIDENCE, { recursive: true });

// ── Precondição de identidade ────────────────────────────────────────────────
// O menu é `sidebarGroups(isPlatformAdmin, role)` (`registry.ts:510-519`), então
// a suspeita natural é que promover o `e2e-admin` a dono do servidor inflasse o
// sidebar que esta spec mede item a item.
//
// ⚠️ MEDIDO, e a suspeita não se confirma: `canSee` (`registry.ts:503-507`) é
// `isPlatformAdmin || ROLE_RANK[role] >= ROLE_RANK[minRole]`; `ROLE_RANK.admin`
// é 5, o TETO, e o maior `minRole` do registro é `"admin"`. Para um admin de
// tenant o menu é IDÊNTICO promovido ou não — as asserções de `toHaveText`
// abaixo não mudariam. Guardar a identidade aqui continua valendo (é a spec de
// navegação; qualquer destino futuro exclusivo do dono apareceria primeiro
// nela), mas registrar a diferença entre "muda" e "poderia mudar" é o ponto.
test.beforeAll(async () => {
  await afirmarAdminDeTenantPuro(creds.users.admin!.email);
});

async function login(page: Page, email: string): Promise<void> {
  await page.goto("/login");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(creds.password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.waitForURL(/\/app\//);
}

async function loginAdmin(page: Page): Promise<void> {
  creds = await loginComoAdmin(page, creds);
}

const sidebar = (page: Page) => page.getByRole("navigation", { name: "Navegação principal" });
/**
 * Visual v2: a barra do desktop tem um TRILHO com um botão por grupo e uma
 * coluna ("Navegação principal") com as telas do grupo escolhido, que começa
 * sendo o da rota. Para chegar a uma tela de outro grupo, clica-se no grupo antes.
 */
const trilho = (page: Page) => page.getByRole("navigation", { name: "Grupos da navegação" });
async function abrirGrupo(page: Page, nome: string): Promise<void> {
  await trilho(page).getByRole("button", { name: nome, exact: true }).click();
}

async function expectSemOverflowHorizontal(page: Page, contexto: string): Promise<void> {
  const m = await page.evaluate(() => ({
    // ⚠️ `body.scrollWidth`, NÃO `documentElement`. `app/globals.css` põe
    // `overflow-x: clip` em `html` E em `body` (é `clip` e não `hidden` porque
    // `hidden` derruba o sticky da barra — ver barra-lateral-nao-flutua).
    // Com `hidden`, o `scrollWidth` do `documentElement` era GRAMPEADO no
    // `clientWidth`: a conta dava zero mesmo com um filho de 3000px dentro.
    // Medido com o chromium do repo, viewport 390x844, filho de 3000px —
    // `visible` → 2610, `hidden` → 0, e `body.scrollWidth` = 3000 nos DOIS
    // casos. A medida fica no `body` para não voltar a ser incapaz de falhar.
    //
    // A asserção existia e era incapaz de falhar. Trocar a medida é o conserto;
    // o caso de sabotagem ao lado é o que prova que a nova consegue.
    scrollWidth: document.body.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));

  expect(
    m.scrollWidth,
    `${contexto}: documentElement.scrollWidth (${m.scrollWidth}) não pode passar do clientWidth (${m.clientWidth})`,
  ).toBeLessThanOrEqual(m.clientWidth + 1);
}

// `loginComoAdmin` espera a virada da janela TOTP entre logins consecutivos
// (o servidor recusa código repetido), e essa espera sozinha pode consumir os
// 30 s do teto global do playwright.config.ts. Toda spec da casa que usa o
// helper sobe o teto — 240 s em `agente-novo-e-uso`, `agente-papeis-operador`,
// `escopo-de-funil-do-agente` e `capacidades-do-agente`; 90 s em
// `prova-painel-provedores`. Esta era a única que faltava, e por isso dois
// testes que já estavam verdes passaram a estourar 30 s.
test.describe.configure({ timeout: 120_000 });

test.describe("navegação agrupada", () => {
  test("o sidebar tem hierarquia: grupos na ordem de uso", async ({ page }) => {
    await loginAdmin(page);

    // Organização não aparece no trilho: seu hub (Configurações) é o link
    // "Ajustes" do rodapé fixo — ver o teste do rodapé abaixo.
    const grupos = trilho(page).getByRole("button");
    await expect(grupos).toHaveText(["Conversas", "CRM", "Agentes", "Canais", "Análise"]);

    await page.screenshot({
      path: path.join(EVIDENCE, "nav-sidebar-agrupado.png"),
      fullPage: true,
    });
  });

  test("chega nas Etapas do funil pelo CRM, sem passar por Configurações", async ({ page }) => {
    await loginAdmin(page);

    // O caso que originou tudo: o usuário não sabia que esta tela existia.
    //
    // ⚠️ O ITEM MUDOU DE NOME, e o nome antigo ("Funis") passou para o VIZINHO —
    // a lista de funis, em /app/kanban. Um teste que continuasse clicando em
    // "Funis" seguiria verde medindo a outra tela; por isso a asserção de URL
    // abaixo é específica (`settings/tenant/pipelines`) e não o antigo
    // /pipelines/, que casa com as duas.
    //
    // ⚠️ E O CAMINHO MUDOU: com Tarefas (PR #546), o CRM chegou a cinco telas e
    // o menu passou a rolar em 900px. A resposta foi o hub do grupo, como o
    // comentário de densidade do `Sidebar.tsx` já mandava — então esta tela
    // agora mora atrás de "Ver tudo em CRM". Este teste percorre o caminho
    // INTEIRO em vez de checar um link: hub → tela. Que a porta existe no grupo
    // certo do sidebar é o unitário `sidebar-grupos` que prende.
    await abrirGrupo(page, "CRM");
    await sidebar(page).getByRole("link", { name: "Ver tudo em CRM" }).click();
    await page.waitForURL(/\/app\/crm$/);
    await expect(page.getByRole("heading", { name: "O dia a dia da venda" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Preparar a venda" })).toBeVisible();

    await page.screenshot({ path: path.join(EVIDENCE, "nav-hub-crm.png"), fullPage: true });

    await page.getByRole("link", { name: /Etapas do funil/ }).click();
    await page.waitForURL(/settings\/tenant\/pipelines/);
    await expect(page.getByRole("heading", { name: "Etapas do funil", level: 1 })).toBeVisible();
  });

  test("e Produtos continua alcançável pelo mesmo hub", async ({ page }) => {
    // Tirar do sidebar não pode virar tela órfã: DoD 14 cobra porta, e a porta
    // passou a ser o hub.
    //
    // ⚠️ VISUAL V2: a coluna do CRM mostra o inventário do grupo (o mesmo do
    // hub), então Produtos voltou a ter linha própria NELA. O caminho pelo hub
    // continua sendo percorrido aqui, porque o hub segue sendo porta.
    await loginAdmin(page);

    await abrirGrupo(page, "CRM");
    await expect(sidebar(page).getByRole("link", { name: "Produtos" })).toBeVisible();

    await sidebar(page).getByRole("link", { name: "Ver tudo em CRM" }).click();
    await page.waitForURL(/\/app\/crm$/);
    await page.getByRole("link", { name: /Produtos/ }).click();
    await page.waitForURL(/\/app\/products/);
  });

  test("e a lista de funis é o item vizinho, com nome próprio", async ({ page }) => {
    await loginAdmin(page);
    await abrirGrupo(page, "CRM");
    await sidebar(page).getByRole("link", { name: "Funis", exact: true }).click();
    await page.waitForURL(/\/app\/kanban/);
    await expect(page.getByRole("heading", { name: "Funis", level: 1 })).toBeVisible();
  });

  test("chega em Conhecimento, que só existia atrás das abas de IA", async ({ page }) => {
    await loginAdmin(page);

    await abrirGrupo(page, "Agentes");
    await sidebar(page).getByRole("link", { name: "Ver tudo em IA" }).click();
    await page.waitForURL(/\/app\/ai$/);

    // O hub organiza por jornada, não numa grade solta.
    await expect(page.getByRole("heading", { name: "Montar o agente" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Ensinar o agente" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Acompanhar o agente" })).toBeVisible();

    await page.screenshot({ path: path.join(EVIDENCE, "nav-hub-ia.png"), fullPage: true });

    await page.getByRole("link", { name: /Conhecimento/ }).click();
    await page.waitForURL(/knowledge\/sources/);
  });

  /**
   * O canal oficial saiu de Configurações no PR #105 e virou aba de Conexões.
   * A porta, portanto, é Conexões — que agora vive no grupo CANAIS do sidebar,
   * e não mais como um card perdido em Configurações.
   */
  test("chega ao canal oficial pelo grupo Canais, não por Configurações", async ({ page }) => {
    await loginAdmin(page);

    await abrirGrupo(page, "Canais");
    await sidebar(page).getByRole("link", { name: "Conexões" }).click();
    await page.waitForURL(/\/app\/connections/);
    await expect(page.getByRole("tab", { name: /oficial/i })).toBeVisible();
  });

  test("o ⌘K acha o canal oficial por nome, mesmo sem tela própria", async ({ page }) => {
    await loginAdmin(page);

    // Ninguém procura por "Conexões" quando quer o número oficial da Meta —
    // procura por "oficial". A busca varre a descrição além do rótulo.
    await page.keyboard.press("ControlOrMeta+k");
    await page.getByRole("combobox").fill("oficial");
    await expect(page.getByRole("option", { name: /Conexões/ })).toBeVisible();
  });

  test("⌘K abre, filtra e navega", async ({ page }) => {
    await loginAdmin(page);

    await page.keyboard.press("ControlOrMeta+k");
    const busca = page.getByRole("combobox");
    await expect(busca).toBeVisible();

    await busca.fill("conhec");
    await expect(page.getByRole("option", { name: /Conhecimento/ })).toBeVisible();

    await page.screenshot({ path: path.join(EVIDENCE, "nav-command-palette.png") });

    await page.keyboard.press("Enter");
    await page.waitForURL(/knowledge\/sources/);
  });

  /**
   * Agrupar cria um risco que a lista plana não tinha: o menu cresce e passa a
   * exigir scroll. Na primeira versão desta mudança, medido em 1280×768, o
   * conteúdo dava 1019px contra 663px visíveis — SETE links e os grupos Análise
   * e Organização ficavam fora da dobra. Trocar "17 itens sem hierarquia" por
   * "20 itens que não cabem" seria recriar o problema em outra forma.
   *
   * Medido por ferramenta, nunca a olho.
   *
   * ⚠️ VISUAL V2: com duas colunas, "o menu" são DUAS áreas. O trilho tem de
   * mostrar todos os grupos sem rolar (grupo abaixo da dobra é indistinguível de
   * grupo que não existe), e a coluna de CADA grupo tem de caber em 900px.
   */
  test("nenhum grupo fica fora da dobra, e em 900px nenhuma coluna rola", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await loginAdmin(page);

    const trilhoRola = await page.evaluate(() => {
      const nav = document.querySelector('nav[aria-label="Grupos da navegação"]')!;
      return nav.scrollHeight > Math.round(nav.getBoundingClientRect().height) + 1;
    });
    expect(trilhoRola, "o trilho de grupos tem de caber sem scroll").toBe(false);

    for (const grupo of ["Conversas", "CRM", "Agentes", "Canais", "Análise"]) {
      await abrirGrupo(page, grupo);
      await expect(sidebar(page).getByRole("heading", { name: grupo })).toBeVisible();
      const rola = await page.evaluate(() => {
        // A área que rola é o filho da <nav> logo abaixo do título.
        const nav = document.querySelector('nav[aria-label="Navegação principal"]')!;
        const area = nav.querySelector("h2 + div") ?? nav;
        return area.scrollHeight > Math.round(area.getBoundingClientRect().height) + 1;
      });
      expect(rola, `em 900px a coluna de ${grupo} tem de caber sem scroll`).toBe(false);
    }
  });

  test.describe("mobile", () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test("em 390px, o sidebar vira gaveta e não cria overflow horizontal", async ({ page }) => {
      await loginAdmin(page);

      await expect(sidebar(page), "o sidebar desktop fica fora da árvore acessível no mobile").toHaveCount(0);
      await expectSemOverflowHorizontal(page, "shell mobile após login");

      await page.getByRole("button", { name: "Abrir navegação" }).click();
      await expect(sidebar(page)).toBeVisible();
      await expectSemOverflowHorizontal(page, "shell mobile com drawer aberto");
      await page.screenshot({
        path: path.join(EVIDENCE, "nav-mobile-390-drawer-aberta.png"),
        fullPage: true,
      });

      await sidebar(page).getByRole("link", { name: "Funis", exact: true }).click();
      await page.waitForURL(/\/app\/kanban/);
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await expectSemOverflowHorizontal(page, "shell mobile após navegar pelo drawer");

      await page.screenshot({
        path: path.join(EVIDENCE, "nav-mobile-390-sem-overflow.png"),
        fullPage: true,
      });
    });
  });

  test("Configurações fica fixo no rodapé, fora da área que rola", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 768 });
    await loginAdmin(page);

    // No trilho de 72px o rótulo é curto: "Ajustes", com o mesmo destino.
    const config = page.getByRole("link", { name: "Ajustes", exact: true });
    await expect(config).toBeVisible();
    await expect(config).toHaveAttribute("href", "/app/settings");

    const dentroDaNav = await page.evaluate(() => {
      const navs = [
        ...document.querySelectorAll(
          'nav[aria-label="Navegação principal"], nav[aria-label="Grupos da navegação"]',
        ),
      ];
      const link = [...document.querySelectorAll("a")].find(
        (a) => a.textContent?.trim() === "Ajustes",
      );
      return navs.some((nav) => nav.contains(link!));
    });
    expect(dentroDaNav, "Configurações não pode depender de scroll para aparecer").toBe(false);
  });

  test("um agent não vê o cabeçalho de um grupo que a permissão esvaziou", async ({ page }) => {
    await login(page, creds.users.agent!.email);

    // CANAIS é todo manager+/admin: o grupo não pode sobrar sozinho no trilho.
    await expect(trilho(page).getByRole("button", { name: "Canais" })).toHaveCount(0);
    await expect(trilho(page).getByRole("button", { name: "Conversas" })).toBeVisible();
  });
});
