import { TRPCError } from "@trpc/server";

/**
 * Limite de chamadas por janela deslizante, em memória.
 *
 * Serve para conter abuso de custo: `intake.extractFromUrl`/`extractFromImage`,
 * os briefings e o laudo chamam a API da Anthropic a cada requisição, e o
 * cadastro é aberto. Sem limite, uma conta qualquer queima o orçamento.
 *
 * É deliberadamente in-process: o app roda como instância única no Railway.
 * Com mais de uma réplica o limite passa a valer por réplica — quando isso
 * acontecer, trocar o mapa por Redis mantendo esta mesma interface.
 */
type Bucket = { hits: number[] };

const buckets = new Map<string, Bucket>();

/** Evita o mapa crescer sem limite com chaves que ninguém mais usa. */
function pruneExpired(now: number, windowMs: number) {
  for (const key of Array.from(buckets.keys())) {
    const bucket = buckets.get(key);
    if (!bucket) continue;
    bucket.hits = bucket.hits.filter((at: number) => now - at < windowMs);
    if (bucket.hits.length === 0) buckets.delete(key);
  }
}

let lastPrune = 0;

export type RateLimitOptions = {
  /** Identificador da ação, para que limites diferentes não se misturem. */
  action: string;
  limit: number;
  windowMs: number;
};

export function checkRateLimit(identity: string | number, options: RateLimitOptions) {
  const now = Date.now();
  const { action, limit, windowMs } = options;

  if (now - lastPrune > 60_000) {
    pruneExpired(now, windowMs);
    lastPrune = now;
  }

  const key = `${action}:${identity}`;
  const bucket = buckets.get(key) ?? { hits: [] };
  bucket.hits = bucket.hits.filter(at => now - at < windowMs);

  if (bucket.hits.length >= limit) {
    const oldest = bucket.hits[0];
    const retryAfterSec = Math.max(1, Math.ceil((windowMs - (now - oldest)) / 1000));
    buckets.set(key, bucket);
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message: `Muitas chamadas seguidas nesta ação. Tente de novo em ${retryAfterSec}s.`,
    });
  }

  bucket.hits.push(now);
  buckets.set(key, bucket);
}

/** Somente para testes: zera o estado entre casos. */
export function resetRateLimits() {
  buckets.clear();
  lastPrune = 0;
}

/** Ações que gastam dinheiro (LLM) ou saem para a rede a cada chamada. */
export const RATE_LIMITS = {
  /** Extração por link/print: cada chamada é uma requisição à Anthropic. */
  intake: { action: "intake", limit: 20, windowMs: 60 * 60 * 1000 },
  /** Briefing e laudo: prompts longos, custo maior por chamada. */
  analysis: { action: "analysis", limit: 15, windowMs: 60 * 60 * 1000 },
  /** Busca externa (RSS, Fact Check, BCB): sem custo de LLM, mas sai para a rede. */
  research: { action: "research", limit: 60, windowMs: 60 * 60 * 1000 },
  /** Tentativas de login por e-mail, para conter força bruta. */
  login: { action: "login", limit: 10, windowMs: 15 * 60 * 1000 },
  /** Criação de contas por IP. */
  register: { action: "register", limit: 5, windowMs: 60 * 60 * 1000 },
} as const;
