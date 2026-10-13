"use client";
import type { ReactNode } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { channelLabel, useChannelSessions, type ChannelSession } from "@/hooks/channels/useChannelSessions";
import { useT } from "@/hooks/i18n/useT";
import { phoneForDisplay } from "@/lib/channels/phone-variants";
import {
  ChatCircle,
  InstagramLogo,
  Microphone,
  Phone,
  PlugsConnected,
  Plus,
  QrCode,
  Storefront,
  WhatsappLogo,
} from "@/lib/ui/icons";

type Estado = "ok" | "conectando" | "caiu";

function estadoDaSessao(s: ChannelSession): Estado {
  if (s.status === "WORKING") return "ok";
  if (s.status === "STARTING" || s.status === "SCAN_QR_CODE") return "conectando";
  return "caiu";
}

const SELO: Record<Estado, { classe: string; rotulo: string }> = {
  ok: { classe: "bg-success-bg text-success-fg", rotulo: "Conectado" },
  conectando: { classe: "bg-warning-bg text-warning-fg", rotulo: "Conectando…" },
  caiu: { classe: "bg-error-bg text-error-fg", rotulo: "Desconectado" },
};

/** Os outros canais, na ordem das abas de Conexões (os mesmos rótulos e as mesmas abas). */
const OUTROS: { aba: string; nome: string; sub: string; Icone: typeof Phone; logo: string }[] = [
  { aba: "hospedado", nome: "Número já conectado", sub: "WhatsApp que já funciona em outro sistema", Icone: WhatsappLogo, logo: "bg-avatar-2 text-avatar-2-fg" },
  { aba: "instagram", nome: "Instagram", sub: "Direct do Instagram na aba Conversas", Icone: InstagramLogo, logo: "bg-avatar-3 text-avatar-3-fg" },
  { aba: "oficial", nome: "API Oficial (Meta)", sub: "Número oficial e templates da Meta", Icone: ChatCircle, logo: "bg-avatar-1 text-avatar-1-fg" },
  { aba: "parceiro", nome: "Provedor parceiro", sub: "Número por um provedor parceiro", Icone: PlugsConnected, logo: "bg-avatar-4 text-avatar-4-fg" },
  { aba: "telefonia", nome: "Telefone", sub: "Linha de telefone para as chamadas", Icone: Phone, logo: "bg-avatar-5 text-avatar-5-fg" },
  { aba: "sociais", nome: "Redes sociais", sub: "Outras redes na aba Conversas", Icone: Storefront, logo: "bg-avatar-6 text-avatar-6-fg" },
  { aba: "voz", nome: "Chamada de voz", sub: "Ligações atendidas pela IA", Icone: Microphone, logo: "bg-avatar-5 text-avatar-5-fg" },
];

const BOTAO =
  "pele-foco flex min-h-(--mb-alvo) flex-1 items-center justify-center rounded-xl px-4 text-sm font-semibold";

/** O cartão do canal (o `.cc` do protótipo): logo, nome, apoio, selo e as ações. */
function Cartao({
  logo,
  nome,
  sub,
  selo,
  aviso,
  acoes,
}: {
  logo: ReactNode;
  nome: string;
  sub: string;
  selo?: ReactNode;
  aviso?: string;
  acoes: ReactNode;
}) {
  return (
    <li className="mx-4 mb-3 flex flex-col gap-3 rounded-(--mb-canal-raio) border border-border bg-surface p-4">
      <div className="flex items-center gap-3">
        {logo}
        <span className="min-w-0 flex-1">
          <b className="block truncate text-base text-text">{nome}</b>
          <small className="block truncate text-[13.5px] text-text-muted">{sub}</small>
        </span>
        {selo}
      </div>
      {aviso ? <p className="text-[13.5px] text-text-muted">{aviso}</p> : null}
      <div className="flex gap-2">{acoes}</div>
    </li>
  );
}

function Logo({ Icone, cor }: { Icone: typeof Phone; cor: string }) {
  return (
    <span className={`grid size-(--mb-canal-logo) shrink-0 place-items-center rounded-[14px] ${cor}`}>
      <Icone size={22} aria-hidden />
    </span>
  );
}

/**
 * CANAIS (tela 10 do protótipo), o começo de Conexões no celular: um cartão por número
 * conectado (com o estado lido de `useChannelSessions`, o mesmo da bolinha da barra) e
 * um por tipo de canal. "Gerenciar", "Reconectar" e "Conectar outro canal" abrem a aba
 * certa da tela de sempre (`?aba=`), onde estão as ações; nada é feito daqui.
 *
 * Só abaixo de 760px e só sem `?aba=`: com a aba escolhida, ou no desktop, é a tela de
 * Conexões de sempre (`children`).
 */
export function Canais({ children }: { children: ReactNode }) {
  const t = useT();
  const aba = useSearchParams()?.get("aba");
  const sessoes = useChannelSessions({ refetchInterval: 30_000 });
  if (aba) return <>{children}</>;
  return (
    <>
      <div className="mb:hidden">{children}</div>
      <div className="-mx-4 hidden mb:block">
        <p className="px-5 pb-3 text-[14.5px] text-text-muted">
          {t("Onde os clientes falam com você. Cada número ou perfil conectado vira conversa na aba Conversas.")}
        </p>
        <ul>
          {(sessoes.data ?? []).map((s) => {
            const estado = estadoDaSessao(s);
            return (
              <Cartao
                key={s.id}
                logo={<Logo Icone={QrCode} cor="bg-success-bg text-success-fg" />}
                nome={channelLabel(s, t)}
                sub={s.phone_number ? phoneForDisplay(s.phone_number) : t("Número por QR")}
                selo={
                  <span className={`inline-flex h-6.5 items-center gap-1.5 rounded-full px-2.5 text-[12.5px] font-bold whitespace-nowrap ${SELO[estado].classe}`}>
                    <i className="size-1.75 rounded-full bg-current" aria-hidden />
                    {t(SELO[estado].rotulo)}
                  </span>
                }
                aviso={estado === "caiu" ? t("Leia o QR code de novo para voltar a receber mensagens deste número.") : undefined}
                acoes={
                  <Link
                    href="/app/connections?aba=numeros"
                    className={`${BOTAO} ${estado === "caiu" ? "bg-accent text-accent-foreground" : "border border-border text-text"}`}
                  >
                    {estado === "caiu" ? t("Reconectar") : t("Gerenciar")}
                  </Link>
                }
              />
            );
          })}
          {OUTROS.map((c) => (
            <Cartao
              key={c.aba}
              logo={<Logo Icone={c.Icone} cor={c.logo} />}
              nome={t(c.nome)}
              sub={t(c.sub)}
              acoes={
                <Link href={`/app/connections?aba=${c.aba}`} className={`${BOTAO} border border-border text-text`}>
                  {t("Gerenciar")}
                </Link>
              }
            />
          ))}
        </ul>
        <Link
          href="/app/connections?aba=numeros"
          className="pele-foco mx-4 flex min-h-13 items-center justify-center gap-2 rounded-2xl border-[1.5px] border-border-strong font-bold text-accent-text hover:bg-hover"
        >
          <Plus size={18} aria-hidden />
          {t("Conectar outro canal")}
        </Link>
      </div>
    </>
  );
}
