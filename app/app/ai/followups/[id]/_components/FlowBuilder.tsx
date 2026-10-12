"use client";

import dynamic from "next/dynamic";

import { Skeleton } from "@/components/ui/skeleton";
import type { FollowupFlowDetailRow } from "@/hooks/followup/useFollowupFlow";

/**
 * @xyflow/react is a large dependency — this is the ONLY route that loads it.
 * `ssr:false` + dynamic import keeps it out of the main bundle entirely; see
 * the bundle delta note in the task report.
 */
const FlowCanvas = dynamic(() => import("./FlowCanvas").then((m) => m.FlowCanvas), {
  ssr: false,
  loading: () => (
    <div className="flex h-full min-h-[600px] items-center justify-center p-6">
      <Skeleton className="h-full w-full" />
    </div>
  ),
});

interface Props {
  flowId: string;
  initialData: FollowupFlowDetailRow;
}

/**
 * No celular o editor ocupa a tela entre a barra de cima e a área segura (a barra
 * inferior sai nesta rota, `ehTelaCheia`): desconta o respiro do `main` e não pede
 * os 600px do desktop.
 */
export function FlowBuilder({ flowId, initialData }: Props) {
  return (
    <div
      className="flex h-full min-h-[600px] flex-1 flex-col mb:-m-6 mb:h-[calc(100dvh-var(--mb-casca-topo)-var(--mb-casca-baixo))] mb:min-h-0 mb:flex-none"
      data-testid="flow-builder-shell"
    >
      <FlowCanvas flowId={flowId} initialData={initialData} />
    </div>
  );
}
