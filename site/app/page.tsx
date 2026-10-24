/** Esqueleto da Fase 0. A página de verdade nasce nas fases seguintes do plano. */
export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col justify-center gap-4 px-6">
      <p className="font-mono text-sm text-text-subtle">site/ · Fase 0</p>
      <h1 className="text-3xl font-bold tracking-tight">LP do CRM em construção</h1>
      <p className="text-text-muted">
        Este app ainda não está roteado em produção. O CRM segue servindo a raiz.
      </p>
    </main>
  );
}
