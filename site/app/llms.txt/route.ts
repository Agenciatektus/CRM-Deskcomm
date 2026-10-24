import { CABECALHOS_TEXTO, llmsResumo } from "@/lib/llms";

export function GET() {
  return new Response(llmsResumo(), { headers: CABECALHOS_TEXTO });
}
