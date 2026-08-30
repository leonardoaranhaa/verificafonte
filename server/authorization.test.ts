import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

/**
 * O cadastro é aberto. Antes desta camada, qualquer conta recém-criada lia,
 * editava e publicava casos alheios — inclusive aprovando a própria revisão.
 * Estes testes travam a regra: estar autenticado não é acesso editorial.
 */
function contextFor(role: "user" | "editor" | "admin" | null): TrpcContext {
  const user =
    role === null
      ? null
      : { id: 1, openId: "conta", name: "Conta", email: null, loginMethod: "email", passwordHash: null, role, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() };
  return { user, req: { protocol: "https", headers: {} }, res: {} } as unknown as TrpcContext;
}

/** Amostra representativa: leitura, escrita, publicação e ações caras. */
const EDITORIAL_CALLS: Array<[string, (caller: ReturnType<typeof appRouter.createCaller>) => Promise<unknown>]> = [
  ["cases.all", c => c.cases.all()],
  ["cases.workspace", c => c.cases.workspace({ caseId: 1 })],
  ["cases.create", c => c.cases.create({ claimText: "Uma alegação suficientemente longa para passar" })],
  ["cases.updateWorkflow", c => c.cases.updateWorkflow({ caseId: 1, workflowStatus: "publicado" })],
  ["evidences.add", c => c.evidences.add({ caseId: 1, title: "Fonte", url: "https://exemplo.com", sourceName: "Origem", sourceType: "oficial", context: "Contexto suficiente aqui", relation: "apoia" })],
  ["reviews.submit", c => c.reviews.submit({ caseId: 1, decision: "aprovar", note: "Nota da revisão suficiente" })],
  ["moments.register", c => c.moments.register({ caseId: 1, title: "Momento", url: "https://exemplo.com", sourceName: "Canal" })],
  ["intake.extractFromUrl", c => c.intake.extractFromUrl({ url: "https://exemplo.com" })],
  ["research.prepareCasePipeline", c => c.research.prepareCasePipeline({ caseId: 1 })],
  ["analysis.generate", c => c.analysis.generate({ caseId: 1 })],
  ["system.integrations", c => c.system.integrations()],
];

describe("acesso à bancada editorial", () => {
  it("nega a quem não está autenticado", async () => {
    const caller = appRouter.createCaller(contextFor(null));
    for (const [name, call] of EDITORIAL_CALLS) {
      await expect(call(caller), name).rejects.toThrow(/10001/);
    }
  });

  it("nega a conta autenticada sem papel editorial — o cadastro é aberto", async () => {
    const caller = appRouter.createCaller(contextFor("user"));
    for (const [name, call] of EDITORIAL_CALLS) {
      await expect(call(caller), name).rejects.toThrow(/10003/);
    }
  });

  it("não deixa uma conta comum alcançar a gestão de papéis", async () => {
    for (const role of ["user", "editor"] as const) {
      const caller = appRouter.createCaller(contextFor(role));
      await expect(caller.admin.users()).rejects.toThrow(/10002/);
      await expect(caller.admin.setRole({ userId: 2, role: "admin" })).rejects.toThrow(/10002/);
    }
  });

  it("mantém o acervo público aberto a qualquer visitante", async () => {
    const caller = appRouter.createCaller(contextFor(null));
    await expect(caller.cases.published()).resolves.toBeDefined();
    await expect(caller.cases.stats()).resolves.toBeDefined();
    await expect(caller.cases.publicBySlug({ slug: "inexistente" })).resolves.toBeDefined();
    await expect(caller.system.health()).resolves.toEqual({ ok: true });
  });

  it("admin não pode se auto-rebaixar e deixar a instalação sem administrador", async () => {
    const caller = appRouter.createCaller(contextFor("admin"));
    await expect(caller.admin.setRole({ userId: 1, role: "user" })).rejects.toThrow(/rebaixar a própria conta/);
  });
});
