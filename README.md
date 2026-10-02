# dsh-whale-swap

把 DeepSeek Harness 会话框上方的鲸鱼 Logo 换成你自己的图标。

- 只替换会话框(composer)上方那一只鲸鱼 —— 通过官方 slot
  `[data-slot="conversation.hero.brand.mark"]` 精确定位,页面其它位置的
  鲸鱼一律不碰。
- 自带图标库:上传本地图片、填图片 URL,可存多个、点选切换、悬停摇摆动效。
- 设置入口集成在宿主设置弹窗侧边栏(设置 → 鲸鱼图标替换),不用任何外部工具。
- 配置保存在 `$DSH_HOME/whale-swap/config.json`,升级插件不丢设置;
  上传的图片以 `data:` 形式存放在本地,不上传到任何服务器。
- 不内置任何默认图标,图标库初始为空,未添加图标时页面保持原样。

## 安装

在 DeepSeek Harness 的「添加插件」对话框中输入以下任意一种:

- 本仓库的 GitHub 地址:`https://github.com/EricEricEr/dsh-whale-swap`
- 或克隆到本地后填本地目录路径

也可以用 CLI:`dsh plugin add https://github.com/EricEricEr/dsh-whale-swap`

> 注:尚未发布到 npm,暂不支持按包名安装。

安装后打开 设置 → 鲸鱼图标替换,添加图标即可生效。

## 网页端(dsh web)

插件与 profile 无关,网页端同样可用,装入 web profile 即可:

```bash
dsh plugin --profile web add https://github.com/EricEricEr/dsh-whale-swap
# 然后重启 dsh web
```

桌面端与网页端共用 `$DSH_HOME` 下的配置(`$DSH_HOME/whale-swap/config.json`),
所以两端的图标库和开关状态自动同步,只需上传一次。

## 配置文档

```json
{
  "enabled": true,
  "wiggle": true,
  "icons": [{ "id": "dfy_...", "name": "我的鱼", "src": "data:image/png;base64,..." }],
  "activeId": "dfy_..."
}
```

| 字段 | 说明 |
| --- | --- |
| `enabled` | 总开关,关闭后鲸鱼恢复原样 |
| `wiggle` | 悬停时图标摇摆动效 |
| `icons` | 图标库,`src` 接受 `data:image/` 或 `http(s)://` |
| `activeId` | 当前使用的图标 id |

## 目录结构

```
package.json        插件清单(dsh.bundle.patch / dsh.client 声明)
cordis.patch.yml    bundle 补丁,安装时自动并入 profile
config.example.json 默认配置
lib/index.js        node 半:配置路由 /plugins/dsh-whale-swap/config.json
lib/client.js       浏览器半:hero 鲸鱼替换 + 设置页(挂在 settings.section)
```

## License

MIT
