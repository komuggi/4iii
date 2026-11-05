// 書き出し用の HTML を作る（元：daihon の lua/daihon/export.lua）。ファイルや画面には触らない（塊の中身は getPart で受け取る）
import { parse, trim } from "./parse.js";
import { format as formatCount } from "./count.js";
import { split as splitRuby } from "./ruby.js";

const MAX_DEPTH = 10;

// 組み込みの塊（parts/ ではなく、書き出すときに作る）
export const BUILTINS = new Set(["@文字数一覧"]);

/** Lua の string.format の %s と %% だけを読む（見出しの show 用） */
function formatShow(pattern, args) {
  let i = 0;
  return pattern.replace(/%([s%])/g, (_, c) => (c === "%" ? "%" : String(args[i++])));
}

/** 見出しの文字（count の見出しは show の形で文字数を付ける） */
function headingText(r, n) {
  if (n !== undefined && r.heading.show) return formatShow(r.heading.show, [r.title, formatCount(n)]);
  return r.title;
}

const isTableOf = (t) => t !== null && typeof t === "object" && !Array.isArray(t);

/** 行の話す人：multi の名前か、split_lead のかっこの中（「(ルル)」→「ルル」）。どちらも無ければ undefined */
export function speakerOf(r) {
  if (r.speaker !== undefined) return r.speaker;
  if (r.lead === undefined) return undefined;
  const m = trim(r.lead).match(/^[(（]([^()（）]+)[)）]$/);
  return m ? trim(m[1]) : undefined;
}

/** 書き出す行のクラス名（CSS で見た目を変えるときに使う）。設定から来る名前は、字・数字・_・- のほかを _ にする（HTML に入るので） */
export function classOf(r) {
  if (r.kind === "セリフ") return "serifu";
  return String((r.type && r.type.class) || `t-${r.kind}`).replace(/[^\p{L}\p{N}_-]/gu, "_");
}

/**
 * 書き出す中身を、形式によらない並びにする
 * opts = { togaki: true（ト書きも出す）, getPart, summary（count.summary の結果）, vertical（縦書きか） }
 * 返す値：{ items, missing }。items の1つは次のどれか
 *   { kind: "heading", level, text, new_page }
 *   { kind: "line", class, text, lead（セリフの前のかっこ・ト書きありだけ）, speaker, togaki }
 *   { kind: "gap" }（空行の空き）
 *   { kind: "count_list", rows: [文字, ...], total: 文字 }（{@文字数一覧}）
 */
