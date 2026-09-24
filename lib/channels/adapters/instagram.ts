/**
 * Responder no Instagram.
 *
 * ─── O ENDEREÇO É O IGSID, E NÃO HÁ RESERVA ────────────────────────────────
 *
 * No WhatsApp o adapter irmão tem três caminhos para achar o destinatário
 * (thread, telefone, identificador opaco) porque lá existe mais de uma forma de
 * endereçar a mesma pessoa. Aqui existe uma só: o id estável que a Meta emite
 * para o par (conta, pessoa). Não há telefone, e o `@` a pessoa troca quando
 * quer — endereçar por ele mandaria a mensagem para quem pegou o handle
 * abandonado.
 *
 * Sem IGSID, `resolveRecipient` devolve `null` e o handler para com
 * "não há endereço possível", que é a verdade.
 *
 * ─── UMA OPERAÇÃO, E POR QUE SÓ UMA ────────────────────────────────────────
 *
 * A plataforma expõe três (Direct, private reply e resposta pública em
 * comentário). Este adapter usa **só o Direct**, de propósito: ele é o caminho
 * do botão "responder" do Inbox, e esse botão precisa ter UM comportamento
 * previsível. Responder publicamente é outra ação, com outra consequência — uma
 * mensagem que o atendente pensou como privada aparecendo num post indexável,
 * sem desfazer que resolva —, e ela merece um gesto próprio na tela, não o
 * mesmo campo de texto.
 *
 * A trava real não está aqui: está no servidor da plataforma, que recusa
 * resposta pública quando a conta não a habilitou. Esta escolha é sobre o que o
 * Inbox OFERECE.
 *
 * ─── SEM MÍDIA, E DIZENDO POR QUÊ ──────────────────────────────────────────
 *
 * Mídia no Instagram exige URL pública com regras próprias por tipo. Recusar
 * com um motivo legível é melhor que tentar e devolver um erro da Meta que
 * ninguém entende — e muito melhor que gravar `sent` para algo que não saiu.
 */
import type {
  ChannelAdapter,
  ChannelHealth,
  ChannelTenantScope,
  OutboundEnvelope,
  RecipientInput,
} from "../types";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveVerdashCreds, verdashFunctionsUrl } from "../verdash/credentials";

/** O que a plataforma devolve. `success: false` pode vir com HTTP 200. */
interface RespostaDeEnvio {
  success?: boolean;
  error?: string;
  detalhe?: string;
  data?: { message_id?: string | null };
}

