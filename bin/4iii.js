#!/usr/bin/env node
// 台本の .txt から、縦書きの HTML（ト書きあり／なし）を作り、vivliostyle があれば PDF も作る
// 使い方：4iii.js 台本.txt [--config 4iii.json] [--out out/] [--no-pdf]
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join, basename, extname, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { makeConfig, render, splitLines, validPartName } from "../src/index.js";
import { stripGlobalOnly } from "../src/config.js";

const PDF_TIMEOUT_MS = 5 * 60 * 1000; // PDF 1つにかける時間の上限

const USAGE = `使い方：4iii.js 台本.txt [--config 4iii.json] [--out out/] [--no-pdf]
  --config  設定（daihon.lua の opts と同じ意味の JSON）。無ければ台本と同じフォルダの 4iii.json（無ければ daihon.json）
  --out     書き出し先。無ければ設定の export.dir（既定 out）
  --no-pdf  HTML だけ作る`;

function parseArgs(argv) {
  const args = { pdf: true };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--config" || a === "--out") {
      if (i + 1 >= argv.length) throw new Error(`${a} のあとに場所が要ります`);
      args[a.slice(2)] = argv[++i];
    } else if (a === "--no-pdf") {
      args.pdf = false;
    } else if (a === "-h" || a === "--help") {
      args.help = true;
    } else if (a.startsWith("-")) {
      throw new Error(`知らないオプションです：${a}`);
    } else if (args.script) {
      throw new Error("台本は1つだけ渡してください");
    } else {
      args.script = a;
    }
  }
  return args;
}

const readText = (path) => readFileSync(path, "utf8");

function findConfig(dir) {
  const names = ["4iii.json", "daihon.json"];
  return join(dir, names.find((n) => existsSync(join(dir, n))) ?? names[0]);
}

function main(argv) {
  const args = parseArgs(argv);
  if (args.help || !args.script) {
    console.log(USAGE);
    return args.help ? 0 : 1;
  }
  const script = resolve(args.script);
  if (!existsSync(script)) throw new Error(`台本が見つかりません：${args.script}`);

  // 設定。作品フォルダ（parts/・out/ の基準）は設定ファイルのある所、無ければ台本のある所
  // 名前を決める前の daihon.json も読む（nvim の daihon と同じ設定を使い回せる）
  const configPath = args.config ? resolve(args.config) : findConfig(dirname(script));
  let project = {};
  if (existsSync(configPath)) {
    project = JSON.parse(readText(configPath));
    const removed = stripGlobalOnly(project);
    if (removed.length > 0) console.warn(`4iii: ${removed.join("、")} は使いません（PDF は vivliostyle で作ります）`);
  } else if (args.config) {
    throw new Error(`設定が見つかりません：${args.config}`);
  }
  const root = existsSync(configPath) ? dirname(configPath) : dirname(script);
  const cfg = makeConfig(project);
  const pdf = cfg.export.pdf;

  const getPart = (name) => {
    if (!validPartName(name)) return undefined;
    const path = join(root, cfg.parts_dir, `${name}.txt`);
    return existsSync(path) ? splitLines(readText(path)) : undefined;
  };
  let css;
  if (pdf.css) {
    const path = join(root, pdf.css);
    if (!existsSync(path)) throw new Error(`CSS が見つかりません：${path}`);
    css = splitLines(readText(path)).join("\n");
  }

  const outDir = args.out ? resolve(args.out) : join(root, cfg.export.dir);
  mkdirSync(outDir, { recursive: true });
  const name = basename(script, extname(script));
  const { outputs, missing } = render(readText(script), cfg, { name, getPart, css });

  const show = (p) => {
    const rel = relative(process.cwd(), p);
    return rel && !rel.startsWith("..") ? rel : p;
  };
  const htmlPaths = outputs.map((o) => {
    const path = join(outDir, `${o.name}.html`);
    writeFileSync(path, o.html);
    console.log(`4iii: 書き出しました：${show(path)}`);
    return { name: o.name, html: path, pdf: join(outDir, `${o.name}.pdf`) };
  });
  if (missing.length > 0) console.warn(`4iii: 未登録の塊はそのまま出しました：${missing.join("、")}`);
  if (!args.pdf) return 0;

  // PDF は1つずつ作る（同時に作ると Vivliostyle がぶつかる）
  let code = 0;
  for (const job of htmlPaths) {
    const res = spawnSync("vivliostyle", ["build", job.html, "-o", job.pdf], {
      cwd: outDir,
      encoding: "utf8",
      timeout: PDF_TIMEOUT_MS,
    });
    if (res.error && res.error.code === "ENOENT") {
      console.log("4iii: vivliostyle が無いので HTML だけ作りました（PDF には npm install -g @vivliostyle/cli）");
      return 0;
    }
    if (res.status === 0) {
      console.log(`4iii: PDF ができました：${show(job.pdf)}`);
    } else {
      const why = res.error ? res.error.message : `${res.stderr || ""}${res.stdout || ""}`.trim().slice(-800);
      console.error(`4iii: PDF を作れませんでした（${job.name}）\n${why}`);
      code = 1;
    }
  }
  return code;
}

try {
  process.exitCode = main(process.argv.slice(2));
} catch (err) {
  console.error(`4iii: ${err.message}`);
  process.exitCode = 1;
}
