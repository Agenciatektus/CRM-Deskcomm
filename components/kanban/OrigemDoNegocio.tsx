"use client";

import { useContact } from "@/hooks/contacts/useContact";
import { useHierarquiaDoAnuncio } from "@/hooks/contacts/useHierarquiaDoAnuncio";
import { useT } from "@/hooks/i18n/useT";
import { origemDoContato } from "@/lib/leads/origem-do-contato";

interface Props {
  contactId: string | null;
}

function texto(valor: unknown): string | null {
  return typeof valor === "string" && valor.trim() !== "" ? valor.trim() : null;
}

function Linha({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-text-muted">{rotulo}</dt>
      <dd className="mt-0.5 break-words text-sm">{children}</dd>
    </div>
  );
}

/**
 * DE ONDE O CLIENTE VEIO, dentro do dossiê do negócio.
 *
 * Antes esta resposta só existia na ficha do contato (`/app/contacts/[id]`), e
 * quem trabalha pelo funil nunca chega lá: o dossiê abria sem origem, campanha
 * ou anúncio. Lê o MESMO `source_metadata` e a MESMA precedência da ficha
 * (`origemDoContato`), e pede o nome da campanha à plataforma só quando há um
 * anúncio e ainda não há nome (cota é o recurso escasso, não a latência).
 *
 * Some inteira quando o contato não tem origem alguma além da coluna `source`
 * vazia: uma seção de travessões leria como cadastro quebrado.
 */
export function OrigemDoNegocio({ contactId }: Props) {
  const t = useT();
  const { data } = useContact(contactId ?? "");
  const contato = data?.data;
  const meta = (contato?.source_metadata ?? {}) as Record<string, unknown>;

  const adId = texto(meta.ad_id);
  const jaTemNome = texto(meta.campaign_name) !== null;
  const hierarquia = useHierarquiaDoAnuncio(contactId ?? "", adId !== null && !jaTemNome);

  if (!contato) return null;

  const origem = origemDoContato(
    hierarquia.data ? { ...meta, ...hierarquia.data } : meta,
    contato.source ?? "",
  );
  const cliqueId = texto(meta.ad_source_id);
  const link = texto(meta.ad_source_url);
  const capturado = texto(meta.ad_captured_at);
  const tituloDoAnuncio = texto(meta.ad_title);

  const temAlgo =
    origem.origem !== "" ||
    origem.campanha ||
    origem.conjunto ||
    origem.anuncio ||
    adId ||
    cliqueId;
  if (!temAlgo) return null;

  return (
    <section className="border-b border-border py-3" data-testid="origem-do-negocio">
      <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-text-muted">
        {t("Origem")}
      </h3>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
        {origem.origem !== "" && <Linha rotulo={t("Origem")}>{origem.origem}</Linha>}
        {origem.campanha && <Linha rotulo={t("Campanha")}>{origem.campanha}</Linha>}
        {origem.conjunto && <Linha rotulo={t("Conjunto")}>{origem.conjunto}</Linha>}
        {origem.anuncio && <Linha rotulo={t("Anúncio")}>{origem.anuncio}</Linha>}
        {tituloDoAnuncio && tituloDoAnuncio !== origem.anuncio && (
          <Linha rotulo={t("Título do anúncio")}>{tituloDoAnuncio}</Linha>
        )}
        {origem.posicionamento && (
          <Linha rotulo={t("Posicionamento")}>{origem.posicionamento}</Linha>
        )}
        {adId && <Linha rotulo={t("ID do anúncio")}>{adId}</Linha>}
        {cliqueId && <Linha rotulo={t("ID do clique")}>{cliqueId}</Linha>}
        {capturado && (
          <Linha rotulo={t("Primeiro contato pelo anúncio")}>
            {new Date(capturado).toLocaleString()}
          </Linha>
        )}
        {link && (
          <Linha rotulo={t("Link do anúncio")}>
            {/^https?:\/\//i.test(link) ? (
              <a href={link} target="_blank" rel="noopener noreferrer" className="underline">
                {t("Abrir")}
              </a>
            ) : (
              link
            )}
          </Linha>
        )}
      </dl>
      {origem.semPosicionamentoDeAnuncio && (
        <p className="mt-2 text-xs text-text-muted">
          {t("A plataforma não informa o posicionamento de cada clique em anúncio.")}
        </p>
      )}
    </section>
  );
}
