# Antigravity GCP Template

這個範本會在 GitHub Actions 中執行 Antigravity CLI（`agy`），並沿用小龍蝦既有流程：

1. 讀取 `artifacts/{user_comment_id}/user.md` 當任務輸入
2. 執行 AGY 任務
3. 將輸出寫回 `artifacts/{comment_id}/result.md`
4. 推送到 `issue-{number}` 分支並更新 issue comment

## 必要設定

### GitHub Secret

- `AGY_GCP_SA_KEY_JSON`
  - 內容為 GCP Service Account JSON（金鑰全文）
  - workflow 會用 `google-github-actions/auth@v2` 載入憑證

### 可選 GitHub Variables

- `AGY_MODEL`（預設：`gemini-2.5-flash`）
- `AGY_PRINT_TIMEOUT`（預設：`20m`）

## GCP 前置建議（學員版）

1. 建立可用的 GCP 專案（可使用試用額度）
2. 建立 service account 並下載 JSON key
3. 把 JSON key 存成 repo secret：`AGY_GCP_SA_KEY_JSON`
4. 視需求設定 `AGY_MODEL`

## 常見錯誤

- `Authentication required` / `authentication timed out`
  - 代表 AGY 未吃到有效認證，請先確認 `AGY_GCP_SA_KEY_JSON` 是否正確。
- `COMMENT_ID or USER_COMMENT_ID is missing`
  - 代表觸發 payload 缺少必要欄位。
- `Missing user prompt file`
  - 代表 `artifacts/{user_comment_id}/user.md` 尚未生成或路徑不一致。
