import { CABECALHOS_TEXTO, llmsCompleto } from "@/lib/llms";

export function GET() {
  return new Response(llmsCompleto(), { headers: CABECALHOS_TEXTO });
}
