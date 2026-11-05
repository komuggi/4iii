// 元の daihon の tests/test_export.lua のうち、HTML の所を写した物
import { test } from "node:test";
import assert from "node:assert/strict";
import { merge, defaults } from "../src/config.js";
import { parse } from "../src/parse.js";
import { context, summary } from "../src/count.js";
import { build } from "../src/export.js";
import { render, makeConfig, splitLines } from "../src/index.js";

const parts = { あいさつ: ["// ▼右・近", "おかえり"], 短い: ["またね"] };
const getPart = (n) => parts[n];

function html(lines, togaki, over) {
  const cfg = merge(defaults, over);
  const records = parse(lines, cfg);
  const sum = summary(records, context(cfg, getPart));
  return build(records, cfg, { togaki, getPart, summary: sum, title: "t" });
}

const has = (s, part) => assert.ok(s.includes(part), `ない: ${part}`);
const hasnt = (s, part) => assert.ok(!s.includes(part), `あってはいけない: ${part}`);
const countOf = (s, part) => s.split(part).length - 1;

test("書き出し：ト書きあり／なし。メモと塊の目印は出さない", () => {
  const lines = ["## Track 01", "(玄関)", "// SE : 足音", "ただいま", "¥ メモ", "{{短い", "またね", "}}"];
  const a = html(lines, true).html;
  has(a, '<p class="t-場面">(玄関)</p>');
  has(a, '<p class="t-指示">// SE : 足音</p>');
  has(a, '<p class="serifu">ただいま</p>');
  hasnt(a, "メモ");
  hasnt(a, "{{");
  const b = html(lines, false).html;
  hasnt(b, "玄関");
  hasnt(b, "足音");
  has(b, '<p class="serifu">ただいま</p>');
});

test("書き出し：見出しに文字数。{@文字数一覧}", () => {
  const s = html(["{@文字数一覧}", "# 本編", "## Track 01", "ただいま", "## Track 02", "{短い}"], true).html;
  has(s, 'Track <span class="tcy">01</span> : <span class="tcy">4</span>文字');
  has(s, '<p class="count-total">合計 : <span class="tcy">7</span>文字</p>');
  has(s, '<h2 class="new-page">');
});

test("書き出し：塊は中身に置き換える。1行なら行ごと、途中なら文の中に", () => {
  const a = html(["{あいさつ}", "また{短い}"], true).html;
  has(a, '<p class="t-指示">// ◀右・近</p>');
  has(a, '<p class="serifu">おかえり</p>');
  has(a, '<p class="serifu">またまたね</p>');
  hasnt(html(["{あいさつ}"], false).html, "右・近");
  assert.deepEqual(html(["{ない}"], true).missing, ["ない"]);
});

test("書き出し：HTML の記号は逃がす。横書きにもできる", () => {
  const s = html(["<b>&"], true, { export: { pdf: { vertical: false } } }).html;
  has(s, "&lt;b&gt;&amp;");
  hasnt(s, "vertical-rl");
  has(html(["あ"], true).html, "writing-mode: vertical-rl");
});

test("書き出し：空行は続けても1つ", () => {
  eq1(countOf(html(["あ", "", "", "// 指示", "", "い"], false).html, 'class="gap"'), 1);
});

test("書き出し：見出しの前と最後には空きを入れない", () => {
  eq1(countOf(html(["あ", "", "## Track 01", "", "い", ""], true).html, 'class="gap"'), 0);
});

test("書き出し：縦書きでは ▼▲ を ◀▶ にする。横書きと設定で外したときはそのまま", () => {
  const lines = ["// ▼前・中", "おかえり", "// ▲前・中", "// ▼と書いた文の中の▼"];
  const v = html(lines, true).html;
  has(v, "// ◀前・中");
  has(v, "// ▶前・中");
  has(v, "// ◀と書いた文の中の▼");
  has(html(lines, true, { export: { pdf: { vertical: false } } }).html, "// ▼前・中");
  has(html(lines, true, { export: { pdf: { vertical_marks: false } } }).html, "// ▼前・中");
});

test("書き出し：セリフは字下げ、ト書きは行の頭", () => {
  const s = html(["あ"], true).html;
  has(s, ".serifu { padding-inline-start: 3em; }");
  hasnt(s, ".t-指示 { padding-inline-start");
});

test("書き出し：1〜2桁の数字だけ縦中横", () => {
  const s = html(["1 と 12 と 123 と １"], true).html;
  has(s, '<span class="tcy">1</span> と <span class="tcy">12</span> と 123 と １');
});

test("書き出し：upright でローマ字と3桁以上の数字を立てる（1〜2桁は縦中横のまま）。横書きでは何もしない", () => {
  const up = { export: { pdf: { upright: true } } };
  const s = html(["(SE:足音) 12 と 123 と BGV_01 と a&b"], true, up).html;
  has(s, '<span class="up">SE</span>:足音');
  has(s, '<span class="tcy">12</span> と <span class="up">123</span>');
  has(s, '<span class="up">BGV</span>_<span class="tcy">01</span>');
  has(s, '<span class="up">a</span>&amp;<span class="up">b</span>'); // &amp; の中の字はさわらない
  has(s, ".up { text-orientation: upright; }");
  const off = html(["SE 123"], true).html;
  hasnt(off, 'class="up"');
  hasnt(off, ".up {");
  const yoko = html(["SE 123"], true, { export: { pdf: { upright: true, vertical: false } } }).html;
  hasnt(yoko, 'class="up"');
});

