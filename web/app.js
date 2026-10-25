// ブラウザのページ：貼った台本 → 縦書きのプレビュー → 印刷して PDF に
// 部品（../src/index.js）をそのまま使う。外の CDN は使わない
// 台本はどこにも送らず、ブラウザにも残さない（外への通信は index.html の CSP で止めている）
import { makeConfig, render, splitLines, parser, hankaku, fields, config as configLib } from "../src/index.js";

const $ = (id) => document.getElementById(id);
const textBox = $("text");
const configBox = $("config");
const nameBox = $("name");
const frame = $("preview");
const status = $("status");
const hl = $("hl");
const tracks = $("tracks");

// 画面で見るときだけの見た目（印刷には効かない）
const SCREEN_CSS = "@media screen { html { background: #fff; } body { padding: 24px; } }";

let project = structuredClone(fields.START); // 設定の正本（4iii.json の形）。枠と「設定」の欄はここを映す
let cfg = makeConfig(project);

const box = {
  heading: $("f-heading"),
  se: $("f-se"),
  shiji: $("f-shiji"),
  other: $("f-other"),
  otherOutput: $("f-other-out"),
  rubyOn: $("r-on"),
  rubyStart: $("r-start"),
  rubyOpen: $("r-open"),
  rubyClose: $("r-close"),
  rubyPixiv: $("r-pixiv"),
};
const verticalChecked = () => document.querySelector('input[name="vertical"]:checked').value === "1";

/** 設定を使う。だめな設定なら前のまま。showJson：「設定」の欄も書き直すか */
function useProject(next, showJson) {
  const error = $("config-error");
  try {
    configLib.stripGlobalOnly(next);
    // ページは塊を読まない（貼った台本の { } は字のまま）・最初のトラックより前（仕様書など）は数えない
    // かっこの後ろに字が続く行（「(▼前・近) おぼっちゃま」）は、かっこがト書き・後ろがセリフ
    cfg = makeConfig({ ...next, blocks: false, split_lead: true, count: { ...(next.count ?? {}), skip_before_heading: true } });
    project = next;
    error.textContent = "";
  } catch (err) {
    error.textContent = `設定を読めません（前の設定のまま）：${err.message}`;
    return false;
  }
  if (showJson) configBox.value = JSON.stringify(project, null, 2);
  const f = fields.read(project);
  box.heading.value = f.heading;
  box.se.value = f.se;
  box.shiji.value = f.shiji;
  box.other.value = f.other;
  box.otherOutput.checked = f.otherOutput;
  box.rubyOn.checked = f.ruby.on;
  box.rubyStart.value = f.ruby.start;
  box.rubyOpen.value = f.ruby.open;
  box.rubyClose.value = f.ruby.close;
  box.rubyPixiv.checked = f.ruby.pixiv;
  for (const el of [box.rubyStart, box.rubyOpen, box.rubyClose, box.rubyPixiv]) el.disabled = !f.ruby.on;
  document.querySelector(`input[name="vertical"][value="${f.vertical ? 1 : 0}"]`).checked = true;
  $("f-extra").textContent = f.extra.length > 0 ? `枠のほかに、設定で足した種類があります：${f.extra.join("、")}` : "";
  return true;
}

/** 枠の中身を設定に書く */
function fromFields() {
  const next = fields.write(project, {
    heading: box.heading.value,
    se: box.se.value,
    shiji: box.shiji.value,
    other: box.other.value,
    otherOutput: box.otherOutput.checked,
    vertical: verticalChecked(),
    ruby: {
      on: box.rubyOn.checked,
      start: box.rubyStart.value,
      open: box.rubyOpen.value,
      close: box.rubyClose.value,
      pixiv: box.rubyPixiv.checked,
    },
  });
  // ルビを読むに戻したとき、記号が空なら既定の記号にする
  if (box.rubyOn.checked && next.ruby && !next.ruby.open && !next.ruby.close && next.ruby.start.length === 0) {
    next.ruby = structuredClone(configLib.defaults.ruby);
  }
  if (useProject(next, true)) schedule();
}

