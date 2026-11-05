// Word（.docx）の台本を読む（CLI だけ）
import { test } from "node:test";
import assert from "node:assert/strict";
import { deflateRawSync } from "node:zlib";
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { docxLines, paragraphs, unzipOne } from "../bin/docx.js";

/** 試し用の zip を作る（files = { 名前: 文字列 }・deflate = true で縮める） */
function zip(files, deflate = true) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const raw = Buffer.from(text, "utf8");
    const data = deflate ? deflateRawSync(raw) : raw;
    const n = Buffer.from(name, "utf8");
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(deflate ? 8 : 0, 8);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(n.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(deflate ? 8 : 0, 10);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(n.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, n, data);
    centrals.push(central, n);
    offset += 30 + n.length + data.length;
  }
  const dir = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(files).length, 8);
  end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(dir.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, dir, end]);
}

const doc = (body) =>
  `<?xml version="1.0"?><w:document xmlns:w="x"><w:body>${body}<w:sectPr/></w:body></w:document>`;
const P = (...runs) => `<w:p><w:pPr><w:jc w:val="left"/></w:pPr>${runs.map((t) => `<w:r><w:t xml:space="preserve">${t}</w:t></w:r>`).join("")}</w:p>`;

test("docx：段落を1行ずつ。空の段落は空行・改行で分け・タブ・記号を戻し・消した字は入れない", () => {
  const xml = doc(
    P("(ルル)", "ふふ") +
      "<w:p/>" +
      '<w:p><w:r><w:t>一</w:t><w:br/><w:t>二</w:t><w:tab/><w:t>&amp;&lt;&#x2665;</w:t></w:r></w:p>' +
      '<w:p><w:r><w:delText>消した</w:delText><w:t>残す</w:t></w:r></w:p>' +
      '<w:tbl><w:tr><w:tc><w:p><w:r><w:t>表</w:t></w:r></w:p></w:tc></w:tr></w:tbl>',
  );
  assert.deepEqual(paragraphs(xml), ["(ルル)ふふ", "", "一", "二\t&<♥", "残す", "表"]);
});

test("docx：zip の中から本文を取る（縮めた物・縮めていない物）。docx でない物は知らせる", () => {
  for (const deflate of [true, false]) {
    const buf = zip({ "[Content_Types].xml": "<x/>", "word/document.xml": doc(P("ただいま")) }, deflate);
    assert.deepEqual(docxLines(buf), ["ただいま"]);
    assert.equal(unzipOne(buf, "ない.xml"), undefined);
  }
  assert.throws(() => docxLines(Buffer.from("ただの文字")), /zip ではありません/);
  assert.throws(() => docxLines(zip({ "a.xml": "<x/>" })), /本文/);
});

test("CLI：.docx から HTML と、渡す用の .txt を書く", () => {
  const dir = mkdtempSync(join(tmpdir(), "4iii-"));
  writeFileSync(join(dir, "台本.docx"), zip({ "word/document.xml": doc(P("(ルル)ふふ") + "<w:p/>" + P("## 二")) }));
  const bin = new URL("../bin/4iii.js", import.meta.url).pathname;
  const res = spawnSync(process.execPath, [bin, join(dir, "台本.docx"), "--no-pdf"], { encoding: "utf8" });
  assert.equal(res.status, 0, res.stderr);
  assert.equal(readFileSync(join(dir, "out", "台本.txt"), "utf8"), "(ルル)ふふ\n\n## 二\n");
  assert.ok(existsSync(join(dir, "out", "台本_ト書きあり.html")));
});