export function items(records, cfg, opts) {
  const pdf = cfg.export.pdf;
  const out = [];
  const missing = [];
  // 空行の空きは、次に本文が来たときだけ入れる（続けても1つ、見出しの前と最後には入れない）
  let started = false;
  let pendingGap = false;
  const getPart = (name) => (opts.getPart ? opts.getPart(name) : undefined);

  const push = (item) => {
    if (pendingGap) out.push({ kind: "gap" });
    out.push(item);
    started = true;
    pendingGap = false;
  };

  // 役ごとの見た目（export.pdf.shade の網掛け・dim の薄く・hang_lead の字下げ）：話す人の行から、空行・見出し・ト書き・ほかの人の行の手前まで同じ人
  // role_note（「このトラックのセリフは全て」）のト書きは、その行を役の網掛けにし、次の見出しまでの名前の無い台詞をその役にする（dim だけ効く）
  const shadeNames = isTableOf(pdf.shade) ? Object.keys(pdf.shade) : [];
  const dimNames = Array.isArray(pdf.dim) ? pdf.dim : [];
  const roles = roleNames(cfg);
  const marks = Array.isArray(pdf.mark) ? pdf.mark.filter((w) => typeof w === "string" && w !== "") : [];
  const note = typeof pdf.role_note === "string" && pdf.role_note !== "" ? pdf.role_note : undefined;
  const byRole = roles.size > 0 || marks.length > 0;
  let role; // 今の話す人（役名の行から）
  let trackRole; // role_note で決めた、この見出しの中の役
  let declared; // この行が role_note の行ならその役
  const line = (r, text, lead) => {
    const own = declared ?? role;
    // mark：ト書きの行にこの字があれば、最初の役（shade の1番目）の色にする（その役に関わる指示を目立たせる）
    const marked = r.kind !== "セリフ" && marks.length > 0 && shadeNames.length > 0 && marks.some((w) => String(r.text).includes(w));
    const shade = marked ? 0 : own !== undefined && shadeNames.includes(own) ? shadeNames.indexOf(own) : undefined;
    const dimRole = own ?? (r.kind === "セリフ" ? trackRole : undefined);
    const dim = dimRole !== undefined && dimNames.includes(dimRole);
    const hang = role !== undefined && roles.has(role);
    push({ kind: "line", class: classOf(r), text, lead, speaker: r.speaker, togaki: r.kind !== "セリフ", shade, dim, hang });
  };

  const partInline = (name) => {
    const lines = getPart(name);
    if (!lines) {
      missing.push(name);
      return `{${name}}`;
    }
    return lines.join(" ");
  };

  const countList = () => {
    const rows = [];
    for (const r of records) {
      const n = opts.summary.headings[r.lnum];
      if (n !== undefined) rows.push(headingText(r, n));
    }
    return { kind: "count_list", rows, total: `合計 : ${formatCount(opts.summary.total)}文字` };
  };

  const emit = (recs, depth) => {
    for (const r of recs) {
      const refs = r.refs || [];
      const alone = refs.length === 1 && trim(r.text) === refs[0].match;
      if (byRole) {
        const who = speakerOf(r);
        declared = undefined;
        if (r.kind === "見出し") trackRole = undefined;
        if (r.kind === "空行" || r.kind === "見出し") role = undefined;
        else if (who !== undefined) role = who;
        else if (r.kind !== "セリフ" && r.output) {
          role = undefined;
          const body = String(r.body ?? r.text);
          const at = note ? body.indexOf(note) : -1;
          if (at >= 0) {
            const name = trim(body.slice(at + note.length).replace(/[)）]\s*$/, ""));
            if (roles.has(name)) declared = trackRole = name;
          }
        }
      }

      if (r.kind === "空行") {
        pendingGap = started;
      } else if (r.kind === "塊開始" || r.kind === "塊終了" || !(r.kind === "見出し" || r.output)) {
        // 目印とメモは出さない
      } else if (r.kind === "見出し") {
        const n = depth === 0 && opts.summary ? opts.summary.headings[r.lnum] : undefined;
        out.push({
          kind: "heading",
          level: Math.min(r.level, 6),
          text: headingText(r, n),
          new_page: pdf.new_page ? r.level <= pdf.new_page : false,
        });
        started = false;
        pendingGap = false;
      } else if (r.kind !== "セリフ" && !opts.togaki) {
        // ト書きなし
      } else if (alone && refs[0].name === "@文字数一覧") {
        push(countList());
      } else if (alone && depth < MAX_DEPTH) {
        const lines = getPart(refs[0].name);
        if (lines) {
          emit(parse(lines, cfg), depth + 1);
        } else {
          missing.push(refs[0].name);
          line(r, r.text);
        }
      } else {
        // 塊を読まないとき（blocks = false）は、行の中の { } もそのまま字として出す
        const whole = trim(r.text);
        // split_lead の行：かっこ（lead）とセリフに分け、かっこはト書きありの時だけ出す
        let lead = r.lead;
        let text = (lead ? trim(whole.slice(lead.length)) : whole).replace(/\{([^{}]+)\}/g, (m, name) => (cfg.blocks === false ? m : partInline(trim(name))));
        const marks = opts.vertical && pdf.vertical_marks;
        if (r.range && marks && marks[r.range.op]) {
          // 縦書きでは ▼▲ を読む向きに合う記号にする
          const swap = (s) => {
            const i = s.indexOf(r.range.mark);
            return i >= 0 ? s.slice(0, i) + marks[r.range.op] + s.slice(i + r.range.mark.length) : s;
          };
          if (lead) lead = swap(lead);
          else text = swap(text);
        }
        line(r, text, lead && opts.togaki ? lead : undefined);
      }
    }
  };

  emit(records, 0);
  return { items: out, missing };
}

const escapeHtml = (s) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** 縦書きで1〜2桁の数字を縦中横にする */
const tcy = (s) => s.replace(/(?<![0-9])([0-9]{1,2})(?![0-9])/g, '<span class="tcy">$1</span>');

/** 縦書きでローマ字と3桁以上の数字を立てる（export.pdf.upright）。ほかの所は今までどおり縦中横 */
const UPRIGHT = /([A-Za-z]+|[0-9]{3,})/;
const upright = (s) =>
  s
    .split(UPRIGHT)
    .map((p, i) => (i % 2 === 1 ? `<span class="up">${escapeHtml(p)}</span>` : tcy(escapeHtml(p))))
    .join("");

/**
 * 台本を HTML にする
 * opts = { togaki: true（ト書きも出す）, getPart, title: 題, css: 文字列, summary: count.summary の結果 }
 * 返す値：{ html, missing }（missing＝未登録の塊の名前）
 */
