/** Pure intake rules for creating an analysis from a document. */
export const MAX_FILE_BYTES = 20 * 1024 * 1024;
export const MIN_TEXT_CHARS = 300;
export const DOC_TYPES = ["SOW", "Proposal", "Project document", "Architecture", "Other"] as const;
export const REGIONS = ["United States", "UK & Ireland", "European Union", "Global"] as const;

export type FileKind = "pdf" | "docx";

/** Returns the file kind, or throws a friendly message. */
export function checkFile(name: string, size: number): FileKind {
  const ext = name.toLowerCase().split(".").pop() ?? "";
  if (ext === "doc") throw new Error("Please save it as PDF or DOCX");
  if (ext !== "pdf" && ext !== "docx") throw new Error("Only PDF or DOCX files are supported");
  if (size > MAX_FILE_BYTES) throw new Error("That file is over 20 MB");
  return ext;
}

export function isTooLittleText(text: string): boolean {
  return text.trim().length < MIN_TEXT_CHARS;
}

export const LITTLE_TEXT_MESSAGE =
  "This file has little readable text (it may be scanned). Paste the text instead.";

export function analysisTitle(customer: string, docType: string): string {
  return `${customer.trim()} · ${docType}`;
}

export function storagePath(userId: string, analysisId: string, filename: string): string {
  return `${userId}/${analysisId}/${filename.replace(/[\\/]/g, "_")}`;
}

export async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}
