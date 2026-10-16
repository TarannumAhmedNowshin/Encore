/** Browser-only text extraction. Libraries load lazily so SSR never evaluates them. */
export type Extracted = { text: string; pages: string[] };

export async function extractPdf(file: File): Promise<Extracted> {
  const pdfjs = await import("pdfjs-dist");
  const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    let out = "";
    for (const item of content.items) {
      if ("str" in item) out += item.str + (item.hasEOL ? "\n" : " ");
    }
    pages.push(out.replace(/[ \t]+\n/g, "\n").trim());
  }
  return { text: pages.join("\n\n"), pages };
}

export async function extractDocx(file: File): Promise<Extracted> {
  const mammoth = (await import("mammoth/mammoth.browser")) as unknown as typeof import("mammoth");
  const { value } = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
  const text = value.trim();
  return { text, pages: [text] };
}
