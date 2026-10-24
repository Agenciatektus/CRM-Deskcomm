import type { ReactNode } from "react";

/**
 * Ícones de traço (24x24) no estilo da interface do CRM. Desenhados aqui, sem pacote: a LP não
 * carrega biblioteca de ícones. Decorativos por padrão (`aria-hidden`); o texto ao lado diz o que é.
 */
const CAMINHOS: Record<string, ReactNode> = {
  inbox: <path d="M4 13l2.2-7A2 2 0 018.1 4.6h7.8A2 2 0 0117.8 6L20 13M4 13v5a2 2 0 002 2h12a2 2 0 002-2v-5M4 13h4.5l1 2.5h5l1-2.5H20" />,
  funil: (
    <>
      <rect x="3.5" y="4" width="5" height="16" rx="1.5" />
      <rect x="9.5" y="4" width="5" height="10" rx="1.5" />
      <rect x="15.5" y="4" width="5" height="13" rx="1.5" />
    </>
  ),
  radar: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="4.5" />
      <path d="M12 12l5.5-5.5" />
    </>
  ),
  agente: (
    <>
      <rect x="4.5" y="7.5" width="15" height="11" rx="3" />
      <path d="M12 4v3.5M9 12.5v1.5M15 12.5v1.5M2.5 12.5v2M21.5 12.5v2" />
    </>
  ),
  chat: <path d="M20 12a8 8 0 01-11.6 7.1L4 20l1-4A8 8 0 1120 12z" />,
  camera: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="4.5" />
      <circle cx="12" cy="12" r="3.6" />
      <circle cx="16.8" cy="7.2" r="0.6" fill="currentColor" />
    </>
  ),
  escudo: <path d="M12 3.5l7 2.6v5.4c0 4.3-2.9 7.6-7 9-4.1-1.4-7-4.7-7-9V6.1l7-2.6zM9 12l2.2 2.2L15.2 10" />,
  cadeado: (
    <>
      <rect x="5" y="10.5" width="14" height="9.5" rx="2.5" />
      <path d="M8 10.5V8a4 4 0 018 0v2.5" />
    </>
  ),
  sino: <path d="M6.5 10a5.5 5.5 0 0111 0c0 4.5 1.8 5.5 1.8 5.5H4.7S6.5 14.5 6.5 10zM10 19a2 2 0 004 0" />,
  busca: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16l4 4" />
    </>
  ),
  enviar: <path d="M20.5 3.5L10.5 13.5M20.5 3.5L14 20.5l-3.5-7-7-3.5 17-6.5z" />,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  relogio: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  usuario: (
    <>
      <circle cx="12" cy="8.5" r="3.5" />
      <path d="M5 20c.8-3.6 3.5-5.5 7-5.5s6.2 1.9 7 5.5" />
    </>
  ),
  grafico: <path d="M4 20V10M10 20V4M16 20v-8M22 20H2" />,
  tarefa: (
    <>
      <rect x="4.5" y="4" width="15" height="16" rx="2.5" />
      <path d="M8.5 9.5l1.7 1.7 3.3-3.3M8.5 15.5h7" />
    </>
  ),
  conexao: <path d="M9 7H7a4 4 0 000 8h2M15 7h2a4 4 0 010 8h-2M8.5 11h7" />,
  arquivo: (
    <>
      <path d="M6.5 3.5h7l4 4V19a1.5 1.5 0 01-1.5 1.5H6.5A1.5 1.5 0 015 19V5a1.5 1.5 0 011.5-1.5z" />
      <path d="M13.5 3.5v4h4M8.5 12.5h7M8.5 16h5" />
    </>
  ),
  seta: <path d="M5 12h14M13 6l6 6-6 6" />,
  mais: <path d="M12 5v14M5 12h14" />,
  raio: <path d="M13 3L5 13.5h5.5L10 21l8-10.5h-5.5L13 3z" />,
};

export type NomeIcone = keyof typeof CAMINHOS;

export function Icone({ nome, className = "size-4" }: { nome: NomeIcone; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {CAMINHOS[nome]}
    </svg>
  );
}
