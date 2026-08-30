import mysql from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";
import { migrate } from "drizzle-orm/mysql2/migrator";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is required to run migrations");
}

const connection = await mysql.createConnection(connectionString);
const db = drizzle(connection);

try {
  await migrate(db, { migrationsFolder: "./drizzle" });
  console.log("Migrations applied successfully.");
} catch (error) {
  console.error("Migration failed:", error?.message ?? error);
  if (error?.cause) {
    console.error("Cause:", error.cause);
  }
  process.exitCode = 1;
} finally {
  await connection.end();
}
