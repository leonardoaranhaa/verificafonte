import { ONE_YEAR_MS } from "@shared/const";
import { SignJWT, jwtVerify } from "jose";
import { ENV } from "./env";

export type SessionPayload = {
  openId: string;
  name: string;
};

function getSecretKey() {
  if (!ENV.cookieSecret) {
    throw new Error("JWT_SECRET is not configured");
  }
  return new TextEncoder().encode(ENV.cookieSecret);
}

export async function createSessionToken(payload: SessionPayload, expiresInMs: number = ONE_YEAR_MS): Promise<string> {
  const expirationSeconds = Math.floor((Date.now() + expiresInMs) / 1000);
  return new SignJWT({ openId: payload.openId, name: payload.name })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setExpirationTime(expirationSeconds)
    .sign(getSecretKey());
}

export async function verifySessionToken(token: string | undefined | null): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecretKey(), { algorithms: ["HS256"] });
    const { openId, name } = payload as Record<string, unknown>;
    if (typeof openId !== "string" || openId.length === 0) return null;
    return { openId, name: typeof name === "string" ? name : "" };
  } catch {
    return null;
  }
}
