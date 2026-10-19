# 幺筒麻将

浏览器中的四人幺筒麻将，使用 Vue 3、Three.js 和 TypeScript。当前可玩模式为一名玩家与三名本地 AI 的单机对局；保留“联机对战 / 创建或加入房间”入口，点击显示建设中提示。

规则依据：[幺筒麻将规则 v1.0](docs/幺筒麻将规则-v1.0.md)。实现和验收记录见 [幺筒麻将实现与验收](docs/幺筒麻将实现与验收.md)。

- 108张实体牌，东风／半庄／全庄分别按4／8／16庄次推进。
- 一筒可作本牌或癞子，支持碰杠、报听／原报、抢杠、热炮和一炮多响。
- 鸡分、杠分、幺筒责任、见面礼、杀报、包牌和流局赔听分别记账，账单可导出JSON。
- 保留3D牌桌、全部主题、头像、听牌提示、托管、声音、动作和结算演出。

## 开发与验证

要求 Node.js `^20.19.0 || >=22.12.0`，使用仓库的 pnpm 锁文件。

```sh
pnpm install --frozen-lockfile
pnpm dev             # http://localhost:5173
pnpm test:yaotong    # 幺筒规则与完整对局
pnpm test           # 全部保留模块，含本地 AI、LLM、分析和回放
pnpm build          # 类型检查与生产构建
pnpm test:e2e       # 幺筒大厅、联机占位、开局和托管结算
```

Windows 无法创建符号链接时，可使用 `pnpm install --frozen-lockfile --node-linker=hoisted --store-dir .pnpm-store`。
构建结果在 `dist/`，可部署到静态网站服务。当前入口和默认浏览器测试不需要 Python 后端。刷新或离桌会结束本地对局。

## 代码与保留边界

- `src/App.vue` 只装配幺筒端口；`src/game/variants/yaotong/` 是规则、AI与对局逻辑，`src/components/yaotong/` 是专属交互和结算。
- `src/game/llm/`、本地 AI 控制器、`src/game/replay/`、训练／自博弈／评测脚本和相关文档继续保留。旧玩法引擎、评分器及共享表现中仍被这些模块引用的部分也保留，以便复现实验，不能只按玩法名称删除。
- 原广麻、翻精和血流不再是产品入口，旧 `?game=legacy` 参数也不会切换玩法。幺筒当前使用本地 AI，尚未把保留的旧玩法 LLM 控制器接入幺筒规则。
- 联机底层代码按要求保留；当前联机按钮仅展示建设中状态，不登录、建房或连接旧房间服务。
- 旧 AI/LLM 浏览器用例保留为研究参考，其中依赖旧大厅的用例不属于当前产品验收；默认 Playwright 配置只运行 `yaotong*.spec.ts`。模块单测仍由 `pnpm test` 全量运行。
- 分支同步脚本和[分支工作流](docs/branch-sync-workflow.md)按仓库约定保留。`tmp/`、`dist/`、依赖缓存和用户未提交的规则资料不属于本轮源码删除范围。

AI资料：[本地AI出牌流程](docs/ai-play-flowchart.md)、[LLM接入设计](docs/llm-ai-design.md)、[网关](docs/llm-relay-gateway.md)、[历史AI研究与复现资料](docs/blood-flow/README.md)。这些历史文档中的玩法、旧部署和验收记录不代表幺筒当前支持范围。

## 保留的 LLM / TTS 环境说明

以下是保留模块的上游接入说明。`VITE_API_BASE` 可指定服务地址；此配置不表示幺筒已提供联机或 LLM 对战。

- `VITE_LOCAL_TTS_BASE_URL`（可选）：单机大模型吐槽的独立 TTS 网关基址。
  master 默认沿用 `VITE_API_BASE`/同源 `/api`；`*.lumigrav.space` 未显式配置时
  回退生产网关。该地址只传短文本与白名单音色，不包含百度 Key/Secret。

代码通过 Vite 内置的 `import.meta.env.BASE_URL` 拼接音频、图片和头像资源路径。不要把密钥放入前端环境变量或提交到仓库。

单机大模型启用后，吐槽文字会立即显示，同时异步请求独立的
`POST /api/local-tts/synthesize`。音频返回后进入共享播放队列，与 BGM 同时播放
（语音期间不压低 BGM：2026-09-11 用户决定，忽高忽低更影响对局节奏）；失败只保留气泡，不影响出牌。AI 设置中的“单机音色”可自动按模型识别 DeepSeek/千问/Kimi/豆包/MiniMax/GPT/GLM/Claude，也可
手动指定任一网关白名单音色或策略默认音色。此链路位于共享 `game/llm` 与
`game/core/presentation`，master 与 vibehub 使用同一实现，不依赖 WebSocket/P2P。

无浏览器 CORS 的供应商端点不能从网页直连：千问 Token Plan
（`token-plan.cn-beijing.maas.aliyuncs.com`）、Coding Plan
（`coding.dashscope.aliyuncs.com`）对预检一律直接 401、不带任何 `Access-Control-*`
头（2026-09-18 实测），官方也明确 Token Plan / Coding Plan / 按量付费三套 Base URL
与凭证完全隔离、不可混用。这类端点走自家后端的白名单透传通道
`POST /api/llm/relay/<upstream>/chat/completions`（浏览器 → 网关回 CORS 头 →
供应商，SSE 原样流式回传）。AI 设置中的「千问 Token Plan（经网关）」预置已指向该通道：
Key 仍是用户自己的 `sk-sp-` Key，由浏览器携带、服务端不保存也不落日志；上游白名单
在服务端（`backend/app/api/llm_relay.py`），客户端只能选 id。详见
[docs/llm-relay-gateway.md](./docs/llm-relay-gateway.md)。


## 来源与许可

本项目基于 [BestGuo2020/lianhuaguangdongmahjong](https://github.com/BestGuo2020/lianhuaguangdongmahjong)，保留其共享牌桌与主题资源。项目代码许可见 [LICENSE](LICENSE)。示例头像来自 DiceBear Adventurer，原设计作者 Lisa Wischofsky，采用 CC BY 4.0 许可。

游戏积分仅用于虚拟娱乐，不具备现金价值，不支持兑换或线下结算。完整声明保留在游戏规则面板中。
