// 人からもらった設定（4iii.json）に悪い文が入っていても、書き出す HTML にタグや属性を入れられない
import { test } from "node:test";
import assert from "node:assert/strict";
import { makeConfig, render } from "../src/index.js";

test("設定の CSS の値・種類の名前・class から HTML に抜け出せない", () => {
  const cfg = makeConfig({
    export: { pdf: { font: 'serif;}</style><img src=x onerror=alert(1)><style>', size: "A4</style><script>x()</script>", margin: "1mm{}" } },
    line_types: [
      { name: '"><img src=x>', prefix: "!" },
      { name: "指示", prefix: "//", class: 'a" onmouseover="alert(1)' },
    ],
  });
  const html = render("!あ\n// い\nう\n", cfg, { css: "p{}</style><script>bad()</script>" }).outputs[0].html;
  assert.equal((html.match(/<\/style>/gi) || []).length, 1); // <style> を閉じるのは1回だけ（中から抜け出せない）
  // <style> の中は CSS の字として読まれるだけなので、その外にタグや属性ができていないかを見る
  const outside = html.replace(/<style>[\s\S]*<\/style>/i, "");
  assert.doesNotMatch(outside, /<img|<script|onmouseover="/i);
  assert.match(html, /class="a__onmouseover__alert_1_"/);
});
