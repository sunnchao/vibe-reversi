# 翻盘棋微信发布方案

> **生产主线声明**：正式产品为 `uniapp/`（Vue 3 + TypeScript + uni-app），微信小程序输出至 `dist/build/mp-weixin`，版本 `1.1.0`。旧 Canvas 程序与 `dist/wechat-*` 仅作为历史验证原型保留，不属于本版正式发布链路；勿将其 6 技能、20 关、`rooms` 集合或 1.0.0 功能描述用于当前提审。

## 产品形态

本次正式发布目标为 uni-app 微信小程序（`compileType: miniprogram`）。H5 可作预览及静态演示；部署好友房联机功能时，须配置可访问的好友服务端。主包由 `uniapp/`、`src/friends/` 与 `cloudfunctions/reversiRoom/index.ts` 生产。

旧 Canvas 线记录（仅历史归档）：`src/game.ts`、`src/ui/`、`src/core/`、`src/net/` 及 `dist/wechat-game` / `dist/wechat-miniprogram` 对应早期原型；其旧关卡、技能和 `rooms` 数据结构不代表 1.1.0。

## 本机运行

```bash
npm install
npm test
npm run typecheck
npm run typecheck:uniapp
npm run build:uniapp
```

正式构建及微信工具操作的唯一默认入口为 `wechat:*`：默认构建并校验 `dist/build/mp-weixin`。旧构建入口保留为 `wechat:legacy:*`，仅用于历史原型维护，不用于提审。

## 微信开发者工具

在项目根目录 `.env.local` 配置当前账号的真实 `WECHAT_APPID` 和 `WECHAT_CLOUD_ENV`，并在微信开发者工具中确认该 AppID 允许游戏内容、`friendRooms` 集合仅允许云函数读写。不要把真实配置写入公开文档或源码。

```bash
npm run wechat:open
```

`wechat:open` 构建并校验后打开 `dist/build/mp-weixin`。本地仅编译检查而不进行发布配置门禁时，可显式运行：

```bash
npm run wechat:open -- --compile-only
```

真机预览、上传、云函数部署均为发布操作：需要真实 AppID 和云环境，并且不会接受 `--compile-only`：

```bash
npm run wechat:cloud
npm run wechat:preview
```

上传版本和说明可由 `.env.local` 的 `WECHAT_UPLOAD_VERSION` 与 `WECHAT_UPLOAD_DESC` 提供。使用上传命令前须先确认账号主体、类目、功能说明及目标版本；此文档不代替用户主动确认外部发布操作。

## 产物与云服务

正式小程序产物位于 `dist/build/mp-weixin`；`app.json` 使用普通小程序编译类型，并通过构建生成的 `build-info.json` 标注目标、版本和构建时云环境是否已配置。云函数源码位于 `cloudfunctions/reversiRoom`；创建、加入、落子、离房和断线判定经事务执行，房间集合为 `friendRooms`，参与者身份由云函数上下文 `OPENID` 提供。客户端不直接读写房间文档。其他个人棋谱与偏好保存在当前设备。

旧版 Canvas 发布记录不构成本版环境凭据或验收结果，不在此复制 AppID、云环境 ID、旧测试人数或既往上传记录。1.1.0 的云端与真机验收应使用当前构建按本节提审前清单重新完成。

## 对局与邀请链路

1. 首页选择独自练习、同屏切磋或创建好友棋桌；独自练习提供「入门」「进阶」「高手」三档 AI。
2. 好友从微信邀请卡的 `roomId` 或六位房间号进入棋桌。过期、满房或不匹配时显示对应提示；成功入座后由房主开局。
3. 好友房操作由云函数校验参与者身份，并在 `friendRooms` 数据事务中复验并同步棋局；客户端轮询恢复状态。短暂重连期间禁止提交落子，后台恢复后重新同步。
4. 对局结算后可查看本地棋谱并逐手回看；用户主动选择微信分享或复制本局回顾，不会自动向好友发送内容。

## 提审前清单

- 确认目标微信账号主体与服务类目允许本游戏内容，补全平台要求的隐私说明及服务条款。
- 在 `.env.local` 配置真实 AppID 和云环境；运行 `npm run wechat:validate` 检查当前微信小程序构建产物。
- 通过微信开发者工具为目标云环境部署当前 `reversiRoom`，核验 `friendRooms` 集合权限仅允许云函数读写。
- 使用两个测试微信账号实测建房、分享回流、冷启动入座、满房、过期、断网重连和 90 秒离线判定。
- 在 iOS、Android 真机校验安全区域、棋盘操作、声音、轻震和后台恢复。
- 对照 `wechat/STORE_METADATA.md` 检查按钮文字、三章练习、三项技能、版本号及 `friendRooms` 描述均与 1.1.0 实机一致；仅由项目所有者确认后手动上传、提审。
