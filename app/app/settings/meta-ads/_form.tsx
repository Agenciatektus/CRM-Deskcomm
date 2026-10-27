"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import {
  disconnectAdInsights,
  updateAdInsightsConnection,
} from "@/app/actions/settings/updateAdInsightsConnection";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { traduzir } from "@/lib/i18n/traducao";
import type { Idioma } from "@/lib/i18n/idiomas";
import { DialogosDeMetaAds } from "./_dialogos";
import { ERRO_EM_PORTUGUES } from "./_erros";
import { PainelDeStatusMeta } from "./_painel-de-status";
import { SeletorDeContas } from "./_seletor-de-contas";
import { DIAS_DE_AVISO_DE_VENCIMENTO } from "@/lib/plataformas-de-anuncio/meta/oauth/validade";

const LINK_DE_CONEXAO = "/api/v1/plataformas-de-anuncio/meta/connect";

export function FormularioDeMetaAds({
  conectada,
  contaPadrao,
  contasPermitidas,
  podeAmpliar,
  via,
  expiraEm,
  diasParaVencer,
  precisaReconectar = false,
  oauthDisponivel,
  oauthFalta,
  idioma,
  metaUserName = null,
  metaBusinesses = [],
}: {
  conectada: boolean;
  contaPadrao: string | null;
  /** Regra efetiva de contas liberadas; `null` = sem restrição (token colado à mão). */
  contasPermitidas: string[] | null;
  /** Quem conectou a Meta (ou suporte): pode liberar contas além das já liberadas. */
  podeAmpliar: boolean;
  via: "manual" | "oauth" | null;
  /** Data de vencimento já formatada; `null` em token colado à mão. */
  expiraEm: string | null;
  diasParaVencer: number | null;
  /** A Meta recusou renovar o acesso (needs_reconnect). */
  precisaReconectar?: boolean;
  oauthDisponivel: boolean;
  /** Nomes das variáveis de ambiente que faltam para o botão existir. */
  oauthFalta: string[];
  idioma: Idioma;
  /** Quem conectou e as empresas (BM) que o login alcança; só no login Meta. */
  metaUserName?: string | null;
  metaBusinesses?: { id: string; name: string }[];
}) {
  const t = (texto: string) => traduzir(texto, idioma);
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [token, setToken] = useState("");
  const [conta, setConta] = useState(contaPadrao ?? "");
  const [selecionadas, setSelecionadas] = useState<string[]>(contasPermitidas ?? []);
  const [listaCarregada, setListaCarregada] = useState(false);
  const [totalDeContas, setTotalDeContas] = useState<number | null>(null);
  const aoCarregar = useCallback((total: number) => {
    setListaCarregada(true);
    setTotalDeContas(total);
  }, []);
  const [colarOutro, setColarOutro] = useState(false);
  const [confirmarDesconexao, setConfirmarDesconexao] = useState(false);
  // O novo token enxerga menos contas que as liberadas hoje: pede confirmação antes de gravar.
  const [reducao, setReducao] = useState<{ atuais: number; visiveis: number } | null>(null);

  // Na primeira conexão o token é obrigatório — a coluna é NOT NULL (0214) e a
  // Server Action recusa. Barrar aqui explica antes de o clique acontecer, em
  // vez de devolver um erro de validação depois.
  const podeSalvar = conectada || token.trim().length >= 20;
  // Com login Meta, lista vazia seria gravada como "nenhuma conta liberada".
  const semNenhuma = conectada && via === "oauth" && listaCarregada && selecionadas.length === 0;

  function salvar(evento: React.FormEvent, confirmar = false) {
    evento.preventDefault();
    if (semNenhuma) return;
    startTransition(async () => {
      const resultado = await updateAdInsightsConnection({
        platform: "meta_ads",
        access_token: token.trim() || undefined,
        // A padrão tem de estar entre as marcadas; senão o servidor recusa.
        default_account_id:
          (listaCarregada && !selecionadas.includes(conta.trim()) ? "" : conta.trim()) || null,
        // Só com a lista de contas à vista: salvar sem ela apagaria a escolha.
        // Token colado à mão sem nenhuma marcada = sem restrição.
        ...(conectada && listaCarregada
          ? { allowed_ad_account_ids: selecionadas.length === 0 && via !== "oauth" ? null : selecionadas }
          : {}),
        ...(confirmar ? { confirmar: true } : {}),
      });

      if (!resultado.ok && resultado.error === "precisa_confirmar") {
        const d = resultado.details as { atuais?: number; visiveis?: number } | undefined;
        setReducao({ atuais: d?.atuais ?? 0, visiveis: d?.visiveis ?? 0 });
        return;
      }
      if (resultado.ok) {
        // O campo é limpo no sucesso: deixá-lo preenchido dá a impressão de que
        // a tela guarda o token, e ela nunca o mostra de volta.
        setToken("");
        toast.success(t("Conexão salva."));
        router.refresh();
        return;
      }
      toast.error(t(ERRO_EM_PORTUGUES[resultado.error] ?? "Não consegui salvar agora."));
    });
  }

  function desconectar() {
    startTransition(async () => {
      const resultado = await disconnectAdInsights();
      if (resultado.ok) {
        setToken("");
        setConta("");
        toast.success(t("Conta desconectada."));
        router.refresh();
        return;
      }
      toast.error(t(ERRO_EM_PORTUGUES[resultado.error] ?? "Não consegui desconectar agora."));
    });
  }

  // Acabou de conectar (?escolher=1): leva o usuário direto ao seletor de contas, que fica no cartão de baixo.
  useEffect(() => {
    if (!conectada || typeof window === "undefined") return;
    if (new URLSearchParams(window.location.search).get("escolher") !== "1") return;
    document.getElementById("escolher-contas")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [conectada]);

  const manualComValidade = conectada && via !== "oauth" && Boolean(expiraEm);
  const venceEmBreve = diasParaVencer !== null && diasParaVencer < DIAS_DE_AVISO_DE_VENCIMENTO;
  const trocaToken = !conectada || via !== "oauth" || colarOutro;

  return (
    <>
      {conectada ? (
        <PainelDeStatusMeta
          nome={metaUserName}
          via={via}
          empresas={metaBusinesses}
          totalDeContas={totalDeContas}
          expiraEm={expiraEm}
          diasParaVencer={diasParaVencer}
          precisaReconectar={precisaReconectar}
          oauthDisponivel={oauthDisponivel}
          ocupado={isPending}
          onDesconectar={() => setConfirmarDesconexao(true)}
          idioma={idioma}
        />
      ) : (
        <Card className="flex flex-col gap-3 p-6" data-testid="meta-conectar">
          <h3 className="font-medium">{t("Conectar com Meta")}</h3>
          {oauthDisponivel ? (
            <>
              <p className="text-sm text-muted-foreground">
                {t(
                  "Entre com a sua conta da Meta e autorize o acesso. O sistema guarda um token de cerca de 60 dias, criptografado, sem você precisar copiar nada.",
                )}
              </p>
              <div>
                <a href={LINK_DE_CONEXAO}>
                  <Button type="button" disabled={isPending}>
                    {t("Conectar com Meta")}
                  </Button>
                </a>
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground" data-testid="meta-nao-configurado">
              {t(
                "Conectar com a Meta ainda não está disponível nesta instalação. Quem instalou o sistema precisa configurar",
              )}{" "}
              <span className="font-mono text-xs">{oauthFalta.join(` ${t("e")} `)}</span>
              {". "}
              {t("Enquanto isso, você pode colar um token à mão abaixo.")}
            </p>
          )}
        </Card>
      )}

      {/* Os dados vêm depois da conexão: com login Meta disponível, o formulário só aparece conectada. */}
      {(conectada || !oauthDisponivel) && (
        <Card className="p-6" id="escolher-contas">
          <form onSubmit={salvar} className="flex flex-col gap-5">
            {conectada && (
              <SeletorDeContas
                selecionadas={selecionadas}
                padrao={conta}
                onSelecionadas={setSelecionadas}
                onPadrao={setConta}
                onCarregada={aoCarregar}
                podeAmpliar={podeAmpliar}
                precisaReconectar={precisaReconectar}
                idioma={idioma}
              />
            )}

            {conectada && via === "oauth" && !colarOutro && (
              <div>
                <Button
                  type="button"
                  variant="ghost"
                  aria-expanded={false}
                  aria-controls="access_token"
                  onClick={() => setColarOutro(true)}
                >
                  {t("Colar outro token")}
                </Button>
              </div>
            )}
            {trocaToken && (
              <div className="flex flex-col gap-2">
                <Label htmlFor="access_token">{t("Token de acesso")}</Label>
                <Input
                  id="access_token"
                  name="meta_access_token"
                  type="password"
                  // O Chrome ignora autocomplete="off" em campo de senha; "new-password" é o que impede o
                  // preenchimento e evita que o campo de busca logo acima vire "usuário" para o gerenciador de senhas.
                  autoComplete="new-password"
                  data-1p-ignore
                  data-lpignore="true"
                  data-form-type="other"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder={conectada ? t("Guardado, preencha só para trocar") : "EAA…"}
                />
                {manualComValidade && (
                  <p className="text-xs" data-testid="meta-validade-manual">
                    {diasParaVencer !== null && diasParaVencer <= 0
                      ? `${t("O token colado venceu em")} ${expiraEm}.`
                      : `${t("O token colado vale até")} ${expiraEm}.`}
                    {venceEmBreve && diasParaVencer !== null && diasParaVencer > 0 && ` ${t("Cole um novo token antes disso.")}`}
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  {conectada
                    ? `${t(
                        "Já existe um token guardado. Deixe em branco para mantê-lo, ou cole um novo para substituir.",
                      )}${via !== "oauth" ? ` ${t("Precisa da permissão ads_read.")}` : ""}`
                    : t("Precisa da permissão ads_read.")}
                </p>
              </div>
            )}

            {!conectada && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="default_account_id">{t("Conta padrão (opcional)")}</Label>
              <Input
                id="default_account_id"
                value={conta}
                onChange={(e) => setConta(e.target.value)}
                placeholder="act_123456789012345"
              />
              <p className="text-xs text-muted-foreground">
                {t(
                  "A conta que a tela de Meta Ads abre por padrão. Em branco, ela abre a primeira conta ativa que o token alcançar.",
                )}
              </p>
            </div>
            )}

            <div className="flex items-center gap-3">
              <Button type="submit" disabled={isPending || !podeSalvar || semNenhuma}>
                {isPending ? t("Salvando…") : t("Salvar")}
              </Button>

              {semNenhuma && (
                <span role="alert" className="text-sm text-muted-foreground" data-testid="meta-nenhuma-liberada">
                  {t("Nenhuma conta liberada. Marque ao menos uma para salvar.")}
                </span>
              )}
              {!podeSalvar && (
                <span className="text-sm text-muted-foreground">
                  {t("Cole o token para poder salvar.")}
                </span>
              )}
            </div>

          </form>
        </Card>
      )}

      <DialogosDeMetaAds
        confirmarDesconexao={confirmarDesconexao}
        onDesconexao={setConfirmarDesconexao}
        onConfirmarDesconexao={desconectar}
        reducao={reducao}
        onReducao={setReducao}
        onConfirmarReducao={(e) => salvar(e as unknown as React.FormEvent, true)}
        idioma={idioma}
      />
    </>
  );
}
