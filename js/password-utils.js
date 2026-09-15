// Contraseñas del Worker (R29): PBKDF2-SHA256 con sal por usuario, con soporte
// de verificación del SHA-256 plano heredado para migrar sin tocar la D1 a mano.
// La propiedad que este archivo protege por encima de todas: un hash viejo tiene
// que seguir verificando OK y, al verificar, el caller lo re-hashea a PBKDF2
// (migración transparente en el próximo login de cada usuario/perfil).
// Formato: pbkdf2$<iteraciones>$<sal hex>$<hash hex>

const PBKDF2_ITERATIONS = 100000;
const SALT_BYTES = 16;
const KEY_BITS = 256;

function toHex(bytes) {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function fromHex(hex) {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

async function deriveBits(password, saltBytes, iterations) {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(String(password)),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: saltBytes, iterations, hash: 'SHA-256' },
    keyMaterial,
    KEY_BITS,
  );
  return new Uint8Array(bits);
}

// Comparación de tiempo constante para secretos en formato texto/hex. La longitud
// no es secreta, así que cortar ahí no filtra nada.
export function safeEqual(a, b) {
  const sa = String(a);
  const sb = String(b);
  if (sa.length !== sb.length) return false;
  let diff = 0;
  for (let i = 0; i < sa.length; i++) diff |= sa.charCodeAt(i) ^ sb.charCodeAt(i);
  return diff === 0;
}

// Hash heredado (pre-R29): SHA-256 plano, sin sal. Solo vive para verificar
// filas viejas hasta que migran; los hash nuevos siempre son PBKDF2.
export async function hashPasswordLegacy(password) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(password)));
  return toHex(new Uint8Array(buf));
}

export async function hashPasswordPBKDF2(password) {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const key = await deriveBits(password, salt, PBKDF2_ITERATIONS);
  return `pbkdf2$${PBKDF2_ITERATIONS}$${toHex(salt)}$${toHex(key)}`;
}

// Devuelve { ok, legacy }: ok = ¿coincide?, legacy = ¿verificó contra el formato
// viejo? (el caller usa legacy para re-hashear la fila a PBKDF2 en el acto).
export async function verifyPassword(password, stored) {
  if (typeof stored !== 'string' || !stored) return { ok: false, legacy: false };
  if (stored.startsWith('pbkdf2$')) {
    const parts = stored.split('$');
    if (parts.length !== 4) return { ok: false, legacy: false };
    const iterations = parseInt(parts[1], 10);
    if (!Number.isInteger(iterations) || iterations < 1) return { ok: false, legacy: false };
    let key;
    try {
      key = await deriveBits(password, fromHex(parts[2]), iterations);
    } catch (_) {
      return { ok: false, legacy: false };
    }
    return { ok: safeEqual(toHex(key), parts[3]), legacy: false };
  }
  const legacy = await hashPasswordLegacy(password);
  return { ok: safeEqual(legacy, stored), legacy: true };
}
