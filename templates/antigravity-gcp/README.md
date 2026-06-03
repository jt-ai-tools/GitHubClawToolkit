# Antigravity GCP Template

這個範本會在 GitHub Actions 中執行 Antigravity CLI（`agy`），並沿用小龍蝦既有流程：

1. 讀取 `artifacts/{user_comment_id}/user.md` 當任務輸入
2. 執行 AGY 任務
3. 將輸出寫回 `artifacts/{comment_id}/result.md`
4. 推送到 `issue-{number}` 分支並更新 issue comment

## 必要設定

### GitHub Secret

- `AGY_OAUTH_CREDS_JSON`
  - 內容為本機 `agy` 登入後產生的 `~/.gemini/oauth_creds.json` 全文
  - 必須包含 `refresh_token`，workflow 會在 runner 還原成 `~/.gemini/oauth_creds.json`

### 可選 GitHub Variables

- `AGY_MODEL`（預設：`gemini-2.5-flash`）
- `AGY_PRINT_TIMEOUT`（預設：`20m`）

## GCP 前置建議（學員版）

1. 使用可用 GCP 試用額度的 Google 帳號在本機先完成 `agy` 登入
2. 確認本機存在 `~/.gemini/oauth_creds.json` 且含 `refresh_token`
3. 將該 JSON 全文存成 repo secret：`AGY_OAUTH_CREDS_JSON`
4. 視需求設定 `AGY_MODEL`

## 安全提醒

- 不要把 `oauth_creds.json` 直接提交到 repo。
- `AGY_OAUTH_CREDS_JSON` 具有高權限，建議只放在 GitHub Secrets。
- 若帳號撤銷授權或 token 失效，需在本機重新 `agy` 登入並更新 secret。

## 常見錯誤

- `Authentication required` / `authentication timed out`
  - 代表 AGY 未吃到有效認證，請先確認 `AGY_OAUTH_CREDS_JSON` 是否正確且未過期/撤銷。
- `AGY_OAUTH_CREDS_JSON must include refresh_token`
  - 代表 secret 內容不是完整的 `oauth_creds.json`。
- `COMMENT_ID or USER_COMMENT_ID is missing`
  - 代表觸發 payload 缺少必要欄位。
- `Missing user prompt file`
  - 代表 `artifacts/{user_comment_id}/user.md` 尚未生成或路徑不一致。
