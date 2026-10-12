"use client";
import { useRef, useState, type ComponentType, type PointerEvent, type ReactNode } from "react";

import { cn } from "@/lib/utils";

export interface AcaoDoGesto {
  id: string;
  rotulo: string;
  icone: ComponentType<{ size?: number; "aria-hidden"?: boolean }>;
  /** Classe de fundo (um token `bg-mb-gesto-*`). */
  fundo: string;
  aoTocar: () => void;
}

/** Quanto mexer antes de decidir o eixo (px): abaixo disso, ainda é toque. */
const ZONA_MORTA = 6;

/**
 * O gesto de deslizar da linha (o `.sw` do protótipo). Arrastar para a DIREITA mostra
 * as ações da esquerda; para a ESQUERDA, as da direita. Cada ação tem a largura
 * `--mb-acao-gesto`. O eixo dominante decide: vertical é a rolagem da lista (o
 * `touch-action: pan-y` deixa o navegador rolar), horizontal é o gesto. Soltar além
 * de uma ação deixa a linha aberta; tocar nela de novo fecha, sem abrir a conversa.
 *
 * Acessibilidade: as ações ficam escondidas do leitor e fora do Tab enquanto a linha
 * está fechada. As mesmas ações existem no menu da linha ("…" / Mais).
 */
export function LinhaDeslizante({
  esquerda,
  direita,
  children,
}: {
  esquerda: AcaoDoGesto[];
  direita: AcaoDoGesto[];
  children: ReactNode;
}) {
  const [deslocamento, setDeslocamento] = useState(0);
  const [arrastando, setArrastando] = useState(false);
  const gesto = useRef<{ x: number; y: number; base: number; eixo: "x" | "y" | null; id: number } | null>(null);
  const arrastou = useRef(false);
  const acaoRef = useRef<HTMLButtonElement | null>(null);

  // A largura real da ação (o token `--mb-acao-gesto`); 72 é o valor do protótipo, de reserva.
  const largura = () => acaoRef.current?.offsetWidth || 72;
  const limites = () => ({ max: esquerda.length * largura(), min: -direita.length * largura() });

  const aoApertar = (e: PointerEvent<HTMLDivElement>) => {
    arrastou.current = false;
    gesto.current = { x: e.clientX, y: e.clientY, base: deslocamento, eixo: null, id: e.pointerId };
  };
  const aoMover = (e: PointerEvent<HTMLDivElement>) => {
    const g = gesto.current;
    if (!g || g.id !== e.pointerId) return;
    const dx = e.clientX - g.x;
    const dy = e.clientY - g.y;
    if (!g.eixo) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) < ZONA_MORTA) return;
      g.eixo = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
      if (g.eixo === "x") {
        e.currentTarget.setPointerCapture(e.pointerId);
        setArrastando(true);
      }
    }
    if (g.eixo !== "x") return;
    arrastou.current = true;
    const { max, min } = limites();
    setDeslocamento(Math.min(max, Math.max(min, g.base + dx)));
  };
  const aoSoltar = () => {
    const g = gesto.current;
    gesto.current = null;
    setArrastando(false);
    if (!g || g.eixo !== "x") return;
    const { max, min } = limites();
    const metade = largura() / 2;
    setDeslocamento((atual) => (atual > metade ? max : atual < -metade ? min : 0));
  };
  // Tocar na linha aberta (ou soltar um arraste) fecha, e não abre a conversa.
  const aoClicar = (e: React.MouseEvent) => {
    if (arrastou.current || deslocamento !== 0) {
      e.preventDefault();
      e.stopPropagation();
      arrastou.current = false;
      setDeslocamento(0);
    }
  };

  const aberta = deslocamento !== 0;
  const botoes = (acoes: AcaoDoGesto[], lado: "esquerda" | "direita") => (
    <div className={cn("flex", lado === "direita" && "ml-auto")}>
      {acoes.map((a, i) => (
        <button
          key={a.id}
          ref={i === 0 && lado === "esquerda" ? acaoRef : undefined}
          type="button"
          tabIndex={aberta ? 0 : -1}
          onClick={() => {
            setDeslocamento(0);
            a.aoTocar();
          }}
          className={cn(
            "flex w-(--mb-acao-gesto) flex-col items-center justify-center gap-1 text-xs font-bold text-white",
            a.fundo,
          )}
        >
          <a.icone size={22} aria-hidden />
          {a.rotulo}
        </button>
      ))}
    </div>
  );

  return (
    <div className="relative overflow-hidden">
      <div aria-hidden={!aberta} className="absolute inset-0 flex">
        {botoes(esquerda, "esquerda")}
        {botoes(direita, "direita")}
      </div>
      <div
        onPointerDown={aoApertar}
        onPointerMove={aoMover}
        onPointerUp={aoSoltar}
        onPointerCancel={aoSoltar}
        onClickCapture={aoClicar}
        style={{ transform: deslocamento ? `translateX(${deslocamento}px)` : undefined }}
        className={cn(
          "relative z-1 touch-pan-y bg-surface select-none",
          !arrastando && "transition-transform duration-300 ease-emphasized motion-reduce:transition-none",
        )}
      >
        {children}
      </div>
    </div>
  );
}
