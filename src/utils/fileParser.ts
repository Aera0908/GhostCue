import * as pdfjsLib from "pdfjs-dist";
import JSZip from "jszip";

// Configure pdfjs worker
try {
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url
  ).toString();
} catch {
  // Fallback worker URL
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;
}

/**
 * Extract clean, readable text from any PDF ArrayBuffer using pdfjs-dist.
 */
export async function extractTextFromPdf(arrayBuffer: ArrayBuffer): Promise<string> {
  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(arrayBuffer),
    useSystemFonts: true,
  });

  const pdf = await loadingTask.promise;
  const pageTexts: string[] = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();

    let lastY: number | null = null;
    let pageText = "";

    for (const item of textContent.items as any[]) {
      const str = item.str || "";
      if (!str) continue;

      const currentY = item.transform ? item.transform[5] : null;

      // If vertical position changed noticeably, add a newline
      if (lastY !== null && currentY !== null && Math.abs(currentY - lastY) > 5) {
        pageText += "\n";
      } else if (pageText.length > 0 && !pageText.endsWith(" ") && !pageText.endsWith("\n")) {
        pageText += " ";
      }

      pageText += str;
      if (currentY !== null) {
        lastY = currentY;
      }
    }

    if (pageText.trim()) {
      pageTexts.push(pageText.trim());
    }
  }

  return pageTexts.join("\n\n");
}

/**
 * Extract clean text from DOCX archive using JSZip (extracting word/document.xml).
 */
export async function extractTextFromDocx(arrayBuffer: ArrayBuffer): Promise<string> {
  const zip = await JSZip.loadAsync(arrayBuffer);
  const docXml = await zip.file("word/document.xml")?.async("string");

  if (!docXml) {
    throw new Error("Invalid DOCX format: word/document.xml missing.");
  }

  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(docXml, "application/xml");
  const paragraphs = xmlDoc.getElementsByTagName("w:p");

  const lines: string[] = [];
  for (let i = 0; i < paragraphs.length; i++) {
    const p = paragraphs[i];
    const textNodes = p.getElementsByTagName("w:t");
    let line = "";
    for (let j = 0; j < textNodes.length; j++) {
      line += textNodes[j].textContent || "";
    }
    if (line.trim()) {
      lines.push(line.trim());
    }
  }

  return lines.join("\n");
}

/**
 * Universal resume & document text extractor.
 * Handles PDF, DOCX, TXT, MD, and RTF formats.
 */
export async function extractTextFromFile(file: File): Promise<string> {
  const extension = file.name.split(".").pop()?.toLowerCase() || "";

  // 1. PDF Documents
  if (extension === "pdf" || file.type === "application/pdf") {
    const buffer = await file.arrayBuffer();
    return await extractTextFromPdf(buffer);
  }

  // 2. Word (.docx) Documents
  if (extension === "docx" || file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    const buffer = await file.arrayBuffer();
    return await extractTextFromDocx(buffer);
  }

  // 3. Plain Text / Markdown / Code / RTF
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve((e.target?.result as string) || "");
    reader.onerror = (e) => reject(e);
    reader.readAsText(file);
  });
}
