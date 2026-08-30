import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { registerGoogleOAuthRoutes } from "./googleOAuth";
import { serveStatic, setupVite } from "./vite";
import { countAdmins } from "../db";
import { ENV } from "./env";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

/**
 * Sem nenhum admin ninguém consegue conceder acesso editorial, e o produto
 * fica inutilizável sem dar sinal. OWNER_OPEN_ID promove automaticamente a
 * conta indicada no próximo login dela.
 */
async function warnIfNoAdmin() {
  try {
    const admins = await countAdmins();
    if (admins === null) {
      console.warn("[Acesso] Banco indisponível: não foi possível verificar se existe administrador.");
      return;
    }
    if (admins === 0) {
      console.warn(
        `[Acesso] Nenhuma conta com papel admin. A bancada editorial fica inacessível até existir uma. ` +
          `Defina OWNER_OPEN_ID (ex.: "email:voce@dominio.com") e faça login com essa conta para promovê-la. ` +
          `Valor atual de OWNER_OPEN_ID: ${ENV.ownerOpenId ? `"${ENV.ownerOpenId}"` : "não definido"}.`,
      );
    }
  } catch (error) {
    console.warn("[Acesso] Falha ao verificar administradores:", error);
  }
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  registerGoogleOAuthRoutes(app);
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
    void warnIfNoAdmin();
  });
}

startServer().catch(console.error);
