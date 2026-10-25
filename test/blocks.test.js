// 塊を読まない（blocks = false・4iii のページの形）
import { test } from "node:test";
import assert from "node:assert/strict";
import { makeConfig, render, splitLines, parser, hankaku } from "../src/index.js";

const off = makeConfig({ blocks: false });

test("塊を読まない：{名前} と {{ }} はセリフのまま・{@文字数一覧} だけは読む", () => {
  const r = parser.parse(["{{ いつもの", "{いつもの}", "}}", "{@文字数一覧}"], off);
  assert.deepEqual(r.map((x) => x.kind), ["セリフ", "セリフ", "セリフ", "セリフ"]);
  assert.deepEqual(r[1].refs, []);
  assert.equal(r[3].refs.length, 1);
});

test("塊を読まない：未登録の塊と言わず、{ } を字のまま PDF に出す", () => {
  const text = "## Track 01\n{いつもの}\nただいま{よびかけ}\n";
  const res = render(splitLines(text), off, { name: "台本" });
  assert.deepEqual(res.missing, []);
  const html = res.outputs[0].html;
  assert.match(html, /\{いつもの\}/);
  assert.match(html, /ただいま\{よびかけ\}/);
  assert.equal(res.summary.total, "{いつもの}".length + "ただいま{よびかけ}".length);
});

test("塊を読まない：貼った ｛｝ は全角のまま（読むときは半角にする）", () => {
  assert.equal(hankaku.normalizePaste("｛いつもの｝", off), "｛いつもの｝");
  assert.equal(hankaku.normalizePaste("｛いつもの｝", makeConfig({})), "{いつもの}");
});

test("blocks は true か false だけ", () => {
  assert.throws(() => makeConfig({ blocks: "no" }), /blocks は true か false です/);
});
