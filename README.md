# English Card Studio - Supabase Version

這是正式網站版本的起點，原本外層的純前端模板已保留不動。

## 目前功能

- Supabase Email/Password 註冊與登入。
- 每個帳號只會看到自己的組別、單字卡、最愛和看過次數。
- 首頁顯示組別和最愛單字列表。
- 可新增、刪除組別。
- 可新增、刪除單字卡。
- 單字卡可加入或移出最愛。
- `下一張` 會優先顯示看過次數少、且最近 20 張沒有出現過的單字。
- `最早看過` 會優先顯示最久以前看過的單字。
- 發音按鈕使用瀏覽器內建英文語音。
- `查詢單字` 會自動帶入中文意思和英文例句；解釋和補充筆記可自行選填。

## 設定 Supabase

1. 到 Supabase 建立新專案。
2. 打開 Supabase SQL Editor。
3. 執行 `supabase/schema.sql` 的全部內容。
4. 複製 `.env.example` 成 `.env.local`。
5. 填入：

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-supabase-publishable-or-anon-key
```

查詢單字使用免金鑰的字典與翻譯 API。免費翻譯結果可能不一定完全準確，儲存前可以自己修改。

## 本機開發

```bash
pnpm install
pnpm dev
```

## 部署到 Vercel

1. 把 `supabase-version` 這個資料夾推到 GitHub。
2. 在 Vercel 匯入專案。
3. 到 Vercel Project Settings 設定 Supabase 環境變數。
4. 部署後就可以用 Vercel 網址或自己的網域打開。

## 下一步

- 加入批次匯入單字。
- 加入編輯既有單字卡。
- 加入匯入/匯出單字卡。
