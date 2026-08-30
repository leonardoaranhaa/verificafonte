export const ENV = {
  appId: process.env.VITE_APP_ID ?? process.env.APP_ID ?? "verificafonte",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? "",
  anthropicModel: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-5-20250929",
  appUrl: process.env.APP_URL ?? "",
  googleClientId: process.env.GOOGLE_CLIENT_ID ?? "",
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
  googleFactCheckApiKey: (process.env.GOOGLE_FACTCHECK_API_KEY ?? process.env.GOOGLE_API_KEY ?? "").trim(),
};
