import { describe, expect, it } from "vitest";
import { createSessionToken, verifySessionToken } from "./auth";

describe("session tokens", () => {
  it("round-trips a valid session", async () => {
    const token = await createSessionToken({ openId: "email:user@example.com", name: "User" });
    const session = await verifySessionToken(token);
    expect(session).toEqual({ openId: "email:user@example.com", name: "User" });
  });

  it("rejects a malformed token", async () => {
    expect(await verifySessionToken("not-a-jwt")).toBeNull();
  });

  it("rejects a missing token", async () => {
    expect(await verifySessionToken(undefined)).toBeNull();
    expect(await verifySessionToken(null)).toBeNull();
  });

  it("rejects an expired session", async () => {
    const token = await createSessionToken({ openId: "email:user@example.com", name: "User" }, -1000);
    expect(await verifySessionToken(token)).toBeNull();
  });
});
