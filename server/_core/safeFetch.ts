/**
 * Busca HTTP para URLs fornecidas pelo usuário.
 *
 * O risco aqui é SSRF: validar o host antes do fetch não basta, porque um host
 * público controlado pelo atacante pode responder 302 para um endereço interno
 * (metadata da cloud em 169.254.169.254, banco em 10.x, o próprio serviço em
 * 127.0.0.1). Com `redirect: "follow"` o runtime segue esse salto sem passar
 * pela validação de novo.
 *
 * Por isso aqui os redirects são resolvidos manualmente e CADA salto é
 * revalidado antes de ser seguido.
 */

const BLOCKED_HOSTNAMES = new Set(["localhost", "::1", "[::1]", "0.0.0.0", "metadata.google.internal"]);

/** Faixas privadas, loopback, link-local e reservadas em IPv4. */
function isPrivateIpv4(hostname: string): boolean {
  const parts = hostname.split(".");
  if (parts.length !== 4) return false;
  const octets = parts.map(part => Number(part));
  if (octets.some(value => !Number.isInteger(value) || value < 0 || value > 255)) return false;
  const [a, b] = octets;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true; // link-local, inclui metadata da cloud
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a >= 224) return true; // multicast e reservado
  return false;
}

/** Loopback, link-local e unique-local em IPv6, inclusive IPv4 mapeado. */
function isPrivateIpv6(hostname: string): boolean {
  const raw = hostname.replace(/^\[/, "").replace(/\]$/, "").toLowerCase();
  if (!raw.includes(":")) return false;
  if (raw === "::" || raw === "::1") return true;
  if (raw.startsWith("fe80:") || raw.startsWith("fc") || raw.startsWith("fd")) return true;

  // IPv4 mapeado aparece em duas formas: ::ffff:127.0.0.1 e, depois de o
  // parser de URL normalizar, ::ffff:7f00:1. Ambas precisam ser checadas.
  const dotted = raw.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (dotted) return isPrivateIpv4(dotted[1]);

  const hex = raw.match(/::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (hex) {
    const high = parseInt(hex[1], 16);
    const low = parseInt(hex[2], 16);
    const ipv4 = [(high >> 8) & 0xff, high & 0xff, (low >> 8) & 0xff, low & 0xff].join(".");
    return isPrivateIpv4(ipv4);
  }
  return false;
}

/** A URL é HTTPS pública e segura para o servidor buscar? */
export function isPublicHttpsUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  // Credenciais embutidas costumam ser usadas para confundir a validação.
  if (url.username || url.password) return false;

  const hostname = url.hostname.toLowerCase();
  if (!hostname || BLOCKED_HOSTNAMES.has(hostname)) return false;
  if (hostname.endsWith(".localhost") || hostname.endsWith(".internal") || hostname.endsWith(".local")) return false;
  if (isPrivateIpv4(hostname) || isPrivateIpv6(hostname)) return false;
  return true;
}

export class UnsafeUrlError extends Error {
  constructor(message = "Use apenas URLs HTTPS públicas.") {
    super(message);
    this.name = "UnsafeUrlError";
  }
}

export type SafeFetchOptions = {
  timeoutMs?: number;
  headers?: Record<string, string>;
  maxRedirects?: number;
};

/**
 * Faz GET seguindo redirects manualmente, revalidando cada destino.
 * Lança UnsafeUrlError se qualquer salto apontar para endereço não público.
 */
export async function safeFetch(target: string, options: SafeFetchOptions = {}): Promise<Response> {
  const { timeoutMs = 10_000, headers = {}, maxRedirects = 3 } = options;
  let current = target;

  for (let hop = 0; hop <= maxRedirects; hop++) {
    if (!isPublicHttpsUrl(current)) throw new UnsafeUrlError();

    const response = await fetch(current, {
      method: "GET",
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
      headers,
    });

    const isRedirect = response.status >= 300 && response.status < 400;
    if (!isRedirect) return response;

    const location = response.headers.get("location");
    if (!location) return response;
    // Resolve relativo contra a URL atual; o próximo laço revalida o destino.
    current = new URL(location, current).toString();
  }

  throw new UnsafeUrlError("A URL redirecionou vezes demais.");
}
