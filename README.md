# NJU 红黑榜助手（油猴脚本）

在南京大学选课系统的教学班卡片中显示对应教师组的红黑榜评分，并可直接查看最近评价。

## 油猴安装

1. 在 Chrome 安装 [Tampermonkey](https://www.tampermonkey.net/)。
2. 打开 [NJU 红黑榜助手安装脚本](https://git.nju.edu.cn/zhy9559/nju-class-extension/-/raw/userscript/njuclass.user.js)。
3. 在 Tampermonkey 安装页确认安装，然后刷新已经打开的南京大学选课页面。

> Chrome 扩展源码位于 [`main` 分支](https://git.nju.edu.cn/zhy9559/nju-class-extension/-/tree/main)。两个版本功能相同，建议只启用其中一个。

## 使用方式

- 专业页点击课程的“查看班级”后，每张教师卡片会出现评分条。
- 公共、跨专业和体育页会在每个教学班的课程名下方显示紧凑评分徽章。
- 点击评分条可查看该教师组评价：首屏加载 5 条，可继续加载，并可按最近学期、评分高低排序或筛选 1–5 星。
- “查看完整评价”会把当前教师、排序和评分筛选带到红黑榜网页；评分以五颗填充星展示。
- 搜索、翻页、切换选课分类后，脚本会自动识别新加载的教学班。

## 匹配规则

脚本先用课程号精确请求公开 API，再把选课页教师名单与数据库候选做“教师集合完全相等”比较。匹配后继续使用 API 返回的规范教师串，因此多教师在数据库中的拼音排序不会导致查错，也不会把单教师误匹配到多人教学班。

## 权限与隐私

- 只在 `https://xk.nju.edu.cn/xsxkapp/*` 注入界面。
- `@connect` 只允许访问 `njuclass.zcec.top` 的公开课程与评价接口。
- 不读取选课账号、登录令牌、课表或红黑榜登录信息，也不在脚本中保存个人数据。

## 开发

项目使用原生 JavaScript，无需构建。油猴入口为 `njuclass.user.js`，跨域请求适配器为 `userscript-transport.js`。发布新版本时需要同步递增脚本的 `@version`，并让 `@require`、`@resource` 和图标引用对应的 NJU Git 版本标签，避免脚本管理器继续使用旧缓存。

## 开源许可

本项目采用 [MIT License](LICENSE)。
