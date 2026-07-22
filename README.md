# ドンジャラNEO ラブライブ！ 待ち牌・点数チェッカー

既存の待ち牌・点数判定画面を維持しながら、役の追加・編集・ON/OFFを行えるようにした静的Webアプリです。
GitHub Pagesでそのまま公開できます。ビルド作業は不要です。

## 今回の主な変更

- 既存役と追加役を個別に計算対象ON/OFF可能
- カスタム加点役を作成可能
  - 選択牌すべて必須
  - 選択牌のうちN枚以上
- カスタム特殊役を作成可能
  - 異なる9牌の完全一致のみ
  - 基本役がなくても単独でアガリ成立
- 点数を30,000ジャラ単位に制限
- 成立し得ない加点役は保存せず、理由を表示
- 役設定をブラウザ内に保存
- 役設定のJSON書き出し・読み込み
- 既存役名の「セット」表記を廃止
- 以下のユニットを初期収録
  - チームこども：150,000ジャラ
  - チームスポーツ：150,000ジャラ
  - チームみどり：120,000ジャラ

## ファイル構成

```text
.
├── index.html
├── assets/
│   ├── css/
│   │   └── app.css
│   └── js/
│       ├── app.js
│       ├── data.js
│       ├── role-engine.js
│       └── role-store.js
├── tests/
│   └── role-engine.test.js
├── package.json
├── SPECIFICATION.md
├── CHANGELOG.md
└── TEST_RESULTS.md
```

## GitHubへ反映する手順

### 方法A：GitHubのWeb画面からアップロード

1. 対象リポジトリ `oraP-3/LdNEO_assistant` を開きます。
2. 念のため現在の状態を残したい場合は、先に新しいブランチを作成します。
   - ブランチ名例：`feature/custom-role-settings`
3. リポジトリのルートで **Add file → Upload files** を選択します。
4. このフォルダ内のファイルとフォルダを、構造を維持したままアップロードします。
5. 既存の `index.html` は今回の `index.html` で置き換えます。
6. コミットメッセージ例：

```text
Add extensible role settings and custom roles
```

7. ブランチへアップロードした場合はPull Requestを作成し、表示確認後に`main`へマージします。
8. GitHub Pagesの公開元が`main`ブランチのルートになっていれば、マージ後に自動反映されます。

### 方法B：GitHub Desktopを使用

1. GitHub Desktopで対象リポジトリをCloneします。
2. `feature/custom-role-settings`などの作業ブランチを作成します。
3. Cloneしたフォルダへ、この成果物のファイル一式を上書きコピーします。
4. GitHub DesktopのChangesで変更内容を確認します。
5. Summaryへコミット名を入力し、**Commit to feature/custom-role-settings**を押します。
6. **Push origin**を押します。
7. GitHub上でPull Requestを作成します。
8. 動作確認後、`main`へマージします。

## 公開後の確認

公開URLを開き、次を確認します。

1. 従来どおり牌を8枚・9枚入力できる
2. ヘッダーの「役設定」を開ける
3. 既存役をOFFにすると現在の手牌が即時再計算される
4. カスタム役を追加できる
5. ページを再読み込みしても役設定が保持される
6. チームこども、チームスポーツ、チームみどりがユニット欄に表示される

反映直後に旧画面が表示される場合は、ブラウザの再読み込みまたはキャッシュ削除を行ってください。iPhoneではSafariのタブを閉じて開き直す方法も有効です。

## ローカル確認

ES Modulesを使用しているため、`index.html`を直接ダブルクリックするのではなく、簡易Webサーバー経由で開きます。

Pythonがある場合：

```bash
python3 -m http.server 8000
```

その後、ブラウザで次を開きます。

```text
http://localhost:8000/
```

## 自動テスト

Node.jsがある環境で実行します。

```bash
npm test
```

外部パッケージのインストールは不要です。Node.js標準のテスト機能だけを使用しています。

## 設定データ

役設定はブラウザの`localStorage`へ保存されます。

```text
ldneo.roleSettings.v1
```

「全クリア」は手牌・場見え牌・思想だけを消去します。役設定は消去しません。
役設定を消去する場合は、役設定画面の「役設定を初期化」を使用します。

## 注意事項

- 役設定は端末・ブラウザごとに保存されます。
- 別端末へ移す場合は、役設定画面のJSON書き出し・読み込みを使用します。
- Tailwind CSSは従来どおりCDNから読み込みます。完全オフラインでは装飾が適用されません。
