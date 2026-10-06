/**
 * O adapter de produção de `EntradaPorEtapaDb` sobre o client service-role.
 *
 * Mora fora de `entrada-por-etapa.ts` por duas razões. A de forma: aquele
 * arquivo já carrega a doutrina da decisão, e juntar os dois passaria das 300
 * linhas que a regra do repo manda dividir. A de fundo, que é a que importa:
 * a decisão de QUEM entra tem de ser testável sem banco, e um teste que
 * importasse o adapter arrastaria o `SupabaseClient` inteiro para dentro dela.
 *
 * `organization_id` entra em TODA consulta, explicitamente: o client admin
 * ignora RLS, e é ele que este módulo recebe (o dreno do `event_log` não tem
 * usuário). A organização vem da linha do evento, nunca de um corpo de
 * requisição.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { nomeDoContato } from "@/lib/contacts/rotulo-do-contato";
import { logger } from "@/lib/logger";

import { CAMPANHAS_VIVAS } from "./audiencia";
import { recusouMarketing } from "./elegibilidade";
import { hashDoEndereco } from "./exclusoes";
import type { CampanhaArmada, ContatoDoAlvo, EntradaPorEtapaDb } from "./entrada-por-etapa.tipos";

const COLUNAS_DA_ARMADA =
  "id, organization_id, message_body, message_variants, content_version, teto_diario, started_at";

export function createSupabaseEntradaPorEtapaDb(admin: SupabaseClient): EntradaPorEtapaDb {
  return {
    async carregaCampanhasArmadas(orgId, etapaId) {
      // `status = 'running'` e não "viva": `paused` não aborda gente nova (é o
      // que o botão promete) e `scheduled` ainda não começou. O índice parcial
      // da 9038 cobre `(organization_id, entrada_etapa_id) where
      // entrada_continua`, que é o predicado desta consulta.
      const { data, error } = await admin
        .from("campaigns")
        .select(COLUNAS_DA_ARMADA)
        .eq("organization_id", orgId)
        .eq("entrada_continua", true)
        .eq("entrada_etapa_id", etapaId)
        .eq("status", "running");
      if (error) throw new Error(`campanha_entrada_armadas: ${error.message}`);
      return (data ?? []) as unknown as CampanhaArmada[];
    },

    async carregaNegocio(orgId, leadId) {
      const { data, error } = await admin
        .from("crm_leads")
        .select("contact_id, status")
        .eq("organization_id", orgId)
        .eq("id", leadId)
        .maybeSingle();
      if (error) throw new Error(`campanha_entrada_negocio: ${error.message}`);
      if (!data) return null;
      const linha = data as { contact_id: string | null; status: string | null };
      return { contactId: linha.contact_id, aberto: linha.status === "open" };
    },

    async carregaContato(orgId, contactId) {
      const { data, error } = await admin
        .from("contacts")
        .select("id, name, display_name, phone_number, is_blocked, is_anonymized, is_merged_into, kind, consent")
        .eq("organization_id", orgId)
        .eq("id", contactId)
        .maybeSingle();
      if (error) throw new Error(`campanha_entrada_contato: ${error.message}`);
      if (!data) return null;
      const c = data as {
        id: string;
        name: string | null;
        display_name: string | null;
        phone_number: string | null;
        is_blocked: boolean;
        is_anonymized: boolean;
        is_merged_into: string | null;
        kind: string | null;
        consent: unknown;
      };
      // Placeholder de GRUPO e cadastro MESCLADO saem aqui, pelos mesmos motivos
      // de `buscarCandidatos`: campanha é 1:1 por doutrina (o grupo não tem
      // opt-in individual por trás do registro técnico) e quem responde por um
      // cadastro mesclado é o sobrevivente. Devolvidos como `null` — o chamador
      // os conta em `sem_alvo`, e nenhuma linha de exclusão é gravada em nome de
      // um registro que não é a pessoa.
      if (c.kind !== "person" || c.is_merged_into) return null;
      const alvo: ContatoDoAlvo = {
        contactId: c.id,
        nome: nomeDoContato(c),
        telefone: c.phone_number,
        bloqueado: !!c.is_blocked,
        anonimizado: !!c.is_anonymized,
        recusouMarketing: recusouMarketing(c.consent),
      };
      return alvo;
    },

    async estaEmOutraCampanha(orgId, contactId, excetoCampanhaId) {
      // Consulta por CONTATO, e não o `Set` de `contatosJaEmCampanha`: aquele
      // carrega todos os destinatários de todas as campanhas vivas da
      // organização, o que é certo para classificar uma lista de 500 de uma vez
      // e errado para responder sobre UMA pessoa a cada card arrastado.
      const { data: vivas, error } = await admin
        .from("campaigns")
        .select("id")
        .eq("organization_id", orgId)
        .in("status", CAMPANHAS_VIVAS as unknown as string[])
        .neq("id", excetoCampanhaId);
      if (error) throw new Error(`campanha_entrada_vivas: ${error.message}`);
      const ids = (vivas ?? []).map((c) => (c as { id: string }).id);
      if (ids.length === 0) return false;
      const { count, error: erroDest } = await admin
        .from("campaign_recipients")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", orgId)
        .eq("contact_id", contactId)
        .in("campaign_id", ids);
      if (erroDest) throw new Error(`campanha_entrada_comprometido: ${erroDest.message}`);
      return (count ?? 0) > 0;
    },

    async estaSuprimido(orgId, endereco) {
      if (endereco.trim() === "") return false;
      const { data, error } = await admin
        .from("campaign_suppressions")
        .select("id")
        .eq("organization_id", orgId)
        .eq("recipient_address_hash", hashDoEndereco(endereco))
        .maybeSingle();
      if (error) throw new Error(`campanha_entrada_supressao: ${error.message}`);
      return !!data;
    },

    async alistadosDesde(orgId, campanhaId, desde) {
      // Só os ELEGÍVEIS: o excluído não recebeu mensagem nenhuma, e contá-lo
      // faria uma etapa cheia de bloqueados esgotar o teto do dia de uma
      // campanha que não abordou ninguém.
      const { count, error } = await admin
        .from("campaign_recipients")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", orgId)
        .eq("campaign_id", campanhaId)
        .eq("eligibility_status", "eligible")
        .gte("created_at", desde.toISOString());
      if (error) throw new Error(`campanha_entrada_teto: ${error.message}`);
      return count ?? 0;
    },

    async alista(linha) {
      const { error } = await admin.from("campaign_recipients").insert(linha);
      // 23505 = `campaign_recipients_contato_unico` ou
      // `campaign_recipients_endereco_unico`: esta pessoa (ou este telefone) já
      // tem linha nesta campanha. Caminho NORMAL — é o anti-repetição do card
      // que entra e sai da etapa.
      if (error) {
        if (error.code === "23505") return false;
        throw new Error(`campanha_entrada_alistamento: ${error.message}`);
      }
      return true;
    },

    async fusoDaOrganizacao(orgId) {
      const { data, error } = await admin
        .from("organizations")
        .select("timezone")
        .eq("id", orgId)
        .maybeSingle();
      if (error) {
        // Falha de leitura do fuso não pode derrubar o alistamento: o fuso só
        // decide onde o DIA começa, e o padrão do produto é o mesmo que a
        // porta da cadência usa.
        logger.warn("[campanha] fuso da organização indisponível no gatilho de etapa", {
          organizacao: orgId,
          motivo: error.message,
        });
        return "America/Sao_Paulo";
      }
      const tz = (data as { timezone: string | null } | null)?.timezone;
      return (tz ?? "America/Sao_Paulo") || "America/Sao_Paulo";
    },
  };
}
