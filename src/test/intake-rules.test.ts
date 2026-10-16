import { describe, expect, it } from "vitest";
import { analysisTitle, checkFile, isTooLittleText, storagePath, sha256Hex } from "@/lib/encore/intake";

describe("intake rules", () => {
  it("rejects .doc", () => expect(() => checkFile("a.doc", 10)).toThrow("Please save it as PDF or DOCX"));
  it("rejects files over 20 MB", () => expect(() => checkFile("a.pdf", 20 * 1024 * 1024 + 1)).toThrow());
  it("accepts a 20 MB docx", () => expect(checkFile("a.DOCX", 20 * 1024 * 1024)).toBe("docx"));
  it("under 300 chars is too little", () => expect(isTooLittleText("x".repeat(299))).toBe(true));
  it("300 chars is enough", () => expect(isTooLittleText("x".repeat(300))).toBe(false));
  it("title joins name and type", () => expect(analysisTitle("Acme ", "SOW")).toBe("Acme · SOW"));
  it("storage path is user/analysis/file", () => expect(storagePath("u", "a", "f.pdf")).toBe("u/a/f.pdf"));
  it("sha256 hex", async () => expect(await sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"));
});
import { DOC_TYPE_CODE, REGION_CODE } from "@/lib/encore/intake";
describe("stored codes", () => {
  it("SOW stored as sow", () => expect(DOC_TYPE_CODE.SOW).toBe("sow"));
  it("UK & Ireland stored as uk_ie", () => expect(REGION_CODE["UK & Ireland"]).toBe("uk_ie"));
});
