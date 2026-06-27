# ERD Layout Pilot: リポジトリ切り出し手順

このガイドは、`tools/erd-layout-vscode-extension` を別 GitHub リポジトリとして管理するための手順です。

## 前提

- GitHub CLI (`gh`) が利用可能
- GitHub 上で作成したいリポジトリ名を決めている
- 例では `<OWNER>` と `<NEW_REPO>` を使用

---

## パターンA: 履歴なしで新規公開 (最短)

この方法は新規リポジトリとして最も簡単です。

```bash
# 1) 作業用ディレクトリに移動
cd /home/takeshi/eagle/tools/erd-layout-vscode-extension

# 2) 新しい Git リポジトリを初期化
rm -rf .git
git init
git branch -M main

# 3) 初回コミット
git add .
git commit -m "Initial commit: ERD Layout Pilot"

# 4) GitHub リポジトリ作成と push
# private にしたい場合は --private
# public にしたい場合は --public
gh repo create <OWNER>/<NEW_REPO> --private --source=. --remote=origin --push
```

---

## パターンB: 履歴ありで切り出し (subtree split)

Eagle の履歴のうち、対象フォルダに関係する履歴だけを持っていきたい場合に使います。

```bash
# 1) Eagle ルートに移動
cd /home/takeshi/eagle

# 2) 対象パスだけの履歴ブランチを作成
git subtree split --prefix=tools/erd-layout-vscode-extension -b erd-layout-pilot-split

# 3) 一時クローンを作成して push
git clone /home/takeshi/eagle /tmp/erd-layout-pilot-split
cd /tmp/erd-layout-pilot-split
git checkout erd-layout-pilot-split

# 4) 新規リポジトリを作って push
gh repo create <OWNER>/<NEW_REPO> --private --source=. --remote=origin
git push -u origin erd-layout-pilot-split:main

# 5) 元リポジトリ側の一時ブランチを削除
cd /home/takeshi/eagle
git branch -D erd-layout-pilot-split
```

---

## 推奨

- 初回はパターンA (履歴なし) を推奨
- 理由: 管理がシンプルで、拡張の公開・CI・権限設計を独立しやすい

## 切り出し後の確認

```bash
cd /home/takeshi/eagle/tools/erd-layout-vscode-extension
npm ci
npm run check
npm run build
npm run package:vsix
```

## Eagle 側との連携

- Eagle では設定値 `erdLayout.filePath` だけ合わせれば利用可能
- 将来、Eagle 側に固定導入したい場合は次のいずれか
  - Git submodule で取り込む
  - Releases から VSIX を配布してインストールする
