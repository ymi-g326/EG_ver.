# EARTH GROOVE NUCC V2

このフォルダは EARTH_GROOVE_NUCC から派生したV2の独立した作業フォルダ。
現行版 ../EARTH_GROOVE_NUCC と既存版 ../EARTH_RECORD_v0.1 を変更しない。
メインは地球儀の再生画面。INSPECTは同じ演奏を維持した詳細画面。
AMBIENT / GROOVE はV2独自の鳴らし方。地球の回転とスクラッチを同じ操作にする。LIVEの衛星位置と、EXPLOREで任意に選んだ演奏地点を区別する。
SCRATCHはアプリの直前約2秒の音声をメモリ内で保持して前後再生する。非対応環境では合成音プレビュー。マイクは使用しない。

- 制作・開発はこのフォルダ内で行う。
- `../EARTH_RECORD_v0.1` は既存のEarth Groove。本チャットの指示に従い、既存版への書き込み・push・デプロイを行わない。
- この複製は元のGitリモート、Vercel接続、Cloudflare接続を引き継いでいない。公開する際はNUCC版用の別プロジェクトを使用する。
- Claude側の会社システム、設定、引き継ぎ、案件記録を自動参照・更新しない。
- てんこう2の対象は `TEN-KOH 2 / NORAD 68261`。ISSやHTV-Xの軌道にフォールバックしない。
- 実際の衛星からの直接受信と、軌道からの位置推定・地表画像・気象モデル・地上生成音楽を区別する。
- 元の世界地図、レコードの比喩、暗い背景、黄緑・シアン、自然音とシンセ、音の軌跡を制作の出発点とする。

実行: `pnpm dev`（開発用ON/OFF管理: http://127.0.0.1:3201、NUCC版: http://127.0.0.1:3200）。
管理サーバーは自分が起動したNUCC版のみ操作する。既存版や別のプロセスをポート番号だけで停止しない。
確認: `pnpm typecheck`、`pnpm test`、`pnpm build`。

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

2026-11-04 音量と操作を改良：自然音の初期音量45%（従来比−6.9 dB）、SETTINGSで0–100%調整。スクラッチ中は通常音を抑え、手を離す／入力が220ms途絶えると滑らかに復帰。

2026-11-04 地球儀の操作を統合：ドラッグで地球儀を回しながらスクラッチ。専用SCRATCHモードは廃止。
「ここを聴く」で地球儀の中央の任意地点をEXPLOREとして選ぶ。衛星位置・軌道は移動しない。
EXPLOREは選択地点のNASA観測画像を解析し、地表モデル気象・起伏を取得する。地表を先に適用し、気象・起伏は取得後に適用。欠測は欠測として表示する。
選択地点のデータは衛星LIVE側から分離する。LIVEで衛星の現在位置へ戻る。LOCALは従来の合成シャッフルで地理選択は行わない。

2026-11-05 スクラッチを連続する読み取り位置・符号付き速度で動かす方式へ更新。手の動きが止まると音も止まり、慣性が弱まると完全停止前から通常演奏へ約0.68秒の目安で復帰する。作曲用BPMは変えない。
