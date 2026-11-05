// Word（.docx）の台本から本文の段落を行として取り出す（CLI だけ・ブラウザのページは貼り付け）
// .docx は zip。中の word/document.xml の段落（<w:p>）を1行ずつにする（表の中の段落も）。脚注・ヘッダー・コメントは読まない
import { inflateRawSync } from "node:zlib";

const EOCD = 0x06054b50; // zip の終わりの印
const CENTRAL = 0x02014b50; // zip の目次の1件

/** zip の中のファイルを1つ取り出す（無ければ undefined） */
export function unzipOne(buf, want) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 0xffff); i--) {
    if (buf.readUInt32LE(i) === EOCD) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("Word（.docx）として読めません（zip ではありません）");
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  for (let i = 0; i < count && p + 46 <= buf.length; i++) {
    if (buf.readUInt32LE(p) !== CENTRAL) break;
    const method = buf.readUInt16LE(p + 10);
    const size = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const offset = buf.readUInt32LE(p + 42);
    if (buf.toString("utf8", p + 46, p + 46 + nameLen) === want) {
      const start = offset + 30 + buf.readUInt16LE(offset + 26) + buf.readUInt16LE(offset + 28);
      const data = buf.subarray(start, start + size);
      if (method === 0) return data;
      if (method === 8) return inflateRawSync(data);
      throw new Error(`${want} の縮め方（${method}）は読めません`);
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  return undefined;
}

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
const unescapeXml = (s) =>
  s.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[a-z]+);/g, (m, e) =>
    e[0] === "#" ? String.fromCodePoint(e[1] === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : (ENTITIES[e] ?? m),
  );

/**
 * document.xml の段落を行の配列にする。段落の中の改行（<w:br/>）は行を分け、タブはタブのまま。消した字（変更履歴の削除）は入れない
 * shortcut: 段落の中のテキストボックス（段落が入れ子）は外の段落に混ざる。台本で使われたら入れ子を読む
 */
export function paragraphs(xml) {
  const body = xml.replace(/<w:delText\b[^>]*>[^<]*<\/w:delText>/g, "");
  const lines = [];
  for (const [p] of body.matchAll(/<w:p\b[^>]*\/>|<w:p\b[^>]*>[\s\S]*?<\/w:p>/g)) {
    let text = "";
    for (const [, t, , br] of p.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>|(<w:tab\/>)|(<w:br\b[^>]*\/>)/g)) {
      if (t !== undefined) text += unescapeXml(t);
      else if (br !== undefined) text += "\n";
      else text += "\t";
    }
    lines.push(...text.split("\n"));
  }
  return lines;
}

/** .docx の中身（Buffer）→ 行の配列 */
export function docxLines(buf) {
  const xml = unzipOne(buf, "word/document.xml");
  if (!xml) throw new Error("Word（.docx）の中に本文（word/document.xml）がありません");
  return paragraphs(xml.toString("utf8"));
}