export function build(records, cfg, opts) {
  const pdf = cfg.export.pdf;
  const vertical = pdf.vertical !== false;
  const { items: list, missing } = items(records, cfg, { ...opts, vertical });

  const plainHtml = (s) => (!vertical ? escapeHtml(s) : pdf.upright ? upright(s) : tcy(escapeHtml(s)));
  const textHtml = (s) =>
    splitRuby(s, cfg.ruby)
      .map((p) => (p.text !== undefined ? plainHtml(p.text) : `<ruby>${plainHtml(p.base)}<rt>${escapeHtml(p.reading)}</rt></ruby>`))
      .join("");

  const body = [];
  // keep_blocks：空行で区切られた1かたまりを <div class="keep"> でくくり、ページで分けない
  let inKeep = false;
  const closeKeep = () => {
    if (inKeep) body.push("</div>");
    inKeep = false;
  };
  const roles = roleNames(cfg);
  // 行番号は最初の見出しから（見出しが無ければ全部）
  const firstHeading = pdf.line_numbers ? list.findIndex((it) => it.kind === "heading") : -1;
  for (const [i, it] of list.entries()) {
    if (pdf.keep_blocks && it.kind === "line" && !inKeep) {
      body.push('<div class="keep">');
      inKeep = true;
    } else if (it.kind !== "line") {
      closeKeep();
    }
    if (it.kind === "gap") {
      body.push('<p class="gap"></p>');
    } else if (it.kind === "heading") {
      const cls = it.new_page ? ' class="new-page"' : "";
      body.push(`<h${it.level}${cls}>${textHtml(it.text)}</h${it.level}>`);
    } else if (it.kind === "count_list") {
      body.push('<div class="count-list">');
      for (const row of it.rows) body.push(`<p class="count-row">${textHtml(row)}</p>`);
      body.push(`<p class="count-total">${textHtml(it.total)}</p>`);
      body.push("</div>");
    } else {
      let html = textHtml(it.text);
      if (it.speaker !== undefined) {
        const name = textHtml(it.speaker);
        if (html.startsWith(name)) html = `<span class="speaker">${name}</span>` + html.slice(name.length);
      }
      if (it.lead !== undefined) {
        // hang_lead：役名だけのかっこ（「(ルル)」）は字下げの所へ出し、台詞の頭を続きの行とそろえる
        const who = pdf.hang_lead && roles.has(speakerOf({ lead: it.lead })) ? " who" : "";
        html = `<span class="lead${who}">${textHtml(it.lead)}</span>` + html;
      }
      const pre = i < firstHeading ? " pre" : "";
      // 役名はト書きありにだけ出るので、役の字下げもト書きありだけ
      const hang = pdf.hang_lead && it.hang && opts.togaki ? " role" : "";
      body.push(`<p class="${it.class}${it.shade !== undefined ? ` shade-${it.shade}` : ""}${it.dim ? " dim" : ""}${hang}${pre}">${html}</p>`);
    }
  }
  closeKeep();

  const html = [
    "<!doctype html>",
    '<html lang="ja">',
    "<head>",
    '<meta charset="utf-8">',
    `<title>${escapeHtml(opts.title ?? "台本")}</title>`,
    "<style>",
    css(pdf),
    // split_lead のかっこがある時だけ（無ければ daihon と同じ CSS のまま）
    ...(list.some((it) => it.lead !== undefined) ? [LEAD_CSS] : []),
    ...(pdf.hang_lead && list.some((it) => it.lead !== undefined) ? hangCss(cssValue(typeof pdf.hang_lead === "string" ? pdf.hang_lead : pdf.serifu_indent, "3em")) : []),
    safeCss(opts.css),
    "</style>",
    "</head>",
    "<body>",
    body.join("\n"),
    "</body>",
    "</html>",
    "",
  ].join("\n");
  return { html, missing };
}

const LEAD_CSS = ".lead { font-size: 0.9em; color: #555; margin-inline-end: 0.5em; }";
// 役名を字下げの中に入れ、台詞の頭の手前にそろえる（役の行は字下げを役名の幅に）。役名の字は 0.9em なので、幅は字下げ ÷ 0.9
const hangCss = (indent) => [
  `.serifu.role { padding-inline-start: ${indent}; }`,
  `.lead.who { display: inline-block; box-sizing: border-box; inline-size: calc(${indent} / 0.9); margin-inline-start: calc(${indent} / -0.9); margin-inline-end: 0; padding-inline-end: 0.5em; text-align: end; }`,
];

