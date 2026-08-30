import { beforeEach, describe, expect, it } from "vitest";
import { checkRateLimit, RATE_LIMITS, resetRateLimits } from "./_core/rateLimit";

describe("limite de chamadas", () => {
  beforeEach(() => resetRateLimits());

  const opcoes = { action: "teste", limit: 3, windowMs: 60_000 };

  it("permite até o limite e barra a chamada seguinte", () => {
    for (let i = 0; i < 3; i++) expect(() => checkRateLimit("alice", opcoes)).not.toThrow();
    expect(() => checkRateLimit("alice", opcoes)).toThrow(/Muitas chamadas seguidas/);
  });

  it("conta por identidade — o abuso de uma conta não afeta as outras", () => {
    for (let i = 0; i < 3; i++) checkRateLimit("alice", opcoes);
    expect(() => checkRateLimit("bob", opcoes)).not.toThrow();
  });

  it("conta por ação — estourar a extração não bloqueia a pesquisa", () => {
    for (let i = 0; i < 3; i++) checkRateLimit("alice", { ...opcoes, action: "intake" });
    expect(() => checkRateLimit("alice", { ...opcoes, action: "research" })).not.toThrow();
  });

  it("libera de novo quando a janela passa", () => {
    const curta = { action: "curta", limit: 1, windowMs: 40 };
    checkRateLimit("alice", curta);
    expect(() => checkRateLimit("alice", curta)).toThrow();
    return new Promise<void>(resolve =>
      setTimeout(() => {
        expect(() => checkRateLimit("alice", curta)).not.toThrow();
        resolve();
      }, 60),
    );
  });

  it("diz em quantos segundos tentar de novo", () => {
    checkRateLimit("alice", { action: "espera", limit: 1, windowMs: 60_000 });
    expect(() => checkRateLimit("alice", { action: "espera", limit: 1, windowMs: 60_000 })).toThrow(/em \d+s/);
  });

  it("protege as ações que gastam dinheiro ou permitem força bruta", () => {
    // Se algum destes sumir, uma superfície de abuso ficou sem limite.
    expect(Object.keys(RATE_LIMITS).sort()).toEqual(["analysis", "intake", "login", "register", "research"]);
    expect(RATE_LIMITS.login.limit).toBeLessThanOrEqual(10);
    expect(RATE_LIMITS.register.limit).toBeLessThanOrEqual(5);
  });
});