// 行の種類ごとの台本の欄の色（字の太さは変えない。変えるとカーソルの位置がずれる）
const KIND_CLASS = {
  head: "underline decoration-neutral-200 underline-offset-[5px] dark:decoration-neutral-700",
  togaki: "text-neutral-500 dark:text-neutral-400",
  off: "text-neutral-400 dark:text-neutral-500",
};

/** 行の種類 → 台本の欄の色の class */
function kindClass(r) {
  if (!r || r.kind === "セリフ" || r.kind === "空行") return "";
  if (r.kind === "見出し") return KIND_CLASS.head;
  return r.output === false ? KIND_CLASS.off : KIND_CLASS.togaki;
}

/** 台本の欄の後ろの層に、色を分けた同じ文を書く（textarea の字は透明） */
function paint() {
  const raw = textBox.value.split("\n");
  const records = parser.parse(splitLines(textBox.value), cfg);
  const frag = document.createDocumentFragment();
  raw.forEach((text, i) => {
    if (i > 0) frag.append("\n");
    const r = records[i];
    if (r && r.lead) {
      // かっこ（ト書き）だけ灰色、後ろのセリフはそのまま
      const end = text.indexOf(r.lead) + r.lead.length;
      const span = document.createElement("span");
      span.className = KIND_CLASS.togaki;
      span.textContent = text.slice(0, end);
      return frag.append(span, text.slice(end));
    }
    const cls = kindClass(r);
    if (!cls) return frag.append(text);
    const span = document.createElement("span");
    span.className = cls;
    span.textContent = text;
    frag.append(span);
  });
  frag.append("\u200b"); // 最後が改行のとき、その次の行にも高さを持たせる
  hl.replaceChildren(frag);
  hl.scrollTop = textBox.scrollTop;
}

/** 全体の文字数と、見出し（トラック）ごとの文字数 */
function showCounts(res, togaki) {
  const total = document.createElement("span");
  total.className = "text-[15px] font-semibold tabular-nums";
  total.textContent = `全体 ${res.summary.total.toLocaleString()}文字`;
  status.replaceChildren(total);
  if (!togaki && !cfg.export.pdf.both) status.append("（設定の export.pdf.both が false なので、ト書きありだけ）");
  const warns = [];
  if (res.missing.length > 0) warns.push(`未登録の塊：${res.missing.join("、")}`);
  for (const issue of parser.checkRanges(res.records, cfg)) warns.push(`${issue.lnum}行目 ${issue.msg}`);
  for (const w of warns.slice(0, 5)) {
    const span = document.createElement("span");
    span.className = "text-amber-700 dark:text-amber-300";
    span.textContent = ` ／ ${w}`;
    status.append(span);
  }
  if (warns.length > 5) status.append(` ほか ${warns.length - 5}件`);

  const heads = res.records.filter((r) => r.kind === "見出し");
  const top = Math.min(...heads.map((r) => r.level));
  tracks.replaceChildren(...heads.map((r) => {
    const li = document.createElement("li");
    li.className = "flex justify-between gap-4 text-neutral-500 dark:text-neutral-400";
    if (r.level > top) li.classList.add("pl-4");
    const title = document.createElement("span");
    title.textContent = r.title;
    li.append(title);
    const n = res.summary.headings[r.lnum];
    if (n !== undefined) {
      const num = document.createElement("span");
      num.className = "text-neutral-900 tabular-nums dark:text-neutral-100";
      num.textContent = n.toLocaleString();
      li.append(num);
    }
    return li;
  }));
}

function update() {
  const togaki = document.querySelector('input[name="togaki"]:checked').value === "1";
  const lines = splitLines(textBox.value);
  const res = render(lines, cfg, { name: nameBox.value.trim() || "台本" });
  const out = res.outputs.find((o) => o.togaki === togaki) || res.outputs[0];
  const html = out.html.replace("</style>", `${SCREEN_CSS}\n</style>`);
  // スクロールの位置を残して差し替える
  const win = frame.contentWindow;
  const scroll = win ? [win.scrollX, win.scrollY] : [0, 0];
  frame.onload = () => frame.contentWindow.scrollTo(...scroll);
  frame.srcdoc = html;
  document.title = `${out.name} - 4iii`;
  paint();
  showCounts(res, togaki);
}

