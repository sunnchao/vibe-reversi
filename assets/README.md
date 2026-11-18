# 棋局插画

`reversi-table.jpg` 是本次界面更新生成的原创棋盘插画，以深绿棋桌、黑白棋子和版画颗粒统一主页、好友等待页与结算页的视觉。发布包使用 125 KB 的压缩版，原始 260 KB 母版保存为 `reversi-table-source.jpg`，不会进入小程序运行包。

素材随小游戏打包，不依赖远程图片服务。Canvas 使用等比裁切绘制，图片未加载时显示棋子示意作为后备。

微信发布用方形应用图标放在 `wechat/publish-assets/`，不会被打进运行包。图标以暖纸、胡桃木框、深绿呢面和三枚翻转中的棋子构成，无文字；512 版本直接用于平台上传，1024 版本作为高清母版。

图标由内置 ImageGen 生成，提示词方向为：`editorial game-manual illustration blended with tactile product photography; warm paper #E9E3D4, forest green #244D3E, ink #1D2B25, vermilion #B94D35 and brass #BB9250; three glossy reversi stones with diagonal flip motion; no typography, UI chrome, neon or generic 3D cartoon style`。
