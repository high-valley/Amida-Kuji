# あみだくじ

静的サイト（GitHub Pages）で動くあみだくじです。

- **1台で使う**: 設定不要。人数と結果の数は別々に指定できます（例：10人・結果12個）。
- **みんなで使う（共有ルーム）**: 主催者が人数と結果を設定してリンクをコピーして共有 →
  参加者が各自の端末で名前を入力 → 主催者が「結果を公開する」を押すと全員の画面に結果が表示されます。
  結果は公開前は主催者にしか読めません。

共有ルームには Firebase Realtime Database が必要です（無料枠で足ります）。
`firebase-config.js` が `null` のままだと「デモモード」（同じブラウザ内のタブ同士のみ）で動きます。

## Firebase のセットアップ

1. [Firebase コンソール](https://console.firebase.google.com/) でプロジェクトを作成
2. **Authentication → Sign-in method → 匿名** を有効化
3. **Realtime Database** を作成し、**ルール** に `database.rules.json` の内容を貼って公開
4. **プロジェクトの設定 → マイアプリ → ウェブアプリ** を追加し、表示された設定値を `firebase-config.js` の `window.FIREBASE_CONFIG` に貼る
   （`databaseURL` も必要です）
5. **Authentication → Settings → 承認済みドメイン** に `high-valley.github.io` を追加（通常は最初から許可されています）

Firebase の設定値（apiKey など）は公開されても問題ない値で、アクセス制御は `database.rules.json` が担います。

## 注意

- 参加人数の上限は画面側でのみ制限しています（Firebase のルールには要素数を数える機能がないため）。
- 線の選択は、先に取った人だけが書き込めるルール（`slots`）で取り合いを防いでいます。
