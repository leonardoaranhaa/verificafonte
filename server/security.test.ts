import { describe, expect, it } from "vitest";
import { isPublicHttpsUrl } from "./_core/safeFetch";
import { appRouter, assertPublishable, hasIndependentApproval } from "./routers";
import type { TrpcContext } from "./_core/context";

describe("guarda SSRF", () => {
  it("aceita apenas HTTPS público", () => {
    expect(isPublicHttpsUrl("https://www.gov.br/noticia")).toBe(true);
    expect(isPublicHttpsUrl("http://www.gov.br/noticia")).toBe(false);
    expect(isPublicHttpsUrl("ftp://www.gov.br")).toBe(false);
    expect(isPublicHttpsUrl("file:///etc/passwd")).toBe(false);
    expect(isPublicHttpsUrl("não é url")).toBe(false);
  });

  it("bloqueia loopback e nomes internos", () => {
    for (const url of [
      "https://localhost/x",
      "https://127.0.0.1/x",
      "https://127.1.2.3/x",
      "https://0.0.0.0/x",
      "https://app.localhost/x",
      "https://db.internal/x",
      "https://printer.local/x",
      "https://metadata.google.internal/x",
    ]) {
      expect(isPublicHttpsUrl(url), url).toBe(false);
    }
  });

  it("bloqueia toda a faixa 172.16.0.0/12 — o regex anterior tinha escape duplo e deixava passar", () => {
    expect(isPublicHttpsUrl("https://172.16.0.1/x")).toBe(false);
    expect(isPublicHttpsUrl("https://172.20.10.5/x")).toBe(false);
    expect(isPublicHttpsUrl("https://172.31.255.254/x")).toBe(false);
    // Fora da faixa privada, seguem sendo endereços públicos válidos.
    expect(isPublicHttpsUrl("https://172.15.0.1/x")).toBe(true);
    expect(isPublicHttpsUrl("https://172.32.0.1/x")).toBe(true);
  });

  it("bloqueia as demais faixas privadas e o metadata da cloud", () => {
    for (const url of [
      "https://10.0.0.1/x",
      "https://192.168.1.1/x",
      "https://169.254.169.254/latest/meta-data/", // metadata da cloud
      "https://100.64.0.1/x", // CGNAT
      "https://224.0.0.1/x", // multicast
    ]) {
      expect(isPublicHttpsUrl(url), url).toBe(false);
    }
  });

  it("bloqueia IPv6 interno, inclusive IPv4 mapeado", () => {
    expect(isPublicHttpsUrl("https://[::1]/x")).toBe(false);
    expect(isPublicHttpsUrl("https://[fe80::1]/x")).toBe(false);
    expect(isPublicHttpsUrl("https://[fd00::1]/x")).toBe(false);
    expect(isPublicHttpsUrl("https://[::ffff:127.0.0.1]/x")).toBe(false);
  });

  it("rejeita credenciais embutidas, usadas para confundir a validação", () => {
    expect(isPublicHttpsUrl("https://gov.br@169.254.169.254/x")).toBe(false);
    expect(isPublicHttpsUrl("https://user:pass@example.com/x")).toBe(false);
  });
});

describe("barreira editorial: revisão independente", () => {
  const caseByAlice = { createdBy: 1 };

  it("não aceita o autor aprovando o próprio caso", () => {
    expect(hasIndependentApproval(caseByAlice, [{ decision: "aprovar", reviewerId: 1 }])).toBe(false);
  });

  it("aceita aprovação de outra pessoa da redação", () => {
    expect(hasIndependentApproval(caseByAlice, [{ decision: "aprovar", reviewerId: 2 }])).toBe(true);
  });

  it("ignora revisões que não são aprovação", () => {
    expect(hasIndependentApproval(caseByAlice, [
      { decision: "solicitar_ajustes", reviewerId: 2 },
      { decision: "rejeitar", reviewerId: 3 },
    ])).toBe(false);
  });

  it("basta uma aprovação independente entre várias revisões", () => {
    expect(hasIndependentApproval(caseByAlice, [
      { decision: "aprovar", reviewerId: 1 },
      { decision: "aprovar", reviewerId: 2 },
    ])).toBe(true);
  });

  it("autoria desconhecida (linha legada) não trava a publicação", () => {
    expect(hasIndependentApproval({ createdBy: null }, [{ decision: "aprovar", reviewerId: 5 }])).toBe(true);
    expect(hasIndependentApproval({ createdBy: null }, [])).toBe(false);
  });

  it("explica ao editor quando só existe auto-aprovação", () => {
    const publicando = { workflowStatus: "publicado" as const, methodology: "Método", editorialNote: "Justificativa" };
    expect(() => assertPublishable(publicando, false, true)).toThrow(/outra pessoa da redação/);
    expect(() => assertPublishable(publicando, false, false)).toThrow(/revisão humana aprovada/);
    expect(() => assertPublishable(publicando, true)).not.toThrow();
  });
});

describe("guarda de URL na entrada, não só na busca", () => {
  /**
   * A guarda HTTPS protegia quem BUSCA uma URL (safeFetch, contra SSRF), mas
   * não quem ARMAZENA. Era possível gravar uma URL interna que depois apareceria
   * como link clicável para o leitor na página pública. Estes testes travam a
   * validação nas rotas que persistem URL.
   */
  function editorContext(): TrpcContext {
    return {
      user: { id: 1, openId: "editor", name: "Editor", email: null, loginMethod: "email", passwordHash: null, role: "editor", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() },
      req: { protocol: "https", headers: {} },
      res: {},
    } as unknown as TrpcContext;
  }

  const URLS_RECUSADAS = [
    "http://exemplo.com/materia",
    "https://169.254.169.254/latest/meta-data/",
    "https://localhost/admin",
    "https://10.0.0.1/interno",
    "https://172.16.0.1/interno",
  ];

  it("cases.create recusa claimUrl que não seja HTTPS pública", async () => {
    const caller = appRouter.createCaller(editorContext());
    for (const url of URLS_RECUSADAS) {
      await expect(
        caller.cases.create({ claimText: "Uma alegação suficientemente longa para passar", claimUrl: url }),
        url,
      ).rejects.toThrow(/HTTPS pública|url/i);
    }
  });

  it("evidences.add recusa URL de evidência que não seja HTTPS pública", async () => {
    const caller = appRouter.createCaller(editorContext());
    for (const url of URLS_RECUSADAS) {
      await expect(
        caller.evidences.add({ caseId: 1, title: "Fonte", url, sourceName: "Origem", sourceType: "oficial", context: "Contexto suficiente para o teste", relation: "apoia" }),
        url,
      ).rejects.toThrow(/HTTPS pública|url/i);
    }
  });

  it("moments.register recusa URL de momento que não seja HTTPS pública", async () => {
    const caller = appRouter.createCaller(editorContext());
    for (const url of URLS_RECUSADAS) {
      await expect(
        caller.moments.register({ caseId: 1, title: "Momento indexado", url, sourceName: "Canal" }),
        url,
      ).rejects.toThrow(/HTTPS pública|url/i);
    }
  });
});
