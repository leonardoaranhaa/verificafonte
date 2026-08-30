import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A prontidão é lida de process.env no carregamento do módulo, então cada caso
 * reimporta os módulos com um ambiente próprio.
 */
async function readIntegrations(env: Record<string, string | undefined>) {
  vi.resetModules();
  const previous = { ...process.env };
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    const { appRouter } = await import("./routers");
    const ctx = {
      user: { id: 1, openId: "editor", name: "Editor", email: null, loginMethod: "email", passwordHash: null, role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() },
      req: { protocol: "https", headers: {} },
      res: {},
    } as unknown as Parameters<typeof appRouter.createCaller>[0];
    return await appRouter.createCaller(ctx).system.integrations();
  } finally {
    process.env = previous;
  }
}

const CLEAR = { ANTHROPIC_API_KEY: undefined, GOOGLE_FACTCHECK_API_KEY: undefined, GOOGLE_API_KEY: undefined };

describe("prontidão das integrações", () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.resetModules());

  it("reporta cada integração como não pronta quando falta a chave", async () => {
    const rows = await readIntegrations(CLEAR);
    expect(rows.find(row => row.key === "anthropic")?.ready).toBe(false);
    expect(rows.find(row => row.key === "googleFactCheck")?.ready).toBe(false);
  });

  it("reporta como pronta quando a chave está presente", async () => {
    const rows = await readIntegrations({ ...CLEAR, ANTHROPIC_API_KEY: "sk-ant-exemplo", GOOGLE_FACTCHECK_API_KEY: "chave-exemplo" });
    expect(rows.find(row => row.key === "anthropic")?.ready).toBe(true);
    expect(rows.find(row => row.key === "googleFactCheck")?.ready).toBe(true);
  });

  it("o Banco Central está sempre pronto — API pública, sem credencial", async () => {
    const rows = await readIntegrations(CLEAR);
    const bcb = rows.find(row => row.key === "bcb");
    expect(bcb?.ready).toBe(true);
    expect(bcb?.requires).toBeNull();
  });

  it("nomeia a variável exata que falta, para não repetir erro de digitação", async () => {
    const rows = await readIntegrations(CLEAR);
    // Um typo como ANTROPIC_API_KEY só é detectável se o painel disser o nome certo.
    expect(rows.find(row => row.key === "anthropic")?.requires).toBe("ANTHROPIC_API_KEY");
    expect(rows.find(row => row.key === "googleFactCheck")?.requires).toBe("GOOGLE_FACTCHECK_API_KEY");
  });

  it("ignora espaços em volta da chave colada do painel", async () => {
    const rows = await readIntegrations({ ...CLEAR, ANTHROPIC_API_KEY: "  sk-ant-exemplo\n", GOOGLE_FACTCHECK_API_KEY: " chave-exemplo " });
    expect(rows.find(row => row.key === "anthropic")?.ready).toBe(true);
    expect(rows.find(row => row.key === "googleFactCheck")?.ready).toBe(true);
  });

  it("não considera pronta uma variável definida mas vazia", async () => {
    const rows = await readIntegrations({ ...CLEAR, ANTHROPIC_API_KEY: "   ", GOOGLE_FACTCHECK_API_KEY: "" });
    expect(rows.find(row => row.key === "anthropic")?.ready).toBe(false);
    expect(rows.find(row => row.key === "googleFactCheck")?.ready).toBe(false);
  });
});
