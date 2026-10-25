import { describe, expect, it } from 'vitest';

import { estadoDoWatchdog } from '@/lib/agent-engine/edge/crm/session-reconciler';

const cred = { WAHA_API_BASE_URL: 'http://waha:3000', WAHA_API_KEY: 'k' };

describe('estadoDoWatchdog', () => {
  it('ligado com credencial e sem a variável (padrão)', () => {
    expect(estadoDoWatchdog(cred)).toBe('ligado');
  });
  it.each(['false', '0', 'no', 'off', 'flase'])('WAHA_HABILITADO=%s: OFF pelo interruptor, mesmo com credencial', (v) => {
    expect(estadoDoWatchdog({ ...cred, WAHA_HABILITADO: v })).toBe('desligado_pelo_interruptor');
  });
  it('habilitado mas sem credencial: o motivo antigo continua distinto', () => {
    expect(estadoDoWatchdog({ WAHA_HABILITADO: 'true' })).toBe('sem_credencial');
  });
});
