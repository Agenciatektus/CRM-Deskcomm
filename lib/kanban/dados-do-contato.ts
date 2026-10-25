import { nomeDoContato } from "@/lib/contacts/rotulo-do-contato";
import { linksParaExibir } from "@/lib/leads/links-de-contato";
import type { Lead } from "@/lib/types/leads";

type DadosDoContato = Pick<
  Lead,
  | "contact_phone"
  | "contact_email"
  | "contact_links"
  | "contact_name"
  | "contact_instagram"
  | "contact_tem_foto"
  | "contact_campanha"
  | "contact_anuncio"
>;

/** A linha de `contacts` como o quadro a lê — as colunas que esta regra usa. */
export interface LinhaDoContatoNoQuadro {
  id: string;
  phone_number: string | null;
  email: string | null;
  custom_fields: Record<string, unknown> | null;
  is_anonymized: boolean | null;
  /** O nome e a foto do card (opcionais: leitura antiga sem as colunas segue valendo). */
  name?: string | null;
  display_name?: string | null;
  instagram_username?: string | null;
  avatar_storage_path?: string | null;
  /** `source_metadata->>campaign_name` e `->>ad_name`, lidos por alias (sem trazer o jsonb inteiro, que carrega o bloco do anúncio). */
  campanha_nome?: string | null;
  anuncio_nome?: string | null;
}

/** Nome de campanha ou anúncio: texto aparado e com teto, para o payload do quadro não engordar. */
function nomeDeAnuncio(v: string | null | undefined): string | undefined {
  const limpo = (v ?? "").replace(/\s+/g, " ").trim();
  return limpo === "" ? undefined : limpo.slice(0, 160);
}

/**
 * Anexa telefone, e-mail e links do CONTATO aos leads do quadro — o que o card
 * do funil mostra sem abrir o dossiê.
 *
 * PURA de propósito: recebe as linhas de contato que a etapa dos marcadores já
 * leu (`withMarcadoresDoContato`, na rota do quadro) em vez de consultar o
 * banco de novo. Uma leitura de `contacts` por quadro, não duas — e a regra
 * fica testável sem banco, já que um `route.ts` do Next só pode exportar os
 * métodos HTTP.
 *
 * Contato anonimizado (LGPD) é PULADO, mesmo que a linha ainda carregue algum
 * valor: o quadro é a superfície com mais exposição do produto, e "apagado a
 * pedido do titular" não pode reaparecer num card.
 *
 * Vazio não vira campo: só se escreve o que existe, para o payload não engordar
 * com três chaves nulas em todo card. Negócio sem contato (ou contato que não
 * veio na leitura) passa intacto — o card dele não pode sumir.
 */
export function anexarDadosDoContato(leads: Lead[], contatos: LinhaDoContatoNoQuadro[]): Lead[] {
  const porContato = new Map<string, DadosDoContato>();
  for (const contato of contatos) {
    if (contato.is_anonymized) continue;
    const links = linksParaExibir(contato.custom_fields);
    const nome = nomeDoContato(contato);
    const arroba = contato.instagram_username?.trim().replace(/^@/, "");
    const dados: DadosDoContato = {
      ...(contato.phone_number ? { contact_phone: contato.phone_number } : {}),
      ...(contato.email ? { contact_email: contato.email } : {}),
      ...(links.length > 0 ? { contact_links: links } : {}),
      ...(nome ? { contact_name: nome } : {}),
      ...(arroba ? { contact_instagram: arroba } : {}),
      // A rota da foto (`/api/v1/contacts/:id/avatar`) recusa contato
      // anonimizado; este laço já pulou os anonimizados acima.
      ...(contato.avatar_storage_path ? { contact_tem_foto: true } : {}),
      ...(nomeDeAnuncio(contato.campanha_nome) ? { contact_campanha: nomeDeAnuncio(contato.campanha_nome) } : {}),
      ...(nomeDeAnuncio(contato.anuncio_nome) ? { contact_anuncio: nomeDeAnuncio(contato.anuncio_nome) } : {}),
    };
    if (Object.keys(dados).length > 0) porContato.set(contato.id, dados);
  }
  if (porContato.size === 0) return leads;

  return leads.map((lead) => {
    const dados = lead.contact_id ? porContato.get(lead.contact_id) : undefined;
    return dados ? { ...lead, ...dados } : lead;
  });
}
