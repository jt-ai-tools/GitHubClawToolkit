# LineWorker

LINE webhook worker 的核心程式。收到 LINE 事件後，會把對話留言到指定的 GitHub issue；如果沒有固定 `ISSUE_NUMBER`，就會依 LINE source 自動找或建立唯一 issue，並把媒體檔存到該 issue 專屬 branch。

## 功能

- 驗證 `X-Line-Signature`
- 可固定綁定單一 GitHub issue，或依 LINE source 自動綁定唯一 issue
- 所有 LINE 事件都留言到綁定 issue，並清楚標示 `group` / `room` / `user` 來源
- 支援 `follow`、`join`、`text`、`image`、`audio`、`video`、`file`
- 圖片與影片在 issue / comment 內直接顯示預覽
- `sticker` 事件直接忽略
- 如果設定了 `LINE_DEFAULT_REPLY_MESSAGE`，會直接用 reply token 回一則固定訊息
- `GET /status` 可查看這支 Worker 目前綁定的 GitHub issue

## 結構

```text
LineWorker/
├── scripts/
├── src/
│   ├── application/     use case / orchestration
│   ├── domain/          純規則與格式化
│   ├── infrastructure/  LINE / GitHub / config adapters
│   └── presentation/    HTTP entrypoint
├── test/
├── wrangler.jsonc
└── package.json
```

## Build 與測試

```sh
cd workers/line-bot
bun install
bun run build
bun run dev
bun run set
bun run deploy
bun run test
```

- `bun run build` 會把 `src/index.js` bundle 成 `dist/index.mjs`
- `bun run dev` / `bun run deploy` 都會直接使用 `wrangler.jsonc`
- `bun run set` 會直接把 `.dev.vars` 用 `wrangler secret bulk` 寫進目前這支 Worker
- `bun run test` 或 `node --test` 都可以直接執行 worker 邏輯測試

這個資料夾現在只保留最基本的 Cloudflare Worker 部署設定；執行時需要的環境值不再寫在 `wrangler.jsonc`。

## 必要環境變數

- `GH_TOKEN`
- `GH_OWNER`
- `GH_REPO`
- `LINE_CHANNEL_SECRET`
- `LINE_CHANNEL_ACCESS_TOKEN`

可選：

- `LINE_WORKER_NAME`
- `ISSUE_NUMBER`
- `LINE_ASSISTANT_UTC_OFFSET`
- `LINE_DEFAULT_REPLY_MESSAGE`
- `GH_API_BASE_URL`
- `GH_API_VERSION`
- `LINE_API_BASE_URL`
- `LINE_DATA_API_BASE_URL`
- `LINE_WEBHOOK_PATH`
- `USER_AGENT`

補充：

- 本地開發請把值放在 `.dev.vars`
- 部署到 Cloudflare 時可直接執行 `bun run set`
- `wrangler.jsonc` 的 `vars` 目前只保留這些固定 API / webhook 預設值
- webhook 路徑固定是 `/line/webhook`
- `GH_TOKEN` 需要 `Issues: read/write` 與 `Contents: read/write`
- `ISSUE_NUMBER` 有值時會固定留言到該 issue；沒有值時會依 `user` / `group` / `room` source 自動找或建立唯一 issue
- `LINE_WORKER_NAME` 只用於 comment metadata 與 `/status` 顯示，方便辨識是哪一支 Worker
- `LINE_DEFAULT_REPLY_MESSAGE` 會在事件可使用 reply token 時直接回覆一則固定訊息

## 輸出入口

Worker 入口是 `src/index.js`，預設 export 仍然是 worker handler：

```js
import worker from './src/index.js';

const response = await worker.fetch(request, env, ctx);
```

可用路徑：

- `POST /line/webhook`
- `GET /health`
- `GET /status`

## 媒體存放

- 每個綁定的 issue 會使用自己的 branch：`issue-<ISSUE_NUMBER>`
- 檔案會存到：`workspaces/issue-<ISSUE_NUMBER>/line`
- issue / comment 會寫入 branch 與 repo path
