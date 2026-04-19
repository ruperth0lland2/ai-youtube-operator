export function extractFirstJsonObject(text: string): string {
  const start = text.indexOf("{");
  if (start < 0) {
    throw new Error("No JSON object found in LLM response");
  }
  let depth = 0;
  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === "{") {
      depth += 1;
    } else if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        return text.slice(start, i + 1);
      }
    }
  }
  throw new Error("Malformed JSON object in LLM response");
}

export function extractFirstJsonArray(text: string): string {
  const start = text.indexOf("[");
  if (start < 0) {
    throw new Error("No JSON array found in LLM response");
  }
  let depth = 0;
  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === "[") {
      depth += 1;
    } else if (ch === "]") {
      depth -= 1;
      if (depth === 0) {
        return text.slice(start, i + 1);
      }
    }
  }
  throw new Error("Malformed JSON array in LLM response");
}

export function parseJsonOrThrow<T>(text: string, operation: string): T {
  try {
    return JSON.parse(extractFirstJsonObject(text)) as T;
  } catch (error) {
    throw new Error(`${operation}: invalid JSON object payload (${String(error)})`);
  }
}

export function extractJsonBlock<T>(text: string, operation: string): T {
  const objectStart = text.indexOf("{");
  const arrayStart = text.indexOf("[");
  if (objectStart >= 0 && (arrayStart < 0 || objectStart < arrayStart)) {
    try {
      return JSON.parse(extractFirstJsonObject(text)) as T;
    } catch (error) {
      throw new Error(`${operation}: invalid JSON object payload (${String(error)})`);
    }
  }
  if (arrayStart >= 0) {
    try {
      return JSON.parse(extractFirstJsonArray(text)) as T;
    } catch (error) {
      throw new Error(`${operation}: invalid JSON array payload (${String(error)})`);
    }
  }
  throw new Error(`${operation}: no JSON payload found`);
}

export function parseJsonObject<T extends object>(
  text: string,
  _schema: unknown,
  operation: string,
): T {
  const parsed = extractJsonBlock<T>(text, operation);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(`${operation}: expected JSON object`);
  }
  return parsed;
}

export function parseJsonArray<T>(text: string, operation: string): T[] {
  const parsed = extractJsonBlock<unknown>(text, operation);
  if (!Array.isArray(parsed)) {
    throw new Error(`${operation}: expected JSON array`);
  }
  return parsed as T[];
}
