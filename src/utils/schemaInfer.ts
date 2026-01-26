export function inferSchema(
  value: any,
  name: string,
  schemas: Record<string, any>
): any {
  if (Array.isArray(value)) {
    return {
      type: "array",
      items: inferSchema(value[0] ?? {}, name, schemas),
    };
  }

  if (typeof value === "object" && value !== null) {
    if (!schemas[name]) {
      const properties: any = {};
      const required: string[] = [];

      for (const key of Object.keys(value)) {
        properties[key] = inferSchema(value[key], capitalize(key), schemas);
        required.push(key);
      }

      schemas[name] = {
        type: "object",
        properties,
        required,
      };
    }

    return { $ref: `#/components/schemas/${name}` };
  }

  return { type: typeof value };
}

function capitalize(str: string) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
