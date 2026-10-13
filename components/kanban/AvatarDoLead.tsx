"use client";

import { useState } from "react";

import { DISCO } from "@/components/inbox/ChannelLogo";
import { useT } from "@/hooks/i18n/useT";
import { classeDaCorDoAvatar } from "@/lib/inbox/cor-do-avatar";
import { ROTULO_DO_CANAL, type CanalDoCard } from "@/lib/kanban/identidade-do-card";
import { ChatCircle, InstagramLogo, WhatsappLogo } from "@/lib/ui/icons";
import { cn } from "@/lib/utils";

const SELO: Record<CanalDoCard, { Icon: typeof ChatCircle; disco: string }> = {
  whatsapp: { Icon: WhatsappLogo, disco: DISCO.whatsapp },
  direct: { Icon: InstagramLogo, disco: DISCO.instagram },
  comentario: { Icon: ChatCircle, disco: DISCO.instagram },
};

interface Props {
  /** Semente da cor (id do contato; sem contato, o id do lead). */
  semente: string;
  iniciais: string;
  /** Rota da foto (`/api/v1/contacts/:id/avatar`), só quando há arquivo. */
  foto: string | null;
  canal: CanalDoCard | null;
  compacto?: boolean;
}

/**
 * O avatar do LEAD no card do funil, com o selo do canal no canto.
 *
 * `<img>` simples, e não `next/image`: a rota da foto redireciona para uma URL
 * assinada do Storage (domínio externo, que expira), e o otimizador do Next
 * não tem o que fazer com ela. Se a foto não carrega, ficam as iniciais —
 * mesma cor por pessoa da Inbox (`classeDaCorDoAvatar`).
 */
export function AvatarDoLead({ semente, iniciais, foto, canal, compacto = false }: Props) {
  const t = useT();
  const [falhou, setFalhou] = useState(false);
  const selo = canal ? SELO[canal] : null;
  return (
    <span
      className={cn(
        "relative grid shrink-0 place-items-center rounded-full font-bold",
        compacto ? "size-7 text-[10.5px]" : "size-9 text-[12.5px] mb:size-11 mb:text-sm",
        classeDaCorDoAvatar(semente),
      )}
    >
      <span aria-hidden>{iniciais}</span>
      {foto && !falhou && (
        // eslint-disable-next-line @next/next/no-img-element -- ver o comentário do componente
        <img
          src={foto}
          alt=""
          loading="lazy"
          onError={() => setFalhou(true)}
          className="absolute inset-0 size-full rounded-full object-cover"
        />
      )}
      {selo && canal && (
        <span
          role="img"
          aria-label={`${t("Origem")}: ${t(ROTULO_DO_CANAL[canal])}`}
          title={t(ROTULO_DO_CANAL[canal])}
          className={cn(
            "absolute -right-1 -bottom-1 grid place-items-center rounded-full text-white ring-2 ring-surface",
            compacto ? "size-3.75" : "size-4.25",
            selo.disco,
          )}
        >
          <selo.Icon size={compacto ? 9 : 10} weight="fill" aria-hidden />
        </span>
      )}
    </span>
  );
}
