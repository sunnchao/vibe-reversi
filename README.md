# 《技能黑白棋 · 翻盘棋》完整实现与验收报告

> 口号：**“明明只剩 3 个子，一步全翻回来！”**
> 架构：**TypeScript + 原生 Canvas 2D + 微信云开发（core 纯逻辑与 UI 彻底解耦）**

---

## 一、快速运行与验收方式

### 1. 运行全量自动化验收测试套件（共 33 项测试）
```bash
npm test
```
包含：
- `npm run test:core`：阶段 0 & 阶段 1（坐标双向换算 + 角落/多方向翻子/连续 pass + **100 局随机对弈无死循环/无非法翻子/终局子数总和校验**）
- `npm run test:skills`：阶段 3（能量增长与上限 + **六大技能各 3 个边界与金身子冲突单测** + **两人同屏完整打完一局六技能各用一次**）
- `npm run test:ai`：阶段 4（20 关配置表与本地/云存档合并 + 新手第 1 关 3 局必胜验证 + **50 局 L3 vs L2 自动对弈胜率与单步耗时基准统计**）
- `npm run test:net`：阶段 5（6 位好友房创建/加入/满房拒绝/30 分钟过期 + **服务端复用 core 防作弊复验拦截改包** + 「求你等我」同意/拒绝流转 + **杀进程重进恢复棋盘** + **90 秒无心跳掉线判胜** + 双端完整对局）
- `npm run test:ui`：阶段 2 & 阶段 6（7 大页面渲染与导航热区 + 三大动画状态机 + 本局最大翻盘步自动计算与微信战绩分享卡片）

### 2. 编译打包（微信小游戏包 `game.js` + 云函数包 `cloudfunctions/reversiRoom/index.js`）
```bash
npm run typecheck
npm run build
```

### 3. 直接预览体验
- **微信开发者工具**：打开本项目目录 `/Volumes/T7 Mac/Development/vibe-reversi`（已含 `project.config.json`、`game.json`、`game.js` 及 `cloudfunctions/reversiRoom`）。
- **浏览器直接预览**：双击或用浏览器打开根目录下的 `preview.html`，即可在手机模拟器边框内完整体验 7 大页面、人机 20 关、双人同屏、好友房联机与六大逆转技能。

---

## 二、目录结构与架构解耦说明

```text
├── src/
│   ├── config/
│   │   ├── skills.ts       # 能量参数与六大技能配置表（全部配置化）
│   │   ├── stages.ts       # 20 关人机闯关配置表（AI 档位、携带技能、初始能量、首通奖励）
│   │   └── weights.ts      # AI 位置权重表与评估函数系数
│   ├── core/               # 纯函数规则引擎（零 wx 依赖、零 UI 依赖）
│   │   ├── types.ts        # 棋盘、技能状态机、结构化事件 GameEvent、历史快照 GameSnapshot
│   │   ├── board.ts        # 8×8 棋盘、8方向夹子检测、金身子阻断夹线检测、十字炸弹计算
│   │   └── engine.ts       # 落子、自动 pass、终局判定、能量结算、六大技能执行、最大翻盘步计算
│   ├── ai/
│   │   └── ai.ts           # L1 贪心漏角、L2 位置权重、L3 Negamax + Alpha-Beta 搜索 + AI 技能决策
│   ├── net/
│   │   ├── storage.ts      # 本地存档 + 云存档双向合并（换设备不丢进度）
│   │   ├── protocol.ts     # 好友房联机服务、服务端 core 复验防作弊、90 秒断线判定
│   │   └── client.ts       # 微信云开发客户端封装与本地联机同步总线
│   ├── ui/
│   │   ├── coord.ts        # 屏幕自适应棋盘布局与像素/行列坐标双向换算
│   │   ├── animations.ts   # 三大动画控制器（翻子翻转、炸弹爆炸帧、终局比分滚动）
│   │   └── app.ts          # 严格 7 大页面渲染器与交互控制器
│   └── game.ts             # 微信小游戏 & H5 Canvas 统一启动入口
├── cloudfunctions/
│   └── reversiRoom/        # 微信云函数（createRoom/joinRoom/submitMove/requestSkill/respondSkill/syncState）
├── tests/                  # 5 大阶段自动化验收测试套件
├── game.json               # 微信小游戏配置
├── project.config.json     # 微信开发者工具工程配置
└── preview.html            # 浏览器免安装一键预览器
```

---

## 三、阶段 Git Tags 版本记录

- `v0.0-scaffold`：阶段 0 搭架子、配置文件与坐标换算
- `v0.1-core`：阶段 1 核心规则引擎与 100 局随机对弈验收
- `v0.3-skills`：阶段 3 能量与六大技能系统及 20 项边界单测验收
- `v0.4-ai`：阶段 4 三档 AI 与 20 关闯关系统（L3 对 L2 胜率 100%，平均单步 10.96ms）
- `v0.5-net`：阶段 5 好友房联机与云函数服务端 core 防作弊复验
- `v0.6-ui`：阶段 2 & 6 七大页面、三大动画、最大翻盘步结算分享与双端构建
- `v1.0-release`：全阶段交付版本
