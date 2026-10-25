/**
 * Porta agnóstica do gatilho de tráfego pago: a rota pública pede aqui, sem nomear o
 * provider (doutrina de restrição de canal, invariante 1). Hoje só o canal nativo
 * implementa; a lógica mora em `./verdash/trafego-pago-push.ts`.
 */
export {
  canalDoToken,
  dispararEnriquecimento,
  TETO_DO_CORPO_BYTES,
} from "./verdash/trafego-pago-push";
