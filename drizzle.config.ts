import { defineConfig } from "drizzle-kit";

// Generating SQL does not need credentials or a running database.
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/infrastructure/database/schema.ts",
  out: "./drizzle",
});
