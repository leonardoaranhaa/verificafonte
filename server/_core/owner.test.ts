import { afterEach, describe, expect, it } from "vitest";
import { ENV } from "./env";
import { isOwnerAccount } from "./owner";

const original = ENV.ownerOpenId;
afterEach(() => {
  ENV.ownerOpenId = original;
});

describe("reconhecimento do dono da instalação", () => {
  it("não reconhece ninguém quando OWNER_OPEN_ID não está definido", () => {
    ENV.ownerOpenId = "";
    expect(isOwnerAccount({ openId: "email:dono@redacao.com", email: "dono@redacao.com", emailVerified: true })).toBe(false);
  });

  it("reconhece pelo openId exato (login por senha)", () => {
    ENV.ownerOpenId = "email:dono@redacao.com";
    expect(isOwnerAccount({ openId: "email:dono@redacao.com" })).toBe(true);
  });

  it("reconhece o mesmo dono entrando pelo Google, com e-mail verificado", () => {
    // O openId do Google nunca casaria com "email:...", e sem isto o dono
    // entrava, virava conta comum e não tinha como se promover.
    ENV.ownerOpenId = "email:dono@redacao.com";
    expect(isOwnerAccount({ openId: "google:1234567890", email: "Dono@Redacao.com", emailVerified: true })).toBe(true);
  });

  it("recusa e-mail não verificado", () => {
    ENV.ownerOpenId = "email:dono@redacao.com";
    expect(isOwnerAccount({ openId: "google:1234567890", email: "dono@redacao.com", emailVerified: false })).toBe(false);
    expect(isOwnerAccount({ openId: "google:1234567890", email: "dono@redacao.com" })).toBe(false);
  });

  it("recusa outro e-mail verificado", () => {
    ENV.ownerOpenId = "email:dono@redacao.com";
    expect(isOwnerAccount({ openId: "google:999", email: "outra@redacao.com", emailVerified: true })).toBe(false);
  });

  it("não faz correspondência por e-mail quando OWNER_OPEN_ID não é um e-mail", () => {
    ENV.ownerOpenId = "google:1234567890";
    expect(isOwnerAccount({ openId: "email:dono@redacao.com", email: "dono@redacao.com", emailVerified: true })).toBe(false);
    expect(isOwnerAccount({ openId: "google:1234567890" })).toBe(true);
  });
});
