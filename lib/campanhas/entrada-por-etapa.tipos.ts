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
  /**
   * Esta etapa fecha o negócio (`is_won` ou `is_lost`)?
   *
   * Lida para a etapa de ORIGEM do movimento, que é quem denuncia o card
   * voltando de «Ganho» ou de «Perdido» — na volta o negócio é REABERTO por
   * `fn_crm_lead_close_on_stage`, então o estado do negócio não conta a história.
   * Falha de leitura NÃO libera: quem não consegue provar que a origem é aberta
   * trata como fechamento, porque o erro barato aqui é não abordar.
   */
  ehEtapaDeFechamento(orgId: string, stageId: string): Promise<boolean>;
  /**
   * Outra campanha da organização JÁ ABORDOU este contato, ou está A CAMINHO de
   * abordar?
   *
   * DOIS critérios, num OU (decisão do dono, 06/10/2026):
   *   (1) recebeu nos últimos `DIAS_SEM_REPETIR_A_CADENCIA` dias (`sent_at`),
   *       independente do estado da campanha — cancelar não desfaz a mensagem;
   *   (2) tem linha na fila ativa de uma campanha NÃO TERMINAL, que é o que
   *       impede duas campanhas de mandarem o primeiro contato na mesma semana.
   *
   * Linha EXCLUÍDA não conta em nenhum dos dois: este gatilho grava linha
   * também para o vetado, e vetado não recebeu nada. Doutrina completa (e as
   * duas voltas erradas que a produziram) em `entrada-por-etapa.db.ts`.
   */
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
  /**
   * O card VOLTOU de uma etapa de ganho ou de perda (P1-2 do @Cassio_SecRev).
   * `fn_crm_lead_close_on_stage` reabre o negócio nessa volta, então o veto de
   * "negócio fechado" não o pega: quem o pega é a etapa de ORIGEM.
   */
  veio_de_fechamento: number;
  /**
   * O movimento foi feito pelo passo `mover_etapa` da própria régua, e não por
   * uma pessoa. Reagir a ele fecharia o laço abordagem → passo → abordagem.
   */
  passo_de_regua: number;
  /**
   * Campanha contínua SEM teto do dia: não alista. Estado inalcançável pelo
   * produto (o CHECK da 9038 o recusa), contado porque a alternativa é alistar
   * sem conta se o CHECK não existir.
   */
  sem_teto: number;
  /** Entrou na etapa e virou linha EXCLUÍDA, por motivo. */
  excluidos: Partial<Record<MotivoDeExclusao, number>>;
}
