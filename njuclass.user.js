// ==UserScript==
// @name         NJU 红黑榜助手
// @namespace    https://njuclass.zcec.top/
// @version      0.1.0
// @description  在南京大学选课系统中显示 NJU 课程红黑榜的教师评价
// @author       GreenTeodoro839
// @license      MIT
// @match        https://xk.nju.edu.cn/xsxkapp/*
// @icon         https://git.nju.edu.cn/zhy9559/nju-class-extension/-/raw/userscript/icons/icon-128.png
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @grant        GM_getResourceText
// @connect      njuclass.zcec.top
// @run-at       document-idle
// @noframes
// @require      https://git.nju.edu.cn/zhy9559/nju-class-extension/-/raw/userscript/core.js
// @require      https://git.nju.edu.cn/zhy9559/nju-class-extension/-/raw/userscript/userscript-transport.js
// @require      https://git.nju.edu.cn/zhy9559/nju-class-extension/-/raw/userscript/content.js
// @resource     njuclassCSS https://git.nju.edu.cn/zhy9559/nju-class-extension/-/raw/userscript/content.css
// @homepageURL  https://git.nju.edu.cn/zhy9559/nju-class-extension/-/tree/userscript
// @supportURL   https://git.nju.edu.cn/zhy9559/nju-class-extension/-/issues
// @downloadURL  https://git.nju.edu.cn/zhy9559/nju-class-extension/-/raw/userscript/njuclass.user.js
// @updateURL    https://git.nju.edu.cn/zhy9559/nju-class-extension/-/raw/userscript/njuclass.user.js
// ==/UserScript==

(function startNjuClassUserscript() {
  'use strict'

  if (globalThis.NjuClassContentMounted) {
    const css = GM_getResourceText('njuclassCSS')
    if (css) GM_addStyle(css)
  }
})()
