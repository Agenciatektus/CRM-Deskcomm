// This file configures the initialization of Sentry for edge features (middleware, edge routes, and so on).
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";
import { resolveSentryDsn, isCommunityDsn } from "./lib/sentry/dsn";
import { opcoesDePrivacidade } from "./lib/sentry/privacidade";
import { taxaDeTraces } from "./lib/sentry/amostragem";

const sentryDsn = resolveSentryDsn(process.env.SENTRY_DSN);

Sentry.init({
  dsn: sentryDsn,

  // No Sentry da comunidade, só erro (issue #100). Ver isCommunityDsn().
  // 10% por padrão; SENTRY_TRACES_SAMPLE_RATE ajusta. Ver lib/sentry/amostragem.ts.
  tracesSampleRate: taxaDeTraces(process.env.SENTRY_TRACES_SAMPLE_RATE, isCommunityDsn(sentryDsn)),

  // Coleta restrita + scrub, num ponto só (Sentry 11 coleta amplo por default).
  ...opcoesDePrivacidade,
});
