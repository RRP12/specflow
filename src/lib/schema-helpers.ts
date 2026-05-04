import * as z from "zod";

export function buildSchemaFromConfig(schemaConfig: any) {
  if (!schemaConfig || !Array.isArray(schemaConfig) || schemaConfig.length === 0) return null;
  const fields: Record<string, any> = {};
  for (const field of schemaConfig) {
    const { name: fieldName, type, description: fieldDesc } = field;
    if (type === "string") fields[fieldName] = z.string().describe(fieldDesc || "");
    else if (type === "number") fields[fieldName] = z.number().describe(fieldDesc || "");
    else if (type === "boolean") fields[fieldName] = z.boolean().describe(fieldDesc || "");
    else if (type === "array") fields[fieldName] = z.array(z.string()).describe(fieldDesc || "");
  }
  return z.object(fields);
}

export function parseZodCode(code: string): any {
  if (!code || typeof code !== "string") return null;
  try {
    const lines = code.split("\n").filter(l => !l.trim().startsWith("//") && l.trim());
    const joinLines = lines.join(" ").replace(/\s+/g, " ");
    const nameMatches = joinLines.match(/z\.object\(\{([^}]+)\}/);
    if (!nameMatches) return null;
    const fields: Record<string, any> = {};
    const propsMatch = nameMatches[1];
    const fieldParts = propsMatch.split(",").map(p => p.trim());
    for (const part of fieldParts) {
      const nameMatch = part.match(/(\w+):\s*z\.(\w+)/);
      if (nameMatch) {
        const [, fieldName, zodType] = nameMatch;
        if (zodType === "string") fields[fieldName] = z.string();
        else if (zodType === "number") fields[fieldName] = z.number();
        else if (zodType === "boolean") fields[fieldName] = z.boolean();
        else if (zodType === "array") fields[fieldName] = z.array(z.string());
        else fields[fieldName] = z.string();
      }
    }
    return z.object(fields);
  } catch {
    return null;
  }
}

export function getStructuredSchema(config: any): any {
  if (!config?.enabled) return null;
  if (config.codeMode && config.zodCode) {
    return parseZodCode(config.zodCode);
  }
  return buildSchemaFromConfig(config.schema);
}