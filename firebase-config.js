// Firebase のウェブアプリ設定を貼り付けると「共有ルーム」が全員の端末をまたいで動きます。
// null のままだと「デモモード」（同じブラウザ内のタブ同士だけで動作）になります。
// 手順は README.md を参照してください。
window.FIREBASE_CONFIG = null;
/* 例:
window.FIREBASE_CONFIG = {
  apiKey: "...",
  authDomain: "xxx.firebaseapp.com",
  databaseURL: "https://xxx-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "xxx",
  appId: "..."
};
*/
