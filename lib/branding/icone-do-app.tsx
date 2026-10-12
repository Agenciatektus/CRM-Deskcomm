import { ImageResponse } from "next/og";

import { marcaEhADoProduto } from "@/lib/branding";
import { logger } from "@/lib/logger";

import { SIMBOLO } from "./desenho";
import { CamadasDoSimbolo } from "./simbolo-svg";
import { letraDoIcone } from "./icone";
import {
  baseDoStorage,
  caminhoBateComPrefixo,
  PREFIXO_DA_INSTALACAO,
  TAMANHO_MAXIMO_DO_LOGO,
  urlPublicaDoLogo,
} from "./logo";
import { farejarTipo } from "./logo-arquivo";
import { type MarcaDeSaida, NEUTROS_DE_SAIDA } from "./saida";

/** Só o arquivo da instalação: nunca uma URL livre nem o logo de uma organização. */
export async function lerArquivoDoIcone(
  caminho: string | null | undefined,
): Promise<string | null> {
  const base = baseDoStorage();
  if (!caminho || !base || !caminhoBateComPrefixo(caminho, PREFIXO_DA_INSTALACAO)) return null;
  try {
    const resposta = await fetch(urlPublicaDoLogo(caminho, base), {
      redirect: "error",
      signal: AbortSignal.timeout(3000),
      cache: "no-store",
    });
    if (!resposta.ok || !resposta.body) return null;
    const leitor = resposta.body.getReader();
    const partes: Uint8Array[] = [];
    let tamanho = 0;
    while (true) {
      const { done, value } = await leitor.read();
      if (done) break;
      tamanho += value.byteLength;
      if (tamanho > TAMANHO_MAXIMO_DO_LOGO) {
        await leitor.cancel();
        return null;
      }
      partes.push(value);
    }
    const bytes = Buffer.concat(partes);
    const tipo = farejarTipo(bytes);
    return tipo ? `data:${tipo};base64,${bytes.toString("base64")}` : null;
  } catch {
    logger.warn("marca: arquivo do ícone indisponível; usando o desenho da instalação");
    return null;
  }
}

/**
 * Um PNG por tamanho do app. Sem arquivo válido, preserva símbolo ou cor + inicial.
 *
 * `mascaravel`: a versão `purpose: "maskable"` do manifesto. O Android recorta o ícone
 * num círculo ou numa gota, e só os 80% do centro são garantidos (a "zona segura").
 * O desenho encolhe para caber nela, sobre o fundo neutro que preenche o recorte.
 */
export async function gerarIconeDoApp(
  lado: 180 | 192 | 512,
  marca: MarcaDeSaida,
  arquivo: string | null,
  opcoes: { mascaravel?: boolean } = {},
): Promise<ArrayBuffer> {
  const escala = opcoes.mascaravel ? 0.72 : 1;
  const desenhar = (imagem: string | null) => {
    const produto = marcaEhADoProduto({ name: marca.nome, logoUrl: marca.logoUrl });
    const conteudo = Math.round(lado * escala);
    return new ImageResponse(
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: imagem || produto ? NEUTROS_DE_SAIDA.fundo : marca.accent,
          color: marca.accentFg,
          fontSize: Math.round(conteudo * 0.62),
        }}
      >
        {imagem ? (
          // O src é data: gerado de bytes limitados do Storage da instalação.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imagem} alt="" width={conteudo} height={conteudo} style={{ objectFit: "contain" }} />
        ) : produto ? (
          <svg
            viewBox={SIMBOLO.viewBox}
            width={Math.round(conteudo * 0.78)}
            height={Math.round(conteudo * 0.78)}
          >
            <CamadasDoSimbolo prefixo="icone" />
          </svg>
        ) : (
          (letraDoIcone(marca.nome) ?? "")
        )}
      </div>,
      { width: lado, height: lado },
    ).arrayBuffer();
  };
  try {
    return await desenhar(arquivo);
  } catch (erro) {
    if (!arquivo) throw erro;
    logger.warn("marca: não foi possível desenhar o arquivo do ícone; usando a inicial");
    return desenhar(null);
  }
}
