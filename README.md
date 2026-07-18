# NJU 红黑榜助手

在南京大学选课系统的教学班卡片中显示对应教师组的红黑榜评分，并可直接查看最近评价。项目同时提供 Chrome 扩展和 Tampermonkey 油猴脚本，两端共用课程匹配、卡片、弹窗、排序、筛选和分页实现。

Chrome 扩展和油猴脚本使用相同版本号，当前版本为 `0.1.4`。

## Chrome 扩展本地安装

1. 在 Chrome 打开 `chrome://extensions/`。
2. 打开右上角“开发者模式”。
3. 点击“加载已解压的扩展程序”。
4. 选择当前项目根目录（即 `manifest.json` 所在目录）。
5. 刷新已经打开的南京大学选课页面。

## 油猴安装

1. 在 Chrome 安装 [Tampermonkey](https://www.tampermonkey.net/)。
2. 打开 [NJU 红黑榜助手安装脚本](https://git.nju.edu.cn/zhy9559/nju-class-extension/-/raw/userscript/njuclass.user.js)。
3. 在 Tampermonkey 安装页确认安装，然后刷新已经打开的南京大学选课页面。

> 两个版本功能相同，建议只启用其中一个。

## 使用方式

- 专业页点击课程的“查看班级”后，每张教师卡片会出现评分条。
- 公共、跨专业和体育页会在每个教学班的课程名下方显示紧凑评分徽章。
- 点击评分条可查看该教师组评价：首屏加载 5 条，可继续加载，并可按最近学期、评分高低排序或筛选 1–5 星。
- “查看完整评价”会把当前教师、排序和评分筛选带到红黑榜网页；评分以五颗填充星展示。
- 搜索、翻页、切换选课分类后，脚本会自动识别新加载的教学班。

## 匹配规则

脚本先用课程号精确请求公开 API，再把选课页教师名单与数据库候选做“教师集合完全相等”比较。匹配后继续使用 API 返回的规范教师串，因此多教师在数据库中的拼音排序不会导致查错，也不会把单教师误匹配到多人教学班。

## 权限与隐私

- 两个版本都只在 `https://xk.nju.edu.cn/xsxkapp/*` 注入界面。
- Chrome 扩展的主机权限和油猴脚本的 `@connect` 都只允许访问 `njuclass.zcec.top` 的公开课程与评价接口。
- 不读取选课账号、登录令牌、课表或红黑榜登录信息，也不保存个人数据。

## 分支约定

- `main`：Chrome 扩展与公共源码分支，维护公共 JS/CSS 和 Chrome 专用代码。
- `userscript`：油猴发布分支，只维护 `njuclass.user.js` 和 `userscript-transport.js`。安装、自动更新和油猴专用请求适配器都来自该分支。

## 开发

项目使用原生 JavaScript，无需构建。`core.js`、`content.js` 和 `content.css` 为两端公共实现；Chrome 使用 `main` 的 `background.js`，油猴使用 `userscript` 的 `userscript-transport.js`。

发布时同步递增 `main/manifest.json` 的 `version` 和 `userscript/njuclass.user.js` 的 `@version`，并创建同版本的 Git 标签。标签对应完整运行快照，油猴通过该标签加载公共资源与专用适配器；`main` 和 `userscript` 的分支内容仍按上述职责保持分离。

## 开源许可

本项目采用 [MIT License](LICENSE)。
