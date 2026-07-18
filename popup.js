(function checkCurrentTab() {
  'use strict'

  const status = document.getElementById('status')
  const title = document.getElementById('status-title')
  const detail = document.getElementById('status-detail')

  function setStatus(kind, heading, description) {
    status.className = `status status--${kind}`
    title.textContent = heading
    detail.textContent = description
  }

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const currentTab = tabs[0]
    if (!currentTab?.id) {
      setStatus('inactive', '无法读取当前页面', '请打开南京大学选课平台后重试。')
      return
    }

    chrome.tabs.sendMessage(currentTab.id, { type: 'njuclass:ping' }, (response) => {
      if (chrome.runtime.lastError || !response?.ok) {
        setStatus('inactive', '当前页尚未启用', '请打开选课平台；若已经打开，请刷新该页面。')
        return
      }

      const cardCount = Number(response.cardCount) || 0
      const rowCount = Number(response.rowCount) || 0
      setStatus(
        'active',
        '已在当前选课页运行',
        cardCount > 0
          ? rowCount > 0
            ? `已识别 ${cardCount} 个教学班，评分显示在课程名下方。`
            : `已识别 ${cardCount} 个教学班，展开班级即可查看评价。`
          : '等待教学班加载，搜索或切换分类后会自动识别。',
      )
    })
  })
})()
