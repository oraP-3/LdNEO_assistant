# テスト結果

## 自動テスト

実行コマンド：`npm test`

```text

> ldneo-assistant@2.0.0 test
> node --test

TAP version 13
# Subtest: 既存役名に「セット」を自動付与しない
ok 1 - 既存役名に「セット」を自動付与しない
  ---
  duration_ms: 0.882438
  type: 'test'
  ...
# Subtest: 指定された3つのチームをユニット役として収録する
ok 2 - 指定された3つのチームをユニット役として収録する
  ---
  duration_ms: 0.150884
  type: 'test'
  ...
# Subtest: チームこどもがLiella!のアガリ手で加点される
ok 3 - チームこどもがLiella!のアガリ手で加点される
  ---
  duration_ms: 0.74165
  type: 'test'
  ...
# Subtest: チームスポーツがLiella!のアガリ手で加点される
ok 4 - チームスポーツがLiella!のアガリ手で加点される
  ---
  duration_ms: 0.274366
  type: 'test'
  ...
# Subtest: チームみどりがLiella!のアガリ手で加点される
ok 5 - チームみどりがLiella!のアガリ手で加点される
  ---
  duration_ms: 0.301837
  type: 'test'
  ...
# Subtest: 役をOFFにすると成立役と点数から除外される
ok 6 - 役をOFFにすると成立役と点数から除外される
  ---
  duration_ms: 0.29011
  type: 'test'
  ...
# Subtest: ALL STARSは基本役なしでもアガリになる
ok 7 - ALL STARSは基本役なしでもアガリになる
  ---
  duration_ms: 0.294857
  type: 'test'
  ...
# Subtest: 緑一色は候補10牌のうち9牌で成立する
ok 8 - 緑一色は候補10牌のうち9牌で成立する
  ---
  duration_ms: 0.22272
  type: 'test'
  ...
# Subtest: カスタム特殊役は指定9枚の完全一致で単独アガリになる
ok 9 - カスタム特殊役は指定9枚の完全一致で単独アガリになる
  ---
  duration_ms: 0.802029
  type: 'test'
  ...
# Subtest: カスタム特殊役は8枚一致と指定外1枚では成立しない
ok 10 - カスタム特殊役は8枚一致と指定外1枚では成立しない
  ---
  duration_ms: 0.550085
  type: 'test'
  ...
# Subtest: カスタム特殊役の8枚から残り1枚を待ち牌として検出する
ok 11 - カスタム特殊役の8枚から残り1枚を待ち牌として検出する
  ---
  duration_ms: 5.559281
  type: 'test'
  ...
# Subtest: 点数は30,000ジャラ単位のみ保存可能
ok 12 - 点数は30,000ジャラ単位のみ保存可能
  ---
  duration_ms: 0.895308
  type: 'test'
  ...
# Subtest: 4シリーズ以上が必須となる加点役は保存できない
ok 13 - 4シリーズ以上が必須となる加点役は保存できない
  ---
  duration_ms: 0.39129
  type: 'test'
  ...
# Subtest: 3シリーズでも4・4・1固定では基本役を作れず保存できない
ok 14 - 3シリーズでも4・4・1固定では基本役を作れず保存できない
  ---
  duration_ms: 0.46546
  type: 'test'
  ...
# Subtest: 3シリーズに3枚ずつ固定された加点役は保存可能
ok 15 - 3シリーズに3枚ずつ固定された加点役は保存可能
  ---
  duration_ms: 0.177724
  type: 'test'
  ...
# Subtest: 候補が4シリーズでも3枚以上条件が3シリーズ以内で成立すれば保存可能
ok 16 - 候補が4シリーズでも3枚以上条件が3シリーズ以内で成立すれば保存可能
  ---
  duration_ms: 1.851755
  type: 'test'
  ...
# Subtest: 同じ9枚のカスタム特殊役は重複登録できない
ok 17 - 同じ9枚のカスタム特殊役は重複登録できない
  ---
  duration_ms: 0.130003
  type: 'test'
  ...
1..17
# tests 17
# suites 0
# pass 17
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 74.078202
```

## 旧ロジックとの回帰比較

50,000 random hands matched legacy scoring and agari behavior.

指定の3ユニットは新規追加分のため比較対象から除外し、それ以外の既存役についてアガリ可否と合計点を比較しました。