export const instagramAdapter: ChannelAdapter = {
  provider: "instagram",

  resolveRecipient(input: RecipientInput): string | null {
    // Grupo não existe no Direct: a Meta não entrega conversa de grupo por esta
    // API, e um `groupChatId` aqui seria dado de outro canal.
    if (input.isGroup) return null;
    const igsid = input.instagramIgsid?.trim();
    return igsid && igsid.length > 0 ? igsid : null;
  },

  /**
   * SEMPRE `true`, pelo mesmo motivo do canal irmão: a credencial vive na
   * SESSÃO (cifrada no banco), não no ambiente, e este método é síncrono — não
   * pode consultar o banco.
   *
   * Responder pelo env diria "não configurado" para toda instalação que
   * conectou pela tela, e o handler gravaria `queued` para sempre, sem erro,
   * com o canal funcionando.
   *
   * O custo é que quem desiste é o `send` — e ele LANÇA, em vez de devolver
   * `{externalId: null}`, para o handler gravar `failed` com motivo em vez de
   * um `sent` sem id, que diria "enviado" para algo que nunca saiu.
   */
  isConfigured(): boolean {
    return true;
  },

  codes: {
    notConfigured: "instagram_not_configured",
    sendFailed: "instagram_error",
    unknownError: "instagram_unknown",
  },

  async send(envelope: OutboundEnvelope): Promise<{ externalId: string | null }> {
    if (envelope.kind !== "text") {
      throw new Error(
        "instagram_error: este canal envia texto. Mídia no Instagram ainda não sai pelo CRM.",
      );
    }
    const texto = envelope.body?.trim();
    if (!texto) throw new Error("instagram_error: mensagem sem texto.");

    const admin = createAdminClient();
    const creds = await resolveVerdashCreds(admin, {
      organizationId: envelope.organizationId,
      instanceName: envelope.sessionRef,
    });
    if (!creds) {
      throw new Error(
        "instagram_not_configured: esta conta não tem credencial gravada. " +
          "Reconecte o Instagram pela tela de conexões.",
      );
    }
    // Sem `vinculoId` não há como pedir o envio: o Instagram só existe no modo
    // pareado — não há equivalente ao token de linha do canal irmão, porque a
    // credencial da Meta é OAuth de validade curta e quem a renova é a
    // plataforma.
    if (!creds.vinculoId) {
      throw new Error(
        "instagram_not_configured: esta conta não está pareada. " +
          "Reconecte o Instagram pela tela de conexões.",
      );
    }

    await envelope.beforeSend?.();

    let res: Response;
    try {
      res = await fetch(`${verdashFunctionsUrl().replace(/\/+$/, "")}/crm-enviar-instagram`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-crm-token": creds.token },
        body: JSON.stringify({
          operacao: "direct",
          destinatario_igsid: envelope.to,
          texto,
        }),
        signal: AbortSignal.timeout(30_000),
      });
    } catch {
      throw new Error("instagram_error: não foi possível falar com a plataforma agora.");
    }

    const json = (await res.json().catch(() => null)) as RespostaDeEnvio | null;

    if (!res.ok || json?.success !== true) {
      const codigo = json?.error ?? `http_${res.status}`;

      // A janela de 24 h é a recusa que o atendente MAIS vai ver, e é a única
      // em que não há o que reconfigurar: fora dela a Meta simplesmente não
      // deixa mandar mensagem livre. Um "falha no envio" genérico faria alguém
      // procurar defeito onde não há.
      if (codigo === "fora_da_janela") {
        throw new Error(
          "instagram_error: a pessoa não escreve há mais de 24 horas, e o Instagram " +
            "só permite responder dentro dessa janela.",
        );
      }
      if (codigo === "nao_autorizado") {
        throw new Error(
          "instagram_not_configured: o acesso desta conta foi revogado na plataforma. " +
            "Reconecte o Instagram pela tela de conexões.",
        );
      }
      throw new Error(`instagram_error: ${json?.detalhe ?? codigo}`);
    }

    // `externalId` é o que fecha o ciclo de idempotência: quando o eco desta
    // mensagem voltar pelo webhook, é por ele que a ingestão reconhece que a
    // linha já existe (unique em `organization_id, external_id`) e devolve
    // `duplicate` em vez de gravar a nossa própria mensagem duas vezes.
    return { externalId: json?.data?.message_id ?? null };
  },

  /**
   * ─── O QUE ESTA VERIFICAÇÃO ALCANÇA, E O QUE NÃO ─────────────────────────
   *
   * Ela responde a uma pergunta só: **o CRM ainda consegue pedir envio por esta
   * conta?** Isso é credencial gravada mais vínculo vivo, e é o que quebra na
   * prática — alguém revoga o acesso do CRM na plataforma e o canal fica mudo.
   *
   * O que ela NÃO alcança é o estado do token da Meta. Não há endpoint de
   * status para perguntar, e o canal irmão pode fazê-lo só porque o servidor de
   * WhatsApp expõe `/session/status`.
   *
   * Essa limitação está no `detail` de propósito, e não escondida atrás de um
   * "WORKING" liso. Um `checkHealth` que afirma saúde que não mediu é pior que
   * um canal sem `checkHealth`: o segundo é silêncio, o primeiro é um verde
   * falso que a Central repete para o operador.
   *
   * A queda do token aparece no primeiro envio, como `nao_autorizado` — e ali o
   * `send` já devolve a instrução de reconectar, em vez de "tente de novo".
   */
  async checkHealth(
    input: ChannelTenantScope & { sessionRef: string },
  ): Promise<ChannelHealth> {
    const admin = createAdminClient();
    const creds = await resolveVerdashCreds(admin, {
      organizationId: input.organizationId,
      instanceName: input.sessionRef,
    });
    if (!creds) {
      return { reachable: false, status: null, detail: "sem_credencial_para_a_sessao" };
    }
    if (!creds.vinculoId) {
      // Sem pareamento não há envio possível neste canal, e isso é um estado
      // terminal — não é "reconectando", é "não está ligado".
      return { reachable: true, status: "FAILED", detail: "conta_sem_pareamento" };
    }
    return {
      reachable: true,
      status: "WORKING",
      detail: "credencial_presente_estado_da_conta_nao_verificado",
    };
  },
};
