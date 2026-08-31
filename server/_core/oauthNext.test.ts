import { describe, expect, it } from "vitest";
import { safeNext } from "./googleOAuth";

describe("destino após o login com Google", () => {
  it("aceita caminho interno", () => {
    expect(safeNext("/painel")).toBe("/painel");
    expect(safeNext("/?novo=1")).toBe("/?novo=1");
    expect(safeNext("/caso/exemplo?x=1#trecho")).toBe("/caso/exemplo?x=1#trecho");
  });

  it("recusa destino externo", () => {
    // res.redirect com um destino absoluto faria do callback um
    // redirecionador aberto: phishing com o domínio do produto na barra.
    expect(safeNext("https://exemplo-malicioso.com")).toBeNull();
    expect(safeNext("http://exemplo-malicioso.com")).toBeNull();
    expect(safeNext("//exemplo-malicioso.com")).toBeNull();
    expect(safeNext("javascript:alert(1)")).toBeNull();
  });

  it("recusa valor ausente ou de outro tipo", () => {
    expect(safeNext(undefined)).toBeNull();
    expect(safeNext(null)).toBeNull();
    expect(safeNext(["/painel"])).toBeNull();
    expect(safeNext("painel")).toBeNull();
  });
});
