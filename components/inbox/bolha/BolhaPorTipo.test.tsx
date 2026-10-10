/**
 * A bolha por TIPO de mensagem, no visual v2 (fase 3.5).
 *
 * O Peterson reclamou dos balões "de todo tipo de mensagem"; cada caso aqui
 * prende o que o tipo precisa mostrar e onde a hora fica (no fim do texto,
 * sobre a imagem ou numa linha própria). As cores não são testadas por valor:
 * o que se prende é o TOM (`data-tom`), que é o contrato entre a bolha e o
 * estilo, e o que some ou aparece para quem lê.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { MessageBubble } from "@/components/inbox/MessageBubble";
import { NoteCard } from "@/components/inbox/NoteCard";
import { msg } from "@/components/inbox/__fixtures__/mensagem";
import type { Note } from "@/lib/types/messaging";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

const bolha = () => screen.getByTestId("message-bubble");
/** A meta (hora e selos) é o pai do texto da hora. */
const meta = () => within(bolha()).getByText(/^\d{2}:\d{2}$/).parentElement!;

describe("bolha por tipo", () => {
  it("texto: a hora fica DENTRO da bolha, com o espaçador no fim da linha", () => {
    render(<MessageBubble message={msg({ body: "oi, tudo bem?" })} />);
    expect(meta().className).toContain("absolute");
    const p = screen.getByText("oi, tudo bem?");
    expect(p.querySelector("span[aria-hidden]")?.className).toMatch(/inline-block/);
    expect(bolha()).toHaveAttribute("data-tom", "saida");
  });

  it("recebida: tom de entrada e canto achatado embaixo à esquerda", () => {
    render(<MessageBubble message={msg({ direction: "inbound", body: "olá" })} />);
    expect(bolha()).toHaveAttribute("data-tom", "entrada");
    expect(bolha().className).toContain("rounded-bl-md");
  });

  it("citação: mostra de quem era e o trecho, dentro da bolha", () => {
    const citada = msg({ id: "c0", direction: "inbound", body: "quanto custa?" });
    render(<MessageBubble message={msg({ body: "R$ 90" })} citada={citada} />);
    expect(within(bolha()).getByText("Cliente")).toBeInTheDocument();
    expect(within(bolha()).getByText("quanto custa?")).toBeInTheDocument();
  });

  it("imagem sem legenda: a bolha encosta na foto e a hora vira pílula sobre ela", () => {
    render(<MessageBubble message={msg({ direction: "inbound", type: "image", body: null, media_storage_path: "o/c/a.jpg" })} />);
    expect(screen.getByRole("button", { name: "Ampliar imagem" })).toBeInTheDocument();
    expect(bolha().className).toContain("p-1");
    expect(meta().className).toContain("bg-neutral-950/60");
  });

  it("vídeo: controles nativos e a hora numa linha própria (não cobre os controles)", () => {
    const { container } = render(<MessageBubble message={msg({ direction: "inbound", type: "video", body: null, media_storage_path: "o/c/v.mp4" })} />);
    expect(container.querySelector("video")).not.toBeNull();
    expect(meta().className).toContain("justify-end");
    expect(meta().className).not.toContain("absolute");
  });

  it("figurinha: sem moldura de bolha", () => {
    render(<MessageBubble message={msg({ direction: "inbound", type: "sticker", body: null, media_storage_path: "o/c/s.webp" })} />);
    expect(bolha()).toHaveAttribute("data-tom", "figurinha");
    expect(screen.getByAltText("Figurinha")).toBeInTheDocument();
  });

  it("áudio: tocar e a velocidade continuam, girando 1x e 1.5x", () => {
    render(<MessageBubble message={msg({ direction: "inbound", type: "audio", body: null, media_storage_path: "o/c/a.ogg" })} />);
    expect(screen.getByRole("button", { name: "Reproduzir áudio" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Velocidade de reprodução: 1x" }));
    expect(screen.getByRole("button", { name: "Velocidade de reprodução: 1.5x" })).toBeInTheDocument();
  });

  it("documento: o cartão baixa o arquivo", () => {
    render(<MessageBubble message={msg({ type: "document", body: null, media_storage_path: "o/c/proposta.pdf", media_mime: "application/pdf", media_size_bytes: 2048 })} />);
    expect(screen.getByRole("link", { name: /Baixar/ })).toBeInTheDocument();
  });

  it("contato: o cartão mostra o nome compartilhado", () => {
    render(<MessageBubble message={msg({ direction: "inbound", type: "contact", body: null, metadata: { shared_contact: { name: "Ana Souza", phone_number: "+5511999990000" } } })} />);
    expect(screen.getByText("Ana Souza")).toBeInTheDocument();
  });

  it("apagada recebida: só o aviso, sem o texto do cliente", () => {
    render(<MessageBubble message={msg({ direction: "inbound", revoked_at: "2026-09-24T11:00:00Z", body: "segredo" })} />);
    expect(bolha()).toHaveAttribute("data-tom", "apagada");
    expect(screen.getByText("Esta mensagem foi apagada")).toBeInTheDocument();
    expect(screen.queryByText("segredo")).toBeNull();
  });

  it("editada: o selo fica ao lado da hora", () => {
    render(<MessageBubble message={msg({ edited_at: "2026-09-08T12:05:00Z" })} />);
    expect(within(meta()).getByText("editada")).toBeInTheDocument();
  });

  it("IA: tom próprio e o nome com o robô acima da bolha, fora dela", () => {
    render(<MessageBubble message={msg({ sent_via: "ai" })} />);
    expect(bolha()).toHaveAttribute("data-tom", "ia");
    expect(screen.getByText("IA")).toBeInTheDocument();
    expect(within(bolha()).queryByText("IA")).toBeNull();
  });

  it("falhou: contorno de erro e o selo 'Falhou' (a explicação segue no tooltip)", () => {
    render(<MessageBubble message={msg({ status: "failed", error_message: "Número inválido" })} />);
    expect(bolha()).toHaveAttribute("data-falhou", "true");
    expect(bolha().className).toContain("outline-error");
    expect(within(bolha()).getByText("Falhou")).toBeInTheDocument();
  });

  it("bloco: a bolha que continua o bloco não repete o nome e achata o canto de cima", () => {
    render(<MessageBubble message={msg({ sent_via: "ai" })} inicioDoBloco={false} />);
    expect(screen.queryByText("IA")).toBeNull();
    expect(bolha().className).toContain("rounded-tr-md");
  });
});

describe("botões que aparecem no hover também aparecem no foco do teclado", () => {
  // jsdom não calcula CSS: o que se prende é o caminho (Tab chega ao botão) e a
  // regra que o revela. `.x:focus-visible` (0,2,0) vence a classe da media query
  // de hover (0,1,0) em qualquer ordem do CSS gerado.
  it("Tab chega à setinha da bolha, e ela carrega focus-visible:opacity-100", async () => {
    render(<MessageBubble message={msg({ direction: "inbound" })} onResponder={vi.fn()} />);
    await userEvent.tab();
    const botao = screen.getByRole("button", { name: "Opções da mensagem" });
    expect(botao).toHaveFocus();
    expect(botao.className).toContain("focus-visible:opacity-100");
  });
});

describe("nota interna", () => {
  const nota = (over: Partial<Note> = {}): Note =>
    ({
      id: "n1",
      conversation_id: "c1",
      body: "cliente ligou reclamando",
      created_at: "2026-09-08T12:00:00.000Z",
      created_by_user_id: "u1",
      created_by_name: "Rita",
      media_storage_path: null,
      media_mime: null,
      media_size_bytes: null,
      ...over,
    }) as Note;

  it("estilo distinto (tracejado de aviso) e o aviso de que só o time vê", () => {
    render(<NoteCard note={nota()} />);
    expect(screen.getByTestId("nota-interna").className).toContain("border-dashed");
    expect(screen.getByText("Nota interna · só o time vê")).toBeInTheDocument();
    expect(screen.getByText("Rita")).toBeInTheDocument();
  });

  it("com permissão, o excluir continua lá", () => {
    const onDelete = vi.fn();
    render(<NoteCard note={nota()} onDelete={onDelete} />);
    fireEvent.click(screen.getByRole("button", { name: "Excluir nota" }));
    expect(onDelete).toHaveBeenCalledOnce();
  });

  it("o excluir é alcançável por Tab e aparece no foco", async () => {
    render(<NoteCard note={nota()} onDelete={vi.fn()} />);
    await userEvent.tab();
    const botao = screen.getByRole("button", { name: "Excluir nota" });
    expect(botao).toHaveFocus();
    expect(botao.className).toContain("focus-visible:opacity-100");
  });
});

describe("MessageBubble — contenção de layout e quebra de palavras (#1451)", () => {
  it("texto longo sem espaços (ex: chave Pix) tem quebra forçada wrap-anywhere e bolha tem min-w-0", () => {
    const pixLongo =
      "00020126580014br.gov.bcb.pix0136a1b2c3d4-e5f6-7890-abcd-ef1234567890520400005303986540510.005802BR5913TESTE TESTE6008BRASILIA62070503***6304ABCD";
    const { container } = render(<MessageBubble message={msg({ body: pixLongo })} />);

    const p = screen.getByText(pixLongo);
    expect(p).toBeInTheDocument();
    expect(p.className).toContain("wrap-anywhere");
    // O Tailwind 4 gera `.break-words` (overflow-wrap: break-word) DEPOIS da
    // classe arbitrária `[overflow-wrap:anywhere]`, com a mesma especificidade:
    // juntas, vence o break-word e a quebra forçada fica sem efeito.
    expect(p.className).not.toContain("break-words");

    // A largura máxima mora na PILHA (nome + bolha), e a bolha só encolhe
    // dentro dela: `min-w-0` nas duas é o que deixa a chave quebrar.
    const bolhaDoPix = p.closest<HTMLElement>('[data-testid="message-bubble"]');
    expect(bolhaDoPix?.className).toContain("min-w-0");
    expect(bolhaDoPix?.parentElement?.className).toContain("max-w-[min(80%,36rem)]");
    expect(bolhaDoPix?.parentElement?.className).toContain("min-w-0");
    // O pre-wrap é do TEXTO, nunca do contêiner: no contêiner ele virava
    // espaço visível entre a mídia, o cartão e a hora.
    expect(p.className).toContain("whitespace-pre-wrap");
    expect(bolhaDoPix?.className).not.toContain("whitespace-pre-wrap");

    const linha = container.firstElementChild as HTMLElement;
    expect(linha.className).toContain("min-w-0");
  });
});
describe("pino compartilhado pelo cliente", () => {
  it("vira cartão que abre o mapa, no lugar do link cru", () => {
    render(
      <MessageBubble
        message={msg({
          direction: "inbound",
          sent_via: "external_device",
          type: "location",
          body: "📍 https://maps.google.com/?q=-25.33,-57.54",
          metadata: { location: { latitude: -25.33, longitude: -57.54 } },
        })}
      />,
    );
    const link = screen.getByRole("link", { name: /Abrir no mapa/ });
    expect(link.getAttribute("href")).toBe("https://maps.google.com/?q=-25.33,-57.54");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(screen.queryByText("📍 https://maps.google.com/?q=-25.33,-57.54")).toBeNull();
  });

  it("sem coordenadas, o corpo aparece como sempre", () => {
    render(<MessageBubble message={msg({ direction: "inbound", type: "location", body: "📍 Location" })} />);
    expect(screen.getByText("📍 Location")).toBeTruthy();
    expect(screen.queryByRole("link", { name: /Abrir no mapa/ })).toBeNull();
  });
});

/**
 * O remetente de GRUPO, acima do balão recebido.
 *
 * `metadata.group_sender` só é lido por `lerRemetenteDeGrupo`
 * (`lib/messaging/remetente-de-grupo.ts`, Task 2) — este arquivo não conhece o
 * formato bruto, só o resultado da leitura. Sem o nome de quem mandou, uma
 * conversa de grupo lida no CRM mostra toda mensagem como se fosse da mesma
 * pessoa, e é exatamente o WhatsApp que não faz essa confusão.
 */
describe("MessageBubble — remetente de grupo", () => {
  it("mensagem de grupo mostra quem mandou acima do balão", () => {
    render(
      <MessageBubble
        message={msg({
          direction: "inbound",
          body: "bom dia",
          metadata: { group_sender: { name: "Maria", phone: "+5521999990000", lid: null } },
        })}
      />,
    );
    expect(screen.getByText("Maria · +5521999990000")).toBeInTheDocument();
  });

  it("mensagem individual não mostra remetente", () => {
    render(
      <MessageBubble message={msg({ direction: "inbound", body: "bom dia", metadata: {} })} />,
    );
    expect(screen.queryByText(/·/)).toBeNull();
  });

  it("mensagem outbound não mostra remetente de grupo mesmo com metadata presente", () => {
    // `lerRemetenteDeGrupo` só é chamado para `inbound` no componente — uma
    // mensagem que ESTE CRM mandou não tem "quem mandou" a descobrir.
    render(
      <MessageBubble
        message={msg({
          direction: "outbound",
          body: "bom dia",
          metadata: { group_sender: { name: "Maria", phone: "+5521999990000", lid: null } },
        })}
      />,
    );
    expect(screen.queryByText("Maria · +5521999990000")).toBeNull();
  });
});

describe("bolha sem conteúdo nunca fica vazia", () => {
  it("tipo que o canal não soube ler: diz qual é e manda ver no celular", () => {
    render(<MessageBubble message={msg({
      direction: "inbound", body: null, metadata: { tipo_nao_suportado: "placeholderMessage" },
    })} />);
    expect(within(bolha()).getByText("Mensagem não suportada (tipo placeholderMessage). Veja no celular.")).toBeInTheDocument();
  });

  it("texto vazio sem mídia (linha antiga, gravada antes do conserto): aviso genérico", () => {
    render(<MessageBubble message={msg({ direction: "inbound", body: null })} />);
    expect(within(bolha()).getByText("Mensagem sem conteúdo. Veja no celular.")).toBeInTheDocument();
  });

  it("tipo de mídia sem arquivo cita o tipo do banco", () => {
    render(<MessageBubble message={msg({ direction: "inbound", type: "audio", body: null })} />);
    expect(within(bolha()).getByText("Mensagem não suportada (tipo audio). Veja no celular.")).toBeInTheDocument();
  });

  it("valor estranho no metadata não vira rótulo na tela", () => {
    render(<MessageBubble message={msg({
      direction: "inbound", body: null, metadata: { tipo_nao_suportado: "<b>clique aqui</b>" },
    })} />);
    expect(within(bolha()).getByText("Mensagem sem conteúdo. Veja no celular.")).toBeInTheDocument();
  });

  it("texto comum não mostra o aviso", () => {
    render(<MessageBubble message={msg({ direction: "inbound", body: "oi" })} />);
    expect(within(bolha()).queryByText(/Veja no celular/)).toBeNull();
  });
});