let timer;
function schedule() {
  clearTimeout(timer);
  timer = setTimeout(update, 150);
}

// 貼り付け：日本語入力のままの記号（／／ ＃ ｛｝ など）を、daihon で打ったときと同じに直す
textBox.addEventListener("paste", (ev) => {
  const pasted = ev.clipboardData && ev.clipboardData.getData("text/plain");
  if (!pasted) return;
  ev.preventDefault();
  const start = textBox.selectionStart;
  const lineStart = textBox.value.lastIndexOf("\n", start - 1) + 1;
  const before = textBox.value.slice(lineStart, start);
  const fixed = hankaku.normalizePaste(pasted, cfg, before);
  textBox.setRangeText(fixed, start, textBox.selectionEnd, "end");
  paint();
  schedule();
});

textBox.addEventListener("input", () => {
  paint(); // 字は後ろの層にしか見えないので、打つたびにすぐ書く
  schedule();
});
textBox.addEventListener("scroll", () => {
  hl.scrollTop = textBox.scrollTop;
});
nameBox.addEventListener("input", schedule);
configBox.addEventListener("input", () => {
  let next;
  try {
    next = JSON.parse(configBox.value.trim() || "{}");
  } catch (err) {
    $("config-error").textContent = `設定を読めません（前の設定のまま）：${err.message}`;
    return;
  }
  if (useProject(next, false)) schedule();
});
for (const el of Object.values(box)) el.addEventListener(el.type === "checkbox" ? "change" : "input", fromFields);
for (const radio of document.querySelectorAll('input[name="vertical"]')) radio.addEventListener("change", fromFields);
for (const radio of document.querySelectorAll('input[name="togaki"]')) radio.addEventListener("change", update);

// 設定の保存と読み込み：この PC のファイルとだけやりとりする（どこにも送らない）
$("save").addEventListener("click", () => {
  const url = URL.createObjectURL(new Blob([JSON.stringify(project, null, 2) + "\n"], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = "4iii.json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
$("open").addEventListener("change", async (ev) => {
  const file = ev.target.files[0];
  ev.target.value = "";
  if (!file) return;
  try {
    if (useProject(JSON.parse(await file.text()), true)) update();
  } catch (err) {
    $("config-error").textContent = `設定を読めません（前の設定のまま）：${err.message}`;
    configBox.closest("details").open = true;
  }
});

function printPreview() {
  const win = frame.contentWindow;
  if (!win) return;
  win.focus();
  win.print();
}
// Export：今は PDF だけ（テキスト・Markdown は選べないようにしてある）
const exportButton = $("export");
const exportMenu = $("export-menu");
exportMenu.addEventListener("beforetoggle", (ev) => {
  if (ev.newState !== "open") return;
  const r = exportButton.getBoundingClientRect();
  exportMenu.style.top = `${r.bottom + 8}px`;
  exportMenu.style.right = `${Math.max(8, innerWidth - r.right)}px`;
});
exportMenu.addEventListener("click", (ev) => {
  const item = ev.target.closest("button[data-format]");
  if (!item || item.disabled) return;
  exportMenu.hidePopover();
  if (item.dataset.format === "pdf") printPreview();
});
// ⌘P / Ctrl+P でも、ページではなくプレビューを印刷する
window.addEventListener("keydown", (ev) => {
  if ((ev.metaKey || ev.ctrlKey) && ev.key.toLowerCase() === "p") {
    ev.preventDefault();
    printPreview();
  }
});

// 台本はブラウザにも残さない。閉じる・読み直す前に確かめる
window.addEventListener("beforeunload", (ev) => {
  if (textBox.value.trim() !== "") ev.preventDefault();
});

useProject(project, true);
update();
