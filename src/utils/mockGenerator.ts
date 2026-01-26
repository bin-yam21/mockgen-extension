import type { Endpoint } from "../types/endpoint";
import { loadConfig } from "./config";

/* =========================
   MAIN FUNCTION
========================= */
export function generateMock(endpoint: Endpoint, rootPath?: string) {
  const { method, url } = endpoint;
 

  /* =========================
     CONFIG OVERRIDES
  ========================== */
  const config = rootPath ? loadConfig(rootPath) : { responseTemplates: {} };
  const template = config.responseTemplates?.[url];
if (template) {
  return {
    status: template.status ?? 200,
    headers: template.headers ?? { "content-type": "application/json" },
    body: template.body ?? template,
  };
}

  /* =========================
     STATUS CODE
  ========================== */
  let status = 200;
  if (method === "POST") status = 201;
  if (method === "DELETE") status = 204;

  /* =========================
     BODY GENERATION
  ========================== */
  const resourceName = inferResourceName(url);

  let body: any = {};

  if (method === "GET" && isCollection(url)) {
    body = [mockResource(resourceName, 1), mockResource(resourceName, 2)];
  } else if (method === "GET") {
    body = mockResource(resourceName, extractId(url));
  } else if (method === "POST") {
    body = { ...mockResource(resourceName, randomId()), created: true };
  } else if (method === "PUT" || method === "PATCH") {
    body = { ...mockResource(resourceName, extractId(url)), updated: true };
  } else if (method === "DELETE") {
    if (method === "DELETE") {
  return { status: 204 };
}

  }

  return {
    status,
    headers: { "content-type": "application/json" },
    body,
  };
}

/* =========================
   HELPERS
========================= */

/** Detect if URL points to a collection or single resource using pluralization */
function isCollection(url: string) {
  return !extractId(url);
}


/** Infer resource name from URL (singular form) */
function inferResourceName(url: string) {
  const clean = url.split("?")[0];
  const parts = clean.split("/").filter(Boolean);
  const last = parts[parts.length - 1] || "resource";
  // If collection (plural), convert to singular
  return last.endsWith("s") ? last.slice(0, -1) : last;
}

function extractId(url: string): number {
  const match = url.match(/\/(\d+)$/);
  return match ? Number(match[1]) : 1;
}

function randomId() {
  return Math.floor(Math.random() * 1000) + 1;
}

/** Generate realistic mock based on resource name */
function mockResource(resource: string, id: number) {
  switch (resource) {
    case "user":
      return { id, name: "John Doe", email: "john@example.com" };
    case "product":
      return { id, title: "Sample Product", price: 49.99 };
    case "book":
      return { id, title: "Mock Book", author: "Unknown" };
    case "login":
      return { token: "mock-jwt-token", user: { id, name: "John Doe" } };
    default:
      return { id, name: capitalize(resource) + " " + id };
  }
}

/** Simple capitalize helper */
function capitalize(str: string) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/** Simple pluralization check (ends with "s") */
function pluralize(str: string) {
  // Very basic; assumes English-style plural by adding "s"
  return str.endsWith("s") ? str : str + "s";
}
