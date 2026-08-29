import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { randomBytes } from "crypto";
import { parse as parseCookieHeader } from "cookie";
import type { Express, Request, Response } from "express";
import * as db from "../db";
import { createSessionToken } from "./auth";
import { getSessionCookieOptions } from "./cookies";
import { ENV } from "./env";
import { googleOpenId } from "./password";

const STATE_COOKIE = "oauth_state";
const STATE_MAX_AGE_MS = 10 * 60 * 1000;

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";

type GoogleUserInfo = {
  sub?: string;
  email?: string;
  name?: string;
};

function getRedirectUri(req: Request): string {
  const base = ENV.appUrl || `${req.protocol}://${req.get("host")}`;
  return `${base.replace(/\/$/, "")}/api/oauth/google/callback`;
}

export function registerGoogleOAuthRoutes(app: Express) {
  app.get("/api/oauth/google/start", (req: Request, res: Response) => {
    if (!ENV.googleClientId) {
      res.status(500).send("Login com Google não está configurado neste ambiente.");
      return;
    }

    const state = randomBytes(16).toString("hex");
    const cookieOptions = getSessionCookieOptions(req);
    res.cookie(STATE_COOKIE, state, { ...cookieOptions, maxAge: STATE_MAX_AGE_MS });

    const url = new URL(GOOGLE_AUTH_URL);
    url.searchParams.set("client_id", ENV.googleClientId);
    url.searchParams.set("redirect_uri", getRedirectUri(req));
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", "openid email profile");
    url.searchParams.set("state", state);
    url.searchParams.set("access_type", "online");
    url.searchParams.set("prompt", "select_account");
    res.redirect(url.toString());
  });

  app.get("/api/oauth/google/callback", async (req: Request, res: Response) => {
    const code = typeof req.query.code === "string" ? req.query.code : undefined;
    const state = typeof req.query.state === "string" ? req.query.state : undefined;
    const cookies = parseCookieHeader(req.headers.cookie ?? "");
    const expectedState = cookies[STATE_COOKIE];
    res.clearCookie(STATE_COOKIE, { ...getSessionCookieOptions(req), maxAge: -1 });

    if (!code || !state || !expectedState || state !== expectedState) {
      res.status(403).send("Não foi possível validar o login com Google (state inválido ou expirado). Tente novamente.");
      return;
    }

    if (!ENV.googleClientId || !ENV.googleClientSecret) {
      res.status(500).send("Login com Google não está configurado neste ambiente.");
      return;
    }

    try {
      const tokenResponse = await fetch(GOOGLE_TOKEN_URL, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: ENV.googleClientId,
          client_secret: ENV.googleClientSecret,
          redirect_uri: getRedirectUri(req),
          grant_type: "authorization_code",
        }),
      });
      if (!tokenResponse.ok) throw new Error(`token exchange failed with HTTP ${tokenResponse.status}`);
      const tokenData = (await tokenResponse.json()) as { access_token?: string };
      if (!tokenData.access_token) throw new Error("missing access_token in Google response");

      const userInfoResponse = await fetch(GOOGLE_USERINFO_URL, {
        headers: { authorization: `Bearer ${tokenData.access_token}` },
      });
      if (!userInfoResponse.ok) throw new Error(`userinfo request failed with HTTP ${userInfoResponse.status}`);
      const userInfo = (await userInfoResponse.json()) as GoogleUserInfo;
      if (!userInfo.sub) throw new Error("missing sub in Google userinfo response");

      const openId = googleOpenId(userInfo.sub);
      await db.upsertUser({
        openId,
        email: userInfo.email ?? null,
        name: userInfo.name ?? null,
        loginMethod: "google",
        lastSignedIn: new Date(),
      });
      const user = await db.getUserByOpenId(openId);
      if (!user) throw new Error("failed to persist Google user");

      const sessionToken = await createSessionToken({ openId: user.openId, name: user.name ?? "" });
      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });
      res.redirect(302, "/painel");
    } catch (error) {
      console.error("[GoogleOAuth] callback failed", error);
      res.status(500).send("Não foi possível concluir o login com Google. Tente novamente.");
    }
  });
}
