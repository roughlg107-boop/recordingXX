# Firebase 錄音轉拜訪報告系統

這個專案是手機優先的 Firebase 網站，讓業務上傳拜訪錄音後，自動產出可編修的客戶拜訪報告，並依固定 Word 模板匯出 `.docx`。

## 架構

- `app/`: React + Vite 前端
- `functions/`: Firebase Functions v2 後端
- `functions/assets/analysis-report-template.docx`: 固定匯出模板

## 主要流程

1. 業務以 Email/密碼登入。
2. 前端建立報告草稿後，直接把錄音 POST 到 Firebase Functions。
3. Functions 直接處理音檔:
   - 轉檔壓縮音訊
   - 依目前設定的 OpenAI 或 Gemini provider 進行轉錄
   - 以結構化 JSON 產生 `訪談記錄` 與 `待確認` 項目
4. 業務在網站補齊非 AI 欄位、確認待確認項目後，直接由後端回傳 Word 下載。
5. 排程函式在 24 小時後刪除逐字稿與報告資料。

## 環境變數

### `app/.env.local`

```bash
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
VITE_FIREBASE_FUNCTIONS_REGION=asia-east1
```

### `functions/.env.local`

Firebase Functions v2 會自動讀取 `functions/.env*`。

```bash
OPENAI_API_KEY=
GEMINI_API_KEY=
OPENAI_TRANSCRIBE_MODEL=gpt-4o-transcribe
OPENAI_SUMMARIZE_MODEL=gpt-4o
GEMINI_TRANSCRIBE_MODEL=gemini-2.5-flash
GEMINI_SUMMARIZE_MODEL=gemini-2.5-flash
SETTINGS_ENCRYPTION_KEY=
OPENAI_TRANSCRIBE_COST_PER_MINUTE_USD=0.006
OPENAI_SUMMARIZE_INPUT_COST_PER_MILLION=2.5
OPENAI_SUMMARIZE_OUTPUT_COST_PER_MILLION=10
GEMINI_TRANSCRIBE_INPUT_COST_PER_MILLION=0.3
GEMINI_TRANSCRIBE_OUTPUT_COST_PER_MILLION=2.5
GEMINI_SUMMARIZE_INPUT_COST_PER_MILLION=0.3
GEMINI_SUMMARIZE_OUTPUT_COST_PER_MILLION=2.5
BOOTSTRAP_ADMIN_SECRET=19mP4lJjHYHTm0ytphcb58h9OnVoGFDRVhABJ9pW
```

若你希望改由網站設定視窗儲存 provider API key，必須額外提供 `SETTINGS_ENCRYPTION_KEY`，後端會用它加密保存 key。
成本欄位屬於估算值，現在已改成依 provider 分開計算；若之後模型價格調整，直接更新上述參數即可。
由於已取消 Firebase Storage，錄音改走 Functions 直接上傳，建議單檔控制在 28MB 內。

## 開發

```bash
npm install
npm run build
```

若要使用 Firebase CLI，建議執行前暫時指定可寫入的設定目錄:

```bash
$env:XDG_CONFIG_HOME="$PWD\\.tmp-config"
$env:HOME="$PWD\\.tmp-home"
firebase use --add
```

## 首位管理者

部署後可呼叫 `bootstrapAdmin` HTTP Function 建立第一位管理者，需提供 `BOOTSTRAP_ADMIN_SECRET`。
