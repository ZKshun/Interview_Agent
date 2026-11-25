import { extname } from "node:path";

export function cleanText(text) {
  return text
    .replace(/^\uFEFF/, "")
    .replace(/\r\n?/g, "\n")
    .trim();
}

export async function parseFile(name, buffer) {
  if (buffer.length > 10 * 1024 * 1024) throw new Error("文件不能超过 10 MB");
  let text;
  const extension = extname(name).toLowerCase();
  if ([".txt", ".md"].includes(extension)) {
    text = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } else if (extension === ".pdf") {
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    try {
      text = (await parser.getText()).text;
    } finally {
      await parser.destroy();
    }
  } else if (extension === ".docx") {
    const { default: mammoth } = await import("mammoth");
    text = (await mammoth.extractRawText({ buffer })).value;
  } else throw new Error("不支持的文件格式，请上传 PDF、DOCX、TXT 或 Markdown");
  text = cleanText(text);
  if (!text) throw new Error("未提取到文本；扫描版 PDF 需要先在本地转为文本");
  if (text.length > 60000)
    throw new Error("单份资料文本不能超过 60,000 字符，请拆分资料");
  return text;
}
