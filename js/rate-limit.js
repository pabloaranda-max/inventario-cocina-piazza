// Rate limiting en memoria (R29): frena fuerza bruta contra los logins y el
// abuso casual de los endpoints abiertos. Es POR AISLAMIENTO de Worker: cada
// aislamiento lleva su propio contador, así que el límite efectivo se multiplica
// si Cloudflare rota aislamientos. Para el perfil de riesgo de esta app (URL
// privada, blanco de bajo perfil) es la defensa correcta y no cuesta nada;
// la alternativa sería una regla de WAF de pago.
// Uso: const lim = createRateLimiter({ limit, windowMs }); lim.check(clave)

export function createRateLimiter({ limit, windowMs, now = () => Date.now(), store = new Map() } = {}) {
  if (!Number.isInteger(limit) || limit < 1) throw new Error('limit debe ser entero >= 1');
  if (!(windowMs > 0)) throw new Error('windowMs debe ser > 0');

  function check(key) {
    const k = String(key);
    const t = now();
    let entry = store.get(k);
    if (!entry || t >= entry.resetAt) {
      entry = { count: 0, resetAt: t + windowMs };
      store.set(k, entry);
    }
    entry.count += 1;
    // Barrido barato de entradas muertas solo cuando el mapa crece de verdad.
    if (store.size > 5000) {
      for (const [mk, mv] of store) if (t >= mv.resetAt) store.delete(mk);
    }
    if (entry.count > limit) {
      return { allowed: false, retryAfterMs: Math.max(0, entry.resetAt - t) };
    }
    return { allowed: true, retryAfterMs: 0 };
  }

  return { check };
}
