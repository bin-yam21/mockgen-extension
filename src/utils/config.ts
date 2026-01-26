// src/utils/config.ts
import { existsSync, readFileSync, writeFileSync } from "fs";
import path from "path";

export type MockGenConfig = {
  baseURL?: string;
  responseTemplates?: Record<string, any>; // URL-based overrides
};

const DEFAULT_CONFIG: MockGenConfig = {
  baseURL: "",
  responseTemplates: {},
};

export function loadConfig(rootPath: string): MockGenConfig {
  const configPath = path.join(rootPath, ".mockgen", "config.json");

  if (!existsSync(configPath)) {
    writeFileSync(configPath, JSON.stringify(DEFAULT_CONFIG, null, 2));
    return DEFAULT_CONFIG;
  }

  return JSON.parse(readFileSync(configPath, "utf-8"));
}
