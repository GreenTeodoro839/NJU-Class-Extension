# NJU 红黑榜助手（Chrome 扩展 / 油猴脚本）

在南京大学选课系统的教学班卡片中显示对应教师组的红黑榜评分，并可直接查看最近评价。

## 油猴安装

1. 在 Chrome 安装 [Tampermonkey](https://www.tampermonkey.net/)。
2. 打开 [NJU 红黑榜助手安装脚本](https://raw.githubusercontent.com/GreenTeodoro839/NJU-Class-Extension/v0.1.0/njuclass.user.js)。
3. 在 Tampermonkey 安装页确认安装，然后刷新已经打开的南京大学选课页面。

> Chrome 扩展和油猴脚本功能相同，建议只启用其中一个。

## Chrome 扩展本地安装

1. 在 Chrome 打开 `chrome://extensions/`。
2. 打开右上角“开发者模式”。
3. 点击“加载已解压的扩展程序”。
4. 选择当前项目根目录 `NJU-class-extension/`（即 `manifest.json` 所在目录）。
5. 刷新已经打开的南京大学选课页面。

## 使用方式

- 专业页点击课程的“查看班级”后，每张教师卡片会出现评分条。
- 公共、跨专业和体育页会在每个教学班的课程名下方显示紧凑评分徽章。
- 点击评分条可查看该教师组评价：首屏加载 5 条，可继续加载，并可按最近学期、评分高低排序或筛选 1–5 星。
- “查看完整评价”会把当前教师、排序和评分筛选带到红黑榜网页；评分以五颗填充星展示。
- 搜索、翻页、切换选课分类后，插件会自动识别新加载的教学班。

## 匹配规则

插件先用课程号精确请求公开 API，再把选课页教师名单与数据库候选做“教师集合完全相等”比较。匹配后继续使用 API 返回的规范教师串，因此多教师在数据库中的拼音排序不会导致查错，也不会把单教师误匹配到多人教学班。

## 权限与隐私

- 两个版本都只在 `https://xk.nju.edu.cn/xsxkapp/*` 注入界面。
- Chrome 扩展的主机权限和油猴脚本的 `@connect` 都只允许访问 `njuclass.zcec.top` 的公开课程与评价接口。
- 不读取选课账号、登录令牌、课表或红黑榜登录信息，也不在插件中保存个人数据。

## 开发

项目使用原生 JavaScript，无需构建。Chrome 扩展由 `manifest.json` 加载；油猴入口为 `njuclass.user.js`，跨域请求适配器为 `userscript-transport.js`。发布新的油猴版本时，需要同步递增脚本版本并更新其固定版本资源地址。

## 开源许可

本项目采用 [MIT License](LICENSE)。