/** 役名：shade・dim・characters に書いた名前（hang_lead で字下げへ出す名前・role_note で読む名前）。指示のかっこ（「(▼扉の向こうの声)」）は入れない */
function roleNames(cfg) {
  const pdf = cfg.export.pdf;
  return new Set([
    ...Object.keys(isTableOf(pdf.shade) ? pdf.shade : {}),
    ...(Array.isArray(pdf.dim) ? pdf.dim : []),
    ...(Array.isArray(cfg.characters) ? cfg.characters : []).map((c) => (typeof c === "string" ? c : c && c.name)),
  ]);
}
const or = (v, fallback) => (v === undefined || v === null || v === false ? fallback : v);
// 設定から <style> に入れる値：CSS や HTML を抜け出せる記号（< > { } ;）は外す
const cssValue = (v, fallback) => String(or(v, fallback)).replace(/[<>{};]/g, "");
// 自分の CSS（export.pdf.css）：</style> で抜け出せないようにする
export const safeCss = (s) => String(s ?? "").replace(/<\/(style)/gi, "<\\/$1");

/**
 * 行番号（export.pdf.line_numbers）：本文の行（セリフとト書き・空行と見出しは数えない）に通しの番号。
 * 見出しがあれば最初の見出しから数える（その前の仕様書などは .pre で外す）。
 * 縦書きはページの上にそろえて、その行の最初の列の真上に横向きで（字下げのあるセリフもト書きも同じ高さ）。横書きは行の左の余白に
 */
const LN_SIZE = 0.55; // 番号の字の大きさ（本文の何倍か）
function lineNumberCss(vertical, lineHeight) {
  const lines = "p:not(.gap):not(.count-row):not(.count-total):not(.pre)";
  const look = `content: counter(ln); position: absolute; writing-mode: horizontal-tb; font-size: ${LN_SIZE}em; line-height: 1; color: #888;`;
  // 列の幅＝行の高さ（本文の em）。番号の字の em に直して、右の列（最初の列）の幅にそろえる
  const lh = Number.parseFloat(lineHeight);
  const col = Number.isFinite(lh) && lh > 0 ? `right: 0; width: ${+(lh / LN_SIZE).toFixed(3)}em;` : "left: 0; right: 0;";
  return [
    "body { counter-reset: ln; }",
    `${lines} { counter-increment: ln; position: relative; }`,
    vertical
      ? `${lines}::before { ${look} top: -1.8em; ${col} text-align: center; }`
      : `${lines}::before { ${look} left: -3.5em; top: 0; width: 3em; text-align: right; }`,
  ];
}

/** 既定の見た目。export.pdf の値から作る。細かい所は export.pdf.css の自分の CSS で上書きする */
export function css(pdf) {
  const vertical = pdf.vertical !== false;
  const pageNumber =
    pdf.page_number !== false
      ? "@bottom-center { content: counter(page); font-size: 9pt; writing-mode: horizontal-tb; }"
      : "";
  return [
    `@page { size: ${cssValue(pdf.size, "A4 landscape")}; margin: ${cssValue(pdf.margin, "20mm")}; ${pageNumber} }`,
    "html {",
    vertical ? "  writing-mode: vertical-rl;" : "",
    `  font-family: ${cssValue(pdf.font, "serif")};`,
    `  font-size: ${cssValue(pdf.font_size, "11pt")};`,
    `  line-height: ${cssValue(pdf.line_height, 1.8)};`,
    "}",
    "body { margin: 0; }",
    "p { margin: 0; }",
    "h1 { font-size: 1.6em; margin-block: 0 1em; }",
    "h2 { font-size: 1.25em; margin-block: 1em; }",
    ".new-page { break-before: page; }",
    // 見出しが続く所と、最初の見出しでは改ページしない
    ".new-page + .new-page, body > .new-page:first-child { break-before: auto; }",
    ".gap { block-size: 0; margin-block-end: 1em; }",
    // ト書きは行の頭、セリフは1段下げる
    `.serifu { padding-inline-start: ${cssValue(pdf.serifu_indent, "3em")}; }`,
    ".t-指示 { font-size: 0.9em; color: #555; }",
    ".speaker { font-weight: bold; }",
    ".tcy { text-combine-upright: all; }",
    ".count-list { margin-block: 1em; }",
    ".count-total { font-weight: bold; }",
    // 足した設定の見た目は、使う時だけ（使わなければ daihon と同じ CSS のまま）
    ...(vertical && pdf.upright ? [".up { text-orientation: upright; }"] : []),
    ...(pdf.line_numbers ? lineNumberCss(vertical, or(pdf.line_height, 1.8)) : []),
    ...(pdf.keep_blocks ? [".keep { break-inside: avoid; }"] : []),
    ...Object.values(isTableOf(pdf.shade) ? pdf.shade : {}).map((c, i) => `.shade-${i} { background: ${cssValue(c, "transparent")}; }`),
    // 薄くするのは字の色だけ（opacity だと行番号や網掛けまで薄くなり、ほかの灰色とそろわない）
    ...(Array.isArray(pdf.dim) && pdf.dim.length > 0 ? [".dim { color: #a0a0a0; }"] : []),
  ].join("\n");
}
