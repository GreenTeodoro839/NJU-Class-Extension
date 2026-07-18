// ==UserScript==
// @name         NJU 红黑榜助手
// @namespace    https://njuclass.zcec.top/
// @version      0.1.0
// @description  在南京大学选课系统中显示 NJU 课程红黑榜的教师评价
// @author       GreenTeodoro839
// @license      MIT
// @match        https://xk.nju.edu.cn/xsxkapp/*
// @icon         https://raw.githubusercontent.com/GreenTeodoro839/NJU-Class-Extension/v0.1.0/icons/icon-128.png
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @grant        GM_getResourceText
// @connect      njuclass.zcec.top
// @run-at       document-idle
// @noframes
// @require      https://raw.githubusercontent.com/GreenTeodoro839/NJU-Class-Extension/v0.1.0/core.js
// @require      https://raw.githubusercontent.com/GreenTeodoro839/NJU-Class-Extension/v0.1.0/userscript-transport.js
// @require      https://raw.githubusercontent.com/GreenTeodoro839/NJU-Class-Extension/v0.1.0/content.js
// @resource     njuclassCSS https://raw.githubusercontent.com/GreenTeodoro839/NJU-Class-Extension/v0.1.0/content.css
// @homepageURL  https://github.com/GreenTeodoro839/NJU-Class-Extension
// @supportURL   https://github.com/GreenTeodoro839/NJU-Class-Extension/issues
// @downloadURL  https://raw.githubusercontent.com/GreenTeodoro839/NJU-Class-Extension/main/njuclass.user.js
// @updateURL    https://raw.githubusercontent.com/GreenTeodoro839/NJU-Class-Extension/main/njuclass.user.js
// ==/UserScript==

(function startNjuClassUserscript() {
  'use strict'

  if (globalThis.NjuClassContentMounted) {
    const css = GM_getResourceText('njuclassCSS')
    if (css) GM_addStyle(css)
  }
})()
