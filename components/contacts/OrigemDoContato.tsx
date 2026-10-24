"use client";

import { useContact } from "@/hooks/contacts/useContact";
import { useHierarquiaDoAnuncio } from "@/hooks/contacts/useHierarquiaDoAnuncio";
import { useT } from "@/hooks/i18n/useT";
import { origemDoContato, type OrigemDoContato } from "@/lib/leads/origem-do-contato";

/**
 * DE ONDE O CLIENTE VEIO, num pedaço só para as telas que mostram o lead.
 *
 * O dossiê do funil e a coluna de detalhes do Inbox mostram a MESMA resposta:
 * origem, campanha, conjunto, anúncio, ids e link. Ela sai do `source_metadata`
 * do contato, pela MESMA precedência da ficha (`origemDoContato`), e o nome da
 * campanha só é pedido à plataforma quando há um anúncio e ainda não há nome
 * (cota é o recurso escasso, não a latência).
 */

export interface DadosDaOrigem {
  origem: OrigemDoContato;
  adId: string | null;
  cliqueId: string | null;
  link: string | null;
  capturado: string | null;
  tituloDoAnuncio: string | null;
  /** Uma linha para o cabeçalho de uma seção fechada: campanha, ou a origem. */
  resumo: string;
}

function texto(valor: unknown): string | null {
  return typeof valor === "string" && valor.trim() !== "" ? valor.trim() : null;
}

function hostDe(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "";
  }
}

/** `null` quando o contato não carregou ou não tem origem alguma a mostrar. */
export function useOrigemDoContato(contactId: string | null): DadosDaOrigem | null {
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

  const temAlgo =
    origem.origem !== "" ||
    origem.campanha ||
    origem.conjunto ||
    origem.anuncio ||
    adId ||
    cliqueId;
  if (!temAlgo) return null;

  return {
    origem,
    adId,
    cliqueId,
    link: texto(meta.ad_source_url),
    capturado: texto(meta.ad_captured_at),
    tituloDoAnuncio: texto(meta.ad_title),
    resumo: origem.campanha ?? origem.origem,
  };
}

function Linha({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-text-muted">{rotulo}</dt>
      <dd className="mt-0.5 break-words text-sm">{children}</dd>
    </div>
  );
}

/** Os campos da origem. Some o que não tem valor: uma grade de travessões leria como cadastro quebrado. */
export function ListaDaOrigem({ dados }: { dados: DadosDaOrigem }) {
  const t = useT();
  const { origem, adId, cliqueId, link, capturado, tituloDoAnuncio } = dados;
  return (
    <>
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
        {capturado && !Number.isNaN(Date.parse(capturado)) && (
          <Linha rotulo={t("Primeiro contato pelo anúncio")}>
            {new Date(capturado).toLocaleString()}
          </Linha>
        )}
        {link && (
          <Linha rotulo={t("Link do anúncio")}>
            {/^https?:\/\//i.test(link) && hostDe(link) !== "" ? (
              <>
                <a href={link} target="_blank" rel="noopener noreferrer" className="underline">
                  {t("Abrir")}
                </a>
                {/* O bloco é montado pelo app de quem escreveu: o host à vista deixa
                    o atendente ver para onde o link vai antes de clicar. */}
                <span className="ml-1 text-xs text-text-muted">({hostDe(link)})</span>
              </>
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
    </>
  );
}
