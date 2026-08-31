import { afterEach, describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import { ENV } from "./_core/env";
import type { Context } from "./_core/trpc";

const anonymous = { user: null, req: {} as never, res: {} as never } as unknown as Context;

const originalId = ENV.googleClientId;
const originalSecret = ENV.googleClientSecret;
afterEach(() => {
  ENV.googleClientId = originalId;
  ENV.googleClientSecret = originalSecret;
});

describe("métodos de login anunciados", () => {
  it("é público: a tela de login precisa saber antes de haver sessão", async () => {
    ENV.googleClientId = "";
    ENV.googleClientSecret = "";
    await expect(appRouter.createCaller(anonymous).system.authMethods()).resolves.toEqual({ google: false });
  });

  it("anuncia o Google só quando as duas credenciais existem", async () => {
    const caller = appRouter.createCaller(anonymous);

    ENV.googleClientId = "id-de-teste";
    ENV.googleClientSecret = "";
    expect(await caller.system.authMethods()).toEqual({ google: false });

    ENV.googleClientId = "";
    ENV.googleClientSecret = "segredo-de-teste";
    expect(await caller.system.authMethods()).toEqual({ google: false });

    ENV.googleClientId = "id-de-teste";
    ENV.googleClientSecret = "segredo-de-teste";
    expect(await caller.system.authMethods()).toEqual({ google: true });
  });
});
