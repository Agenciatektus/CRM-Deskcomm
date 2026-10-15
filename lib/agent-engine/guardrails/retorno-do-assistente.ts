/**
 * Detector determinístico de PROMESSA DE RETORNO DO PRÓPRIO ASSISTENTE (issue #2916) —
 * o sinal LÉXICO que faltava ao `casePromiseGate`.
 *
 * ## O defeito medido (issue #2916, emersonraza, 2026-10-14)
 *
 * O cliente pede "pode ser daqui a duas horas" e o agente responde "Combinado, retomamos
 * daqui a duas horas." — SEM chamar nenhuma ferramenta no turno. O cliente fica esperando
 * uma mensagem que não vem. Medido pelo autor, mesmo prompt: **3 de 11 execuções** do
 * cenário, apesar da regra explícita no prompt ("a primeira ferramenta do turno é
 * crm_schedule_followup; escreva a resposta só depois que ela confirmar").
 *
 * ## Por que as camadas existentes não pegam
 *
 * O `casePromiseGate` (`before-send.ts`) já cobre a promessa de retorno do assistente
 * desde o #1873: ele libera "a promessa de retorno do próprio assistente" só quando há
 * `schedule_followup` agendado no turno (`followup.agendadoNesteTurno`). O problema é o
 * SINAL que a marcava: era só o SEMÂNTICO (`semantic.ts` → `retornoSoDoAssistente`), e o
 * classificador é um modelo — ele varia entre execuções e não marca "retomamos daqui a
 * duas horas" de forma confiável (não é "alguém da empresa volta a falar", por isso a
 * pergunta 2 não a considera `prometeuRetornoHumano`). O detector LÉXICO de humano
 * (`detectHumanPromise`) também não a pega: ela não nomeia alvo humano nenhum.
 * Resultado: as duas camadas deixam passar, e a frase sai sem destino.
 *
 * Este módulo é o sinal que faltava, na família do `detectHumanPromise`: uma regex PT-BR
 * que reconhece a frase em que o ASSISTENTE se compromete a RETOMAR A CONVERSA. O
 * `casePromiseGate` o consome em OU com o semântico, e SEMPRE subordinado a
 * `followup.agendadoNesteTurno` — sem follow-up agendado, é veto com ensino (o modelo
 * chama `schedule_followup` ou reformula).
 *
 * ## Conservador de propósito — vocabulário MÍNIMO (medido)
 *
 * Mesma disciplina do `human-promise.ts`: na dúvida entre falso-positivo e falso-negativo,
 * o gate prioriza NÃO vetar texto legítimo (veto é bloqueio de envio). Por isso o
 * vocabulário cobre só a família MEDIDA — verbos de RETOMAR A CONVERSA em 1ª pessoa, do
 * que o próprio assistente faz — e deliberadamente NÃO inclui:
 *
 *   - "te retorno" / "te dou um retorno" / "te retorno com a proposta": é a promessa de
 *     retorno de CONTEÚDO que o classificador semântico já cobre (`prometeuRetornoHumano`),
 *     e cuja inclusão aqui reabriria o que `tests/unit/cerca-prometer-de-ponta-a-ponta.test.ts`
 *     congela (as cinco frases que vazam SEM a camada semântica seguem vazando);
 *   - "te aviso" sozinho: é o território do `agendaStallGate` ("vou verificar a agenda e
 *     já te aviso") e do próprio léxico de humano ("assim que liberarem eu te aviso");
 *   - "nos falamos": ambíguo entre passado ("nos falamos sobre isso na visita") e futuro.
 *
 * As bordas adversas medidas (não casam): "Posso te chamar de Marcos?", "Como prefere que
 * eu te chame?", "Te chamei ontem", "Retomando o que conversamos…", "O sistema retoma
 * automaticamente", "Vou chamar o responsável" (tem alvo humano — o léxico o pega).
 */

/**
 * Normaliza como o `human-promise.ts`: minúsculas + sem diacríticos (NFD). Casa acento e
 * caixa uniformemente. O `\b` do JS é ASCII — por isso normalizar ANTES de casar, para
 * que "volto a falar" case tanto "falar" quanto "falávamos".
 */
function normalize(body: string): string {
  return body
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

/**
 * Os padrões do vocabulário mínimo. Cada um exige a 1ª pessoa do próprio assistente — é o
 * que separa "VOU retomar" (promessa) de "retomar" num gerúndio de assunto ("Retomando o
 * que conversamos…") ou de uma 3ª pessoa de sistema ("o sistema retoma automaticamente").
 */
const PATTERNS: readonly RegExp[] = [
  // (1) RETOMAR a conversa/contato: retomo, retomamos, retomaremos, retomar. O caso medido
  //     ("retomamos daqui a duas horas") mora aqui. "retoma"/"retomando" ficam FORA de
  //     propósito: "o sistema retoma" (3ª pessoa) e "Retomando o que conversamos"
  //     (gerúndio de assunto) são texto legítimo e casariam por engano.
  /\bretom(?:o|amos|aremos|ar)\b/,
  // (2) VOLTAR a falar/conversar/contatar: "volto a falar", "volto a te conversar",
  //     "vou voltar a falar", "voltarei a contatar". O verbo de retomada já é futuro.
  /\b(?:volto|voltarei|vou voltar)\b[^.!?\n]{0,25}\b(?:fal|convers|contat|cham|procur|lig|escrev)\w*/,
  // (3) CHAMAR/PROCURAR/LIGAR o cliente em 1ª pessoa: "te chamo", "te procuro", "te ligo".
  //     Formas específicas (não `\w*`) para NÃO casar pergunta ("prefere que eu te chame?")
  //     nem passado ("te chamei ontem").
  /\bte\s+(?:chamo|chamarei|procuro|procurarei|ligo|ligarei)\b/,
  // (4) "chamo você" / "chamo vocês" na mesma 1ª pessoa.
  /\b(?:chamo|chamarei)\b[^.!?\n]{0,12}\b(?:voce|vc|voces)\b/,
  // (5) "a gente se fala" — futuro por construção (o passado seria "a gente se falou").
  /\ba gente se fala\b/,
];

/**
 * True se o corpo é (ou contém) uma promessa do PRÓPRIO assistente de voltar a falar com
 * o cliente — a família medida da issue #2916. Puro, sem LLM, sem I/O. Vazio = false.
 *
 * NÃO julga se a promessa é legítima: quem decide o destino (follow-up agendado × caso ×
 * veto) é o `casePromiseGate` (`before-send.ts`), com o estado do turno.
 */
export function detectarPromessaDeRetornoDoAssistente(body: string): boolean {
  if (body.trim() === "") return false;
  const text = normalize(body);
  return PATTERNS.some((re) => re.test(text));
}
