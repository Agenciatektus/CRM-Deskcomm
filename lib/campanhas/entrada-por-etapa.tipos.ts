/**
 * O VOCABULÁRIO do gatilho de entrada contínua (migration 9038) — tipos e a
 * porta estreita de banco, num arquivo só.
 *
 * Separado de `entrada-por-etapa.ts` pela regra de 300 linhas do repo: lá mora a
 * DECISÃO (quem entra, quem é vetado, quando o teto do dia morde) com a doutrina
 * que a justifica, e misturar as duas coisas num arquivo faria o leitor rolar
 * declarações para achar o raciocínio. Aqui não há lógica nenhuma.
 *
 * `EntradaPorEtapaDb` é a porta: narrow por consumidor, mesma doutrina de
 * `GatilhoEtapaDb` e `SilenceSweepDb`, para a decisão ser testável sem arrastar
 * o `SupabaseClient` inteiro. O adapter de produção é `entrada-por-etapa.db.ts`.
 */
import type { MotivoDeExclusao } from "./tipos";

/** Uma campanha `running` com a entrada contínua armada NESTA etapa. */
export interface CampanhaArmada {
  id: string;
  organization_id: string;
  message_body: string | null;
  message_variants: string[] | null;
  content_version: number;
  /** A contenção do modo contínuo (CHECK `campaigns_entrada_continua_contida`). */
  teto_diario: number | null;
  /** Quando esta execução começou. `null` = campanha `running` sem carimbo: não arma. */
  started_at: string | null;
}

/** O contato, já no formato em que `motivoParaExcluir` decide. */
export interface ContatoDoAlvo {
  contactId: string;
  nome: string | null;
  telefone: string | null;
  bloqueado: boolean;
  anonimizado: boolean;
  recusouMarketing: boolean;
}

/** A linha que vai para `campaign_recipients`. */
export interface LinhaDoAlistamento {
  organization_id: string;
  campaign_id: string;
  contact_id: string;
  /** Só de quem VAI receber: telefone de excluído é PII sem finalidade. */
  recipient_address: string | null;
  status: "pending" | "skipped";
  eligibility_status: "eligible" | "excluded";
  exclusion_reason: MotivoDeExclusao | null;
  rendered_body: string | null;
  content_version: number;
  variables: Record<string, unknown>;
}

/**
 * Interface estreita de DB — mesma doutrina de `GatilhoEtapaDb`: narrow por
 * consumidor, para o teste rodar sem arrastar o `SupabaseClient` inteiro.
 */
export interface EntradaPorEtapaDb {
  /** Campanhas `running` da org com `entrada_continua` e esta etapa de entrada. */
  carregaCampanhasArmadas(orgId: string, etapaId: string): Promise<CampanhaArmada[]>;
  /** O negócio que se moveu. `null` = não existe nesta organização. */
  carregaNegocio(
    orgId: string,
    leadId: string,
  ): Promise<{ contactId: string | null; aberto: boolean } | null>;
  carregaContato(orgId: string, contactId: string): Promise<ContatoDoAlvo | null>;
  /** Este contato já está comprometido com OUTRA campanha viva da organização? */
  estaEmOutraCampanha(orgId: string, contactId: string, excetoCampanhaId: string): Promise<boolean>;
  /** O telefone está na lista de exclusão da operação (migration 0376)? */
  estaSuprimido(orgId: string, endereco: string): Promise<boolean>;
  /** Quantos ELEGÍVEIS esta campanha alistou desde `desde` (o começo do dia local). */
  alistadosDesde(orgId: string, campanhaId: string, desde: Date): Promise<number>;
  /** `false` = 23505: já há linha deste contato (ou deste telefone) nesta campanha. */
  alista(linha: LinhaDoAlistamento): Promise<boolean>;
  /** O fuso da organização — o "dia" do teto é o dia do cliente. */
  fusoDaOrganizacao(orgId: string): Promise<string>;
}

export interface EntradaPorEtapaDeps {
  db: EntradaPorEtapaDb;
  clock: () => Date;
}

export interface ResumoDaEntradaPorEtapa {
  /** `false` = evento não utilizável (sem etapa de destino, sem negócio). */
  matched: boolean;
  campanhas_armadas: number;
  alistados: number;
  /** 23505: esta pessoa já tem linha nesta campanha. Caminho normal. */
  ja_na_campanha: number;
  /** O teto do dia da campanha já foi gasto — ninguém é gravado. */
  teto_do_dia: number;
  /** Mudança de etapa ANTERIOR ao Iniciar desta execução. */
  anterior_ao_inicio: number;
  /** O negócio não tem contato, ou não está mais aberto. */
  sem_alvo: number;
  /** Entrou na etapa e virou linha EXCLUÍDA, por motivo. */
  excluidos: Partial<Record<MotivoDeExclusao, number>>;
}
