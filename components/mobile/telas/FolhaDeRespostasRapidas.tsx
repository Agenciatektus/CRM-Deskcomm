"use client";
import type { MessageTemplate } from "@/hooks/inbox/useMessageTemplates";
import { useT } from "@/hooks/i18n/useT";
import { Lightning } from "@/lib/ui/icons";

import { FolhaInferior, ItemDaFolha } from "../FolhaInferior";

/**
 * As respostas rápidas em FOLHA, no celular (o ⚡ do composer do protótipo). No
 * desktop o botão "/" escreve "/" no campo e abre a lista ancorada nele; no celular
 * a lista ancorada fica atrás do teclado, então o botão abre esta folha (teclado
 * fechado). Escolher aplica a resposta do MESMO jeito (`applyTemplate` do composer).
 * Digitar "/" no campo continua abrindo a lista de sempre.
 */
export function FolhaDeRespostasRapidas({
  aberta,
  aoMudar,
  respostas,
  aoEscolher,
}: {
  aberta: boolean;
  aoMudar: (aberta: boolean) => void;
  respostas: MessageTemplate[];
  aoEscolher: (resposta: MessageTemplate) => void;
}) {
  const t = useT();
  return (
    <FolhaInferior aberto={aberta} aoMudar={aoMudar} titulo={t("Respostas rápidas")}>
      {respostas.length === 0 ? (
        <p className="px-3 py-6 text-center text-sm text-text-muted">{t("Nenhum template. Crie em Configurações.")}</p>
      ) : (
        respostas.map((r) => (
          <ItemDaFolha
            key={r.id}
            icone={Lightning}
            titulo={r.title}
            apoio={r.body.length > 90 ? `${r.body.slice(0, 90)}…` : r.body}
            aoTocar={() => {
              aoMudar(false);
              aoEscolher(r);
            }}
          />
        ))
      )}
    </FolhaInferior>
  );
}
