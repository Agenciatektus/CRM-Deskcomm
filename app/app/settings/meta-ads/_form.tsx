"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import {
  disconnectAdInsights,
  updateAdInsightsConnection,
} from "@/app/actions/settings/updateAdInsightsConnection";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { traduzir } from "@/lib/i18n/traducao";
import type { Idioma } from "@/lib/i18n/idiomas";
import { SeletorDeContas } from "./_seletor-de-contas";
import { DIAS_DE_AVISO_DE_VENCIMENTO } from "@/lib/plataformas-de-anuncio/meta/oauth/validade";

const LINK_DE_CONEXAO = "/api/v1/plataformas-de-anuncio/meta/connect";

/**
 * Cada recusa vira uma frase que diz O QUE FAZER — mesma regra do formulário de
 * Conversões. `cifra_indisponivel` é a que mais importa acertar: é problema de
 * INSTALAÇÃO, e um texto genérico mandaria o admin do tenant refazer um cadastro
 * que já está certo, para falhar igual.
 */
const ERRO_EM_PORTUGUES: Record<string, string> = {
  validation_failed: "Confira os campos: algum valor não está no formato esperado.",
  unauthenticated: "Sua sessão expirou. Entre de novo.",
  forbidden_tenant: "Você não está em nenhuma organização ativa.",
  forbidden_role: "Só um administrador da organização pode mudar esta conexão.",
  mfa_required: "Confirme o segundo fator para salvar esta mudança.",
  cifra_indisponivel:
    "Esta instalação está sem a chave mestra de criptografia, e o token não foi gravado. Quem instalou o sistema precisa configurá-la — refazer o cadastro aqui não resolve.",
  erro_ao_gravar: "Não consegui gravar agora. Tente de novo em instantes.",
  superada: "Não consegui gravar agora. Tente de novo em instantes.",
  rate_limited: "Muitas tentativas seguidas. Aguarde um minuto e tente de novo.",
  token_invalido:
    "A Meta não reconhece este token: ele está inválido, expirado ou revogado. Gere um novo e cole de novo.",
  token_de_pagina:
    "Este é um token de Página. Gere um token de usuário ou de usuário do sistema com a permissão ads_read.",
  sem_ads_read: "O token não tem a permissão ads_read. Gere-o de novo com essa permissão.",
  sem_contas: "Este token não enxerga nenhuma conta de anúncio. Confira se o usuário tem acesso às contas.",
  validacao_indisponivel: "Não consegui validar o token com a Meta agora. Tente de novo em instantes.",
};

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
}) {
  const t = (texto: string) => traduzir(texto, idioma);
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [token, setToken] = useState("");
  const [conta, setConta] = useState(contaPadrao ?? "");
  const [selecionadas, setSelecionadas] = useState<string[]>(contasPermitidas ?? []);
  const [listaCarregada, setListaCarregada] = useState(false);
  const aoCarregar = useCallback(() => setListaCarregada(true), []);
  // O novo token enxerga menos contas que as liberadas hoje: pede confirmação antes de gravar.
  const [reducao, setReducao] = useState<{ atuais: number; visiveis: number } | null>(null);

  // Na primeira conexão o token é obrigatório — a coluna é NOT NULL (0214) e a
  // Server Action recusa. Barrar aqui explica antes de o clique acontecer, em
  // vez de devolver um erro de validação depois.
  const podeSalvar = conectada || token.trim().length >= 20;

  function salvar(evento: React.FormEvent, confirmar = false) {
    evento.preventDefault();
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

  return (
    <>
      <Card className="flex flex-col gap-3 p-6" data-testid="meta-conectar">
        <h3 className="font-medium">{t("Conectar com Meta")}</h3>
        {oauthDisponivel ? (
          <>
            <p className="text-sm text-muted-foreground">
              {t(
                "Entre com a sua conta da Meta e autorize o acesso. O sistema guarda um token de cerca de 60 dias, criptografado, sem você precisar copiar nada.",
              )}
            </p>
            {conectada && via === "oauth" && expiraEm && (
              <p className="text-sm" data-testid="meta-validade">
                {diasParaVencer !== null && diasParaVencer <= 0
                  ? `${t("A conexão venceu em")} ${expiraEm}.`
                  : `${t("Conectada via Meta. O token vale até")} ${expiraEm}.`}
              </p>
            )}
            {precisaReconectar && (
              <p
                role="alert"
                className="text-sm font-medium text-destructive"
                data-testid="meta-precisa-reconectar"
              >
                {t("A Meta recusou renovar o acesso. Reconecte agora.")}
              </p>
            )}
            {venceEmBreve && !precisaReconectar && (
              <p
                role="alert"
                className="text-sm font-medium text-destructive"
                data-testid="meta-aviso-de-vencimento"
              >
                {diasParaVencer !== null && diasParaVencer <= 0
                  ? t("Reconecte agora para voltar a ler as campanhas.")
                  : t("O token está perto de vencer. Reconecte para renovar por mais 60 dias.")}
              </p>
            )}
            {conectada && via !== "oauth" && (
              <p className="text-sm" data-testid="meta-substitui-manual">
                {t("Conectar com a Meta substitui o token que está salvo agora.")}
              </p>
            )}
            <div>
              <a href={LINK_DE_CONEXAO}>
                <Button type="button" disabled={isPending}>
                  {conectada && via === "oauth" ? t("Reconectar com Meta") : t("Conectar com Meta")}
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
                idioma={idioma}
              />
            )}

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
                placeholder={conectada ? t("Guardado — preencha só para trocar") : "EAA…"}
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
              <Button type="submit" disabled={isPending || !podeSalvar}>
                {isPending ? t("Salvando…") : t("Salvar")}
              </Button>

              {conectada && (
                <Button type="button" variant="outline" disabled={isPending} onClick={desconectar}>
                  {t("Desconectar")}
                </Button>
              )}

              {!podeSalvar && (
                <span className="text-sm text-muted-foreground">
                  {t("Cole o token para poder salvar.")}
                </span>
              )}
            </div>

            {conectada && (
              <p className="text-xs text-muted-foreground">
                {/*
                Desconectar APAGA a linha — não existe "pausar" nesta feature, e o
                porquê está no cabeçalho da 0214: como nada roda sozinho, um estado
                "conectado mas desligado" teria a mesma consequência visível de não
                estar conectado.
              */}
                {t(
                  "Desconectar apaga o token guardado. A tela de Meta Ads volta a pedir uma conexão, e nenhum dado histórico é perdido — nada é armazenado aqui.",
                )}
              </p>
            )}
          </form>
        </Card>
      )}

      <AlertDialog open={reducao !== null} onOpenChange={(aberto) => !aberto && setReducao(null)}>
        <AlertDialogContent data-testid="meta-confirmar-reducao">
          <AlertDialogHeader>
            <AlertDialogTitle>{t("Este token enxerga menos contas")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("Hoje a organização tem {atuais} contas liberadas e o novo token enxerga só {visiveis} delas. Trocar agora pode esconder as demais.")
                .replace("{atuais}", String(reducao?.atuais ?? 0))
                .replace("{visiveis}", String(reducao?.visiveis ?? 0))}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("Cancelar")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                setReducao(null);
                salvar(e as unknown as React.FormEvent, true);
              }}
            >
              {t("Trocar mesmo assim")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
