import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export async function ensureDirectory(dirPath: string): Promise<void> {
  await mkdir(dirPath, { recursive: true });
}

export async function writeJsonFile(filePath: string, data: unknown): Promise<void> {
  await ensureDirectory(path.dirname(filePath));
  await writeFile(filePath, JSON.stringify(data, null, 2), "utf-8");
}

export async function readJsonFile<T>(filePath: string, fallback: T): Promise<T> {
  try {
    const content = await readFile(filePath, "utf-8");
    return JSON.parse(content) as T;
  } catch {
    return fallback;
  }
}

export async function writeTextFile(filePath: string, content: string): Promise<void> {
  await ensureDirectory(path.dirname(filePath));
  await writeFile(filePath, content, "utf-8");
}

export async function readTextFile(filePath: string): Promise<string> {
  return readFile(filePath, "utf-8");
}

export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await readFile(filePath);
    return true;
  } catch {
    return false;
  }
}
