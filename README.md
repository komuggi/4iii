# 4iii

音声作品の台本（.txt）を、縦書きの HTML（ト書きあり／なし）にして PDF にします。セリフだけの文字数も数えます。
書き方・設定・出てくる HTML は、nvim のプラグイン [daihon](https://github.com/komuggi/daihon) と同じです（元は daihon の「台本 → 縦書きの HTML」の所を、nvim なしで動くようにした物。ルビは 4iii にしかありません）。

## ページ（Google ドキュメントから貼って PDF に）

```sh
python3 -m http.server   # このフォルダで打つ
```

ブラウザで http://localhost:8000/web/ を開き、左に台本を貼ります。右に縦書きで出ます。

- 上の枠に、行の頭に付けている記号を打ちます（、で区切る）
  - **SE**・**コメント・演技指示**：文字数に入れず、「ト書きあり」の PDF にだけ出します
  - **その他**：セリフにしない行。PDF に出すか出さないかを選べます
  - どれにも当たらない行がセリフで、文字数はセリフだけを数えます
- 「縦書き／横書き」「ト書きあり／なし」で切り替え、右上の「Export」→「PDF」→ 印刷の画面で「PDF に保存」（テキスト・Markdown は今は選べません）
- ルビ：`|漢字《かんじ》`・`漢字《かんじ》`（| が無いときは《 の前に続く漢字）・`[[rb:漢字 > かんじ]]`（pixiv）を読みます。記号は「ルビの書き方」で変えられます。ルビの字は文字数に入れません
- 「この設定で保存」で、記号などの設定を `4iii.json` としてこの PC に落とします。次からは「設定を開く」で選びます（ログインは要りません。CLI もそのまま読めます）
- 貼るとき、日本語入力のままの記号（行の頭の `／／` `＃` `（` `￥`、`｛｝` など）は daihon で打ったときと同じに半角にします
- 行の頭がその記号で始まる行を、その種類にします（行の頭の空白は見ません）。どれにも当たらない行は、記号で始まっていてもセリフです
- 見出し（トラック）の欄の記号で始まる行で、PDF のページが変わり、トラックごとの文字数を出します。`##` のような記号は頭を消し、`トラック` のような字は「トラック①」のまま見出しにします
- 設定は「設定」の欄に 4iii.json の形で書きます
- ページは塊（`{名前}`・`{{ }}`）を読みません。`{ }` は字のまま PDF に出し、文字数にも入れます（`{@文字数一覧}` だけは読みます）
- 貼った台本は、どこにも送らず保存もしません（閉じると消えます）

### 台本を受け取らない・覚えない

- ページは外と通信しません。`web/index.html` の CSP（`default-src 'none'`）で、ブラウザが外への通信を全部止めます。開発者ツールの「ネットワーク」で確かめられます
- ブラウザの保存（localStorage・cookie など）も使いません
- 作った人が台本を見ることも、AI の学習に使うこともできません（届かないので）

### 見た目を直す

ページの見た目は Tailwind で作ります。`web/index.html`・`web/app.js` の class か `styles/app.css` を直したら、作り直します（作った `web/style.css` もコミットする）。

```sh
npm install   # はじめの1回
npm run css
```

## CLI

```sh
node bin/4iii.js 台本.txt [--config 4iii.json] [--out out/] [--no-pdf]
```

ト書きあり／なしの HTML を書き、`vivliostyle` があれば PDF も作ります（無ければ HTML だけ）。
`--config` が無ければ、台本と同じフォルダの `4iii.json`（無ければ `daihon.json`）を読みます。CLI は塊を読みます（設定のあるフォルダの `parts/` から。読まないなら設定に `"blocks": false`）。

## 設定（4iii.json）

daihon の `daihon.lua` と同じ意味・同じ既定値を JSON で書きます。例：`test/fixtures/sample/daihon.json`。
nvim の画面だけの設定（keys・show_count など）は読んでも使いません。`export.pdf.command` は使いません。

## 部品として使う

```js
import { makeConfig, render } from "./src/index.js";
const { outputs, missing } = render(text, makeConfig({ mode: "multi" }), { name: "台本", getPart });
// outputs = [{ name: "台本_ト書きあり", togaki: true, html }, { name: "台本_ト書きなし", ... }]
```

## テスト

```sh
node --test
```

`test/fixtures/` の HTML は、元の daihon（Lua）が作った物です（`test/make_expected.lua`・daihon のコミットは `DAIHON_COMMIT`）。daihon を直したら作り直して、ここも同じ結果になるかを確かめます。

```sh
nvim --headless -l test/make_expected.lua ~/tools/daihon test/fixtures/*/
```