test("書き出し：shade で話す人の行から空行・ト書き・ほかの人の行の手前まで網掛け", () => {
  const sh = { split_lead: true, export: { pdf: { shade: { ルル: "#FFF2CC", 両方: "#DDEBF7" } } } };
  const lines = ["(ルル)ふふ", "続き", "", "(ヴィヴィ)おい", "まだ", "(ルル)ねぇ", "(SE:足音)", "その後", "(両方)せーの", "## Track 02", "見出しの後"];
  const s = html(lines, true, sh).html;
  has(s, '<p class="serifu shade-0"><span class="lead">(ルル)</span>ふふ</p>');
  has(s, '<p class="serifu shade-0">続き</p>');
  has(s, '<p class="serifu"><span class="lead">(ヴィヴィ)</span>おい</p>');
  has(s, '<p class="serifu">まだ</p>');
  has(s, '<p class="serifu shade-0"><span class="lead">(ルル)</span>ねぇ</p>');
  has(s, '<p class="t-場面">(SE:足音)</p>');
  has(s, '<p class="serifu">その後</p>');
  has(s, '<p class="serifu shade-1"><span class="lead">(両方)</span>せーの</p>');
  has(s, '<p class="serifu">見出しの後</p>');
  has(s, ".shade-0 { background: #FFF2CC; }");
  has(s, ".shade-1 { background: #DDEBF7; }");
  // ト書きなしでも、かっこは消えて網掛けは残る
  const b = html(lines, false, sh).html;
  has(b, '<p class="serifu shade-0">ふふ</p>');
  // multi の名前でも決まる。色の値から CSS を抜け出せない
  const m = html(["ルル「やあ」", "ヴィヴィ「よう」"], true, { mode: "multi", export: { pdf: { shade: { ルル: "red;} body{display:none" } } } }).html;
  has(m, 'class="serifu shade-0"><span class="speaker">ルル</span>');
  has(m, ".shade-0 { background: red bodydisplay:none; }");
  hasnt(m, "body{display");
});

test("書き出し：line_numbers で本文の行に通しの番号（最初の見出しから・空行・見出し・文字数一覧は数えない）", () => {
  const s = html(["仕様", "## Track 01", "ただいま"], true, { export: { pdf: { line_numbers: true } } }).html;
  has(s, "body { counter-reset: ln; }");
  has(s, "p:not(.gap):not(.count-row):not(.count-total):not(.pre) { counter-increment: ln; position: relative; }");
  has(s, "top: -1.8em; right: 0; width: 3.273em; text-align: center;"); // 縦書きは上にそろえ、最初の列（幅 1.8 ÷ 0.55）の真上
  has(html(["ただいま"], true, { export: { pdf: { line_numbers: true, line_height: "2em" } } }).html, "width: 3.636em;");
  has(html(["ただいま"], true, { export: { pdf: { line_numbers: true, line_height: "normal" } } }).html, "left: 0; right: 0;");
  has(s, '<p class="serifu pre">仕様</p>'); // 最初の見出しより前は数えない
  has(s, '<p class="serifu">ただいま</p>');
  has(html(["ただいま"], true, { export: { pdf: { line_numbers: true } } }).html, '<p class="serifu">ただいま</p>'); // 見出しが無ければ全部
  hasnt(html(["仕様", "## Track 01"], true).html, "pre");
  has(html(["ただいま"], true, { export: { pdf: { line_numbers: true, vertical: false } } }).html, "left: -3.5em;");
});

test("書き出し：keep_blocks で空行までの1かたまりをくくる（見出し・空行の前で閉じる）", () => {
  const k = { export: { pdf: { keep_blocks: true } } };
  const s = html(["ふふ", "続き", "", "まだ", "## Track 02", "次"], true, k).html;
  has(s, '<div class="keep">\n<p class="serifu">ふふ</p>\n<p class="serifu">続き</p>\n</div>\n<p class="gap"></p>\n<div class="keep">\n<p class="serifu">まだ</p>\n</div>\n<h2');
  has(s, '<div class="keep">\n<p class="serifu">次</p>\n</div>\n</body>');
  has(s, ".keep { break-inside: avoid; }");
  hasnt(html(["ただいま"], true).html, 'class="keep"');
});

test("書き出し：dim で読まない役の行を薄く（決め方は shade と同じ・両方に使える）", () => {
  const o = { split_lead: true, export: { pdf: { shade: { ルル: "#FFF2CC" }, dim: ["ヴィヴィ"] } } };
  const s = html(["(ヴィヴィ)おい", "まだ", "(SE:足音)", "その後", "(ルル)ふふ"], true, o).html;
  has(s, '<p class="serifu dim"><span class="lead">(ヴィヴィ)</span>おい</p>');
  has(s, '<p class="serifu dim">まだ</p>');
  has(s, '<p class="t-場面">(SE:足音)</p>');
  has(s, '<p class="serifu">その後</p>');
  has(s, '<p class="serifu shade-0"><span class="lead">(ルル)</span>ふふ</p>');
  has(s, ".dim { color: #a0a0a0; }");
  hasnt(html(["おい"], true).html, "dim");
});

test("render：ト書きあり／なしの2つ。both = false で1つ", () => {
  const two = render("ただいま\n", makeConfig({}), { name: "x" });
  assert.deepEqual(
    two.outputs.map((o) => o.name),
    ["x_ト書きあり", "x_ト書きなし"],
  );
  const one = render("ただいま\n", makeConfig({ export: { pdf: { both: false } } }));
  assert.deepEqual(
    one.outputs.map((o) => o.name),
    ["台本_ト書きあり"],
  );
});

test("行に分ける：BOM と CRLF を取る。最後の改行のあとは行にしない", () => {
  assert.deepEqual(splitLines("﻿a\r\nb\r\n"), ["a", "b"]);
  assert.deepEqual(splitLines("a\n\nb"), ["a", "", "b"]);
  assert.deepEqual(splitLines(""), []);
});

function eq1(got, want) {
  assert.equal(got, want);
}
