import * as fs from "fs";
import * as path from "path";
import type { Endpoint } from "../types/endpoint";
import { generateMock } from "./mockGenerator";
import { inferSchema } from "./schemaInfer";

/**
 * Generates a Swagger/OpenAPI JSON file from scanned endpoints
 */
export function generateSwagger(endpoints: Endpoint[], rootPath: string): string {
  const swagger: any = {
    openapi: "3.0.3",
    info: {
      title: "MockGen API",
      description: "Auto-generated API documentation from MockGen",
      version: "1.0.0",
    },
    servers: [
      { url: "http://localhost:3000", description: "Local Mock Server" },
    ],
    paths: {},
    components: {
      schemas: {},
    },
  };

  // Default error responses
  const defaultErrors: any = {
    400: { description: "Bad Request" },
    401: { description: "Unauthorized" },
    404: { description: "Not Found" },
    500: { description: "Internal Server Error" },
  };

  endpoints.forEach((ep) => {
    const { swaggerPath, params } = normalizePath(ep.url);

    if (!swagger.paths[swaggerPath]) {
      swagger.paths[swaggerPath] = {};
    }

    const mock = generateMock(ep, rootPath);

    // Schema name
    const schemaName = ep.url
      .split("/")
      .filter(Boolean)
      .pop()!
      .replace(/\d+/g, "Id");

    // Determine if the method needs a request body
    const method = ep.method.toLowerCase();
    const needsBody = ["post", "put", "patch"].includes(method);

    const requestBodySchema = needsBody
      ? {
          content: {
            "application/json": {
              schema: inferSchema(
                mock.body ?? {},
                capitalize(schemaName) + "Request",
                swagger.components.schemas
              ),
              example: mock.body ?? {},
            },
          },
          required: true,
        }
      : undefined;

    // Merge success + default error responses
    const responses: any = {
      [mock.status || 200]: {
        description: `Mocked response for ${ep.method} ${swaggerPath}`,
        content: {
          "application/json": {
            schema: inferSchema(
              mock.body ?? {},
              capitalize(schemaName),
              swagger.components.schemas
            ),
            example: mock.body ?? {},
          },
        },
      },
      ...defaultErrors,
    };

    swagger.paths[swaggerPath][method] = {
      summary: `${ep.method} ${swaggerPath}`,
      parameters: params.length ? params : undefined,
      requestBody: requestBodySchema,
      responses,
    };
  });

  // Ensure .mockgen folder exists
  const outDir = path.join(rootPath, ".mockgen");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);

  const outFile = path.join(outDir, "swagger.json");
  fs.writeFileSync(outFile, JSON.stringify(swagger, null, 2), "utf-8");

  return outFile;
}

/* =====================================
   Helpers
===================================== */

function capitalize(str: string) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function normalizePath(url: string) {
  const parts = url.split("/").filter(Boolean);
  const params: any[] = [];

  const newParts = parts.map((part) => {
    if (/^\d+$/.test(part)) {
      params.push({
        name: "id",
        in: "path",
        required: true,
        schema: { type: "integer" },
      });
      return "{id}";
    }
    return part;
  });

  return {
    swaggerPath: "/" + newParts.join("/"),
    params,
  };
}
