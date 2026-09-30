import { describe, expect, it } from "vitest";
import {
  DatabaseConfigError,
  readDatabaseUrl,
} from "../../../src/infrastructure/database/client.js";

describe("database configuration", () => {
  it("requires explicit configuration instead of silently connecting locally", () => {
    expect(() => readDatabaseUrl({})).toThrow(DatabaseConfigError);
    expect(() => readDatabaseUrl({ DATABASE_URL: "  " })).toThrow("Add DATABASE_URL");
  });

  it.each(["postgres", "postgresql"])("accepts %s connection strings", (protocol) => {
    const url = `${protocol}://agent:example@localhost:5432/job_agent`;
    expect(readDatabaseUrl({ DATABASE_URL: ` ${url} ` })).toBe(url);
  });

  it.each([
    "https://user:private-password@example.com/database",
    "postgresql://user:private-password@localhost",
    "private-password",
  ])("rejects invalid configuration without exposing its value", (value) => {
    let caught: unknown;
    try {
      readDatabaseUrl({ DATABASE_URL: value });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(DatabaseConfigError);
    expect(String(caught)).not.toContain("private-password");
    expect(String(caught)).not.toContain(value);
  });
});
