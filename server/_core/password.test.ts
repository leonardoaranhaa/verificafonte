import { describe, expect, it } from "vitest";
import { emailOpenId, googleOpenId, hashPassword, normalizeEmail, verifyPassword } from "./password";

describe("password", () => {
  it("hashes and verifies a correct password", async () => {
    const hash = await hashPassword("correct horse battery staple");
    expect(hash.startsWith("scrypt$")).toBe(true);
    expect(await verifyPassword("correct horse battery staple", hash)).toBe(true);
  });

  it("rejects an incorrect password", async () => {
    const hash = await hashPassword("correct horse battery staple");
    expect(await verifyPassword("wrong password", hash)).toBe(false);
  });

  it("rejects malformed stored hashes instead of throwing", async () => {
    expect(await verifyPassword("anything", "not-a-valid-hash")).toBe(false);
  });
});

describe("normalizeEmail", () => {
  it("trims and lowercases", () => {
    expect(normalizeEmail("  User@Example.com  ")).toBe("user@example.com");
  });
});

describe("openId helpers", () => {
  it("builds a namespaced email openId", () => {
    expect(emailOpenId("User@Example.com")).toBe("email:user@example.com");
  });

  it("builds a namespaced google openId", () => {
    expect(googleOpenId("12345")).toBe("google:12345");
  });
});
