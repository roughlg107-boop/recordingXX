# RecordingXX

把業務拜訪店家的錄音檔，轉成企劃可直接接手的拜訪報告。

## 目前能力

- 上傳 `m4a / mp3 / wav` 錄音檔
- 每位使用者自行在瀏覽器填入 OpenAI API Key 與模型
- 產出單筆拜訪報告頁
- 下載 Word 報告
- 原始音檔處理完成後刪除
- 報告預設保留約 24 小時

## 技術組合

- Next.js 15
- Firebase App Hosting
- Cloud Firestore
- Cloud Storage
- OpenAI API

## 快速部署

如果你想盡量少手動操作，建議直接照這條跑：

### 1. 準備部署檔

```powershell
.\scripts\prepare-deploy.ps1 -ProjectId <YOUR_FIREBASE_PROJECT_ID> -BackendName recordingxx -RunChecks -InitGit
```

這一步會自動：

- 產生 `.env.local`
- 產生 `.firebaserc`
- 把 `apphosting.yaml` 寫成可部署版本
- 自動產生 `RATE_LIMIT_SALT`
- 順手驗證 `lint` 和 `build`
- 如果目前不是 git repo，就幫你初始化

### 2. 第一次推到 GitHub

```powershell
.\scripts\first-push.ps1 -RemoteUrl <YOUR_GITHUB_REPO_URL>
```

### 3. 登入 Firebase CLI

```powershell
.\scripts\firebase.ps1 login
```

這個 wrapper 會自動把 Firebase CLI 的設定檔改存到專案內，避免 Windows 權限問題。

### 4. 建立 App Hosting backend

```powershell
.\scripts\create-backend.ps1 -ProjectId <YOUR_FIREBASE_PROJECT_ID> -BackendName recordingxx
```

這一步大部分會自動跑，但 Firebase 仍可能要求你手動選：

- 連哪個 GitHub repo
- 用哪個 branch
- 關聯哪個 Firebase Web App

### 5. Firebase 給你正式網址後，回填 APP_BASE_URL

```powershell
.\scripts\set-app-base-url.ps1 -AppBaseUrl <YOUR_HOSTED_URL>
git add .
git commit -m "Set production App Base URL"
git push
```

### 6. 如果要手動補一次 rollout

```powershell
.\scripts\create-rollout.ps1 -ProjectId <YOUR_FIREBASE_PROJECT_ID> -BackendName recordingxx
```

## 本機啟動

1. 安裝依賴

```bash
npm install
```

2. 建立 `.env.local`

```env
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_STORAGE_BUCKET=your-project-id.firebasestorage.app
FIREBASE_DATABASE_ID=(default)
APP_BASE_URL=http://localhost:3000
UPLOAD_MAX_BYTES=104857600
UPLOAD_MAX_MINUTES=90
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=10
RATE_LIMIT_MAX_ACTIVE_JOBS=2
RATE_LIMIT_SALT=replace-this-with-a-random-secret
```

3. 如果本機不是透過 Google Cloud ADC 跑 Firebase Admin，另外補：

```env
FIREBASE_CLIENT_EMAIL=...
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

4. 啟動

```bash
npm run dev
```

## Firebase 設定

### 1. 建立專案與 App Hosting

- 在 Firebase 建立專案
- 啟用 Blaze 計費
- 建立 App Hosting backend
- 區域選 `asia-east1`
- 先使用 Firebase 提供的免費子網域

### 2. 啟用 Firestore 與 Storage

- 啟用 Cloud Firestore
- 啟用 Cloud Storage
- 將 `FIREBASE_STORAGE_BUCKET` 指到你的 bucket

### 3. 設定 Firestore TTL

對以下 collection 的 `expiresAt` 欄位設定 TTL：

- `visitReports`
- `rateLimitBuckets`
- `activeJobCounters`

注意：Firestore TTL 是到期後通常 24 小時內刪除，不是精準秒刪。應用程式本身也會在讀取時檢查是否已過期，所以過期連結會直接視為不存在。

### 4. App Hosting 環境變數

至少要配置：

- `FIREBASE_PROJECT_ID`
- `FIREBASE_STORAGE_BUCKET`
- `FIREBASE_DATABASE_ID`
- `APP_BASE_URL`
- `RATE_LIMIT_SALT`

## 使用流程

1. 使用者先到 `/settings`
2. 在本機瀏覽器輸入：
   - OpenAI API Key
   - 轉寫模型
   - 報告整理模型
3. 驗證成功後保存到本機
4. 回首頁填入：
   - 店家名稱
   - 業務姓名
   - 拜訪日期
   - 錄音檔
5. 系統建立報告並跳轉到單筆報告頁
6. 完成後可下載 Word

## API 介面

- `POST /api/provider/validate`
- `POST /api/uploads/init`
- `POST /api/reports`
- `GET /api/reports/:reportId/status`
- `GET /api/reports/:reportId/docx`

## 注意事項

- OpenAI API Key 不會被存到 Firestore 或 Storage
- 系統不做登入，因此只適合內部試行
- 目前的上傳流程會先由 Next.js 接收檔案，再寫入 Cloud Storage；適合小團隊 MVP，不適合大量高頻長音檔
- App Hosting backend 建立時，GitHub repo 連結與某些 Firebase 資源授權仍可能要你手動確認
