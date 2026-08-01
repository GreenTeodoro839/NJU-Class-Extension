;(function runNjuClassExtension() {
  'use strict'

  const currentLocation = globalThis.location
  if (currentLocation && (
    currentLocation.origin !== 'https://xk.nju.edu.cn'
    || !currentLocation.pathname?.startsWith('/xsxkapp/')
  )) return

  const {
    buildCourseUrl,
    findExactTeacherCandidate,
    formatRating,
    isValidCourseCode,
  } = globalThis.NjuClassCore || {}

  if (!buildCourseUrl || !findExactTeacherCandidate || !formatRating || !isValidCourseCode) return

  if (typeof globalThis.chrome?.runtime?.sendMessage !== 'function') return

  const RUNTIME_MARKER = 'data-njuclass-helper-mounted'
  if (document.documentElement.hasAttribute(RUNTIME_MARKER)) return
  document.documentElement.setAttribute(RUNTIME_MARKER, '')

  const SITE_ORIGIN = 'https://njuclass.zcec.top'
  const MAX_CONCURRENT_REQUESTS = 4
  const EVALUATIONS_PAGE_SIZE = 5
  const DEFAULT_EVALUATION_SORT = 'semester'
  const detailRequests = new Map()
  const requestQueue = []
  const flatRowContexts = new WeakMap()
  let activeRequests = 0
  let scanScheduled = false
  let activeModal = null

  const flatRowObserver = typeof IntersectionObserver === 'function'
    ? new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return

        const queued = flatRowContexts.get(entry.target)
        flatRowObserver.unobserve(entry.target)
        flatRowContexts.delete(entry.target)
        if (
          queued
          && queued.root.isConnected
          && entry.target.dataset.njuclassKey === queued.context.key
        ) {
          hydrateSummary(queued.root, queued.context)
        }
      })
    }, { rootMargin: '500px 0px' })
    : null

  function element(tagName, className, text) {
    const node = document.createElement(tagName)
    if (className) node.className = className
    if (text !== undefined) node.textContent = text
    return node
  }

  function courseUrl(courseCode, teacher = '', filters = {}) {
    return buildCourseUrl(SITE_ORIGIN, courseCode, teacher, filters)
  }

  function submitUrl(courseCode, teacher) {
    const params = new URLSearchParams({ course_code: courseCode, teacher })
    return `${SITE_ORIGIN}/submit?${params.toString()}`
  }

  function externalLink(href, className, text) {
    const link = element('a', className, text)
    link.href = href
    link.target = '_blank'
    link.rel = 'noopener noreferrer'
    return link
  }

  function sendMessage(message) {
    const runtime = globalThis.chrome?.runtime
    if (!runtime?.sendMessage) {
      const error = new Error('插件后台暂时不可用')
      error.code = 'extension_error'
      return Promise.reject(error)
    }

    return new Promise((resolve, reject) => {
      runtime.sendMessage(message, (response) => {
        if (runtime.lastError) {
          const error = new Error('插件后台暂时不可用')
          error.code = 'extension_error'
          reject(error)
          return
        }
        if (!response || !response.ok) {
          const error = new Error(response?.error?.message || '请求失败')
          error.code = response?.error?.code || 'unknown_error'
          reject(error)
          return
        }
        resolve(response.data)
      })
    })
  }

  function enqueueRequest(task) {
    return new Promise((resolve, reject) => {
      requestQueue.push({ task, resolve, reject })
      pumpRequestQueue()
    })
  }

  function pumpRequestQueue() {
    while (activeRequests < MAX_CONCURRENT_REQUESTS && requestQueue.length > 0) {
      const entry = requestQueue.shift()
      activeRequests += 1
      Promise.resolve()
        .then(entry.task)
        .then(entry.resolve, entry.reject)
        .finally(() => {
          activeRequests -= 1
          pumpRequestQueue()
        })
    }
  }

  function loadCourseDetail(courseCode, force = false) {
    if (force) detailRequests.delete(courseCode)
    if (detailRequests.has(courseCode)) return detailRequests.get(courseCode)

    const promise = enqueueRequest(() => sendMessage({
      type: 'njuclass:get-course-detail',
      courseCode,
    }))

    detailRequests.set(courseCode, promise)
    promise.then(
      () => {
        if (detailRequests.get(courseCode) === promise) detailRequests.delete(courseCode)
      },
      () => {
        if (detailRequests.get(courseCode) === promise) detailRequests.delete(courseCode)
      },
    )
    return promise
  }

  function getCardContext(card) {
    const container = card.closest('.course-jxb-container[data-coursenumber]')
    const content = card.querySelector('.content')
    const head = content?.querySelector('.head')
    const teacherTitle = head?.querySelector('.jxb-title')
    const courseCode = container?.getAttribute('data-coursenumber')?.trim() || ''
    const rawTeacher = (
      teacherTitle?.getAttribute('title') || teacherTitle?.textContent || ''
    ).trim()

    if (!container || !content || !head || !isValidCourseCode(courseCode)) return null
    return { card, container, content, courseCode, head, rawTeacher }
  }

  function textWithoutInjectedUi(container) {
    const clone = container.cloneNode(true)
    clone.querySelectorAll('.njuclass-inline').forEach((node) => node.remove())
    clone.querySelectorAll('br').forEach((node) => node.replaceWith(','))
    return (clone.textContent || '').trim()
  }

  function getFlatRowContext(row) {
    const courseLink = row.querySelector('.kch [data-number], .kch a')
    const teacherCell = row.querySelector('.jsmc')
    const targetCell = row.querySelector('.kcmc') || row.querySelector('.kch')
    const courseCode = (
      courseLink?.getAttribute('data-number') || courseLink?.textContent || ''
    ).trim()
    const rawTeacher = teacherCell ? textWithoutInjectedUi(teacherCell) : ''

    if (!courseLink || !teacherCell || !targetCell || !isValidCourseCode(courseCode)) return null
    return { card: row, courseCode, rawTeacher, targetCell, teacherCell }
  }

  function isFlatRow(root) {
    return root.dataset.njuclassLayout === 'row'
  }

  function setInlineState(root, state) {
    const layout = isFlatRow(root) ? 'row' : 'card'
    root.className = `njuclass-inline njuclass-inline--${layout} njuclass-inline--${state}`
  }

  function brand(root) {
    return element('span', 'njuclass-brand', isFlatRow(root) ? '红黑榜' : 'NJU 红黑榜')
  }

  function renderLoading(root) {
    setInlineState(root, 'loading')
    const status = element('div', 'njuclass-inline-status')
    status.setAttribute('role', 'status')
    status.append(brand(root), element('span', 'njuclass-loading-text', '查询中'))
    root.replaceChildren(status)
  }

  function renderUnavailable(root, message, context, linkToCourse = false) {
    setInlineState(root, 'muted')
    const compactMessage = isFlatRow(root)
      ? message
        .replace('该教师组未收录', '教师组未收录')
        .replace('课程暂未收录', '课程未收录')
        .replace('教师信息缺失', '教师缺失')
      : message
    const content = linkToCourse
      ? externalLink(courseUrl(context.courseCode), 'njuclass-inline-link')
      : element('div', 'njuclass-inline-status')

    content.append(brand(root), element('span', 'njuclass-muted-text', compactMessage))
    if (linkToCourse) {
      content.append(element('span', 'njuclass-chevron', '›'))
      content.title = `${message}，打开课程完整页面`
      content.addEventListener('click', (event) => event.stopPropagation())
    }
    root.replaceChildren(content)
  }

  function renderError(root, context) {
    setInlineState(root, 'error')
    const retry = element('button', 'njuclass-inline-button njuclass-retry-button')
    retry.type = 'button'
    retry.title = '重新查询 NJU 红黑榜'
    retry.append(
      brand(root),
      element('span', 'njuclass-error-text', isFlatRow(root) ? '失败 · 重试' : '加载失败 · 重试'),
    )
    retry.addEventListener('click', (event) => {
      event.preventDefault()
      event.stopPropagation()
      renderLoading(root)
      hydrateSummary(root, context, true)
    })
    root.replaceChildren(retry)
  }

  function ratingTone(rating) {
    if (rating === null) return 'none'
    if (rating >= 4.3) return 'high'
    if (rating >= 3.3) return 'mid'
    return 'low'
  }

  function renderSummary(root, context, detail, teacherSummary) {
    const rating = formatRating(teacherSummary.avg_rating)
    const count = Number(teacherSummary.review_count) || 0
    const button = element('button', 'njuclass-inline-button njuclass-summary-button')
    const metricText = isFlatRow(root)
      ? count === 0
        ? '暂无评价'
        : rating === null
          ? `${count} 评`
          : `★${rating} · ${count}评`
      : count === 0
        ? '暂无评价'
        : rating === null
          ? `${count} 评 · 暂无评分`
          : `★ ${rating} · ${count} 评`
    const metric = element(
      'span',
      'njuclass-rating-metric',
      metricText,
    )

    button.type = 'button'
    button.dataset.ratingTone = ratingTone(rating === null ? null : Number(rating))
    button.title = `${detail.course_name} · ${teacherSummary.teacher}：点击查看最近评价`
    button.setAttribute(
      'aria-label',
      `${detail.course_name}，${teacherSummary.teacher}，${rating === null ? '暂无评分' : `${rating} 分`}，${count} 条评价`,
    )
    button.append(brand(root), metric, element('span', 'njuclass-chevron', '›'))
    button.addEventListener('click', (event) => {
      event.preventDefault()
      event.stopPropagation()
      openEvaluationModal({
        courseCode: context.courseCode,
        detail,
        teacherSummary,
      }, button)
    })

    setInlineState(root, 'ready')
    root.replaceChildren(button)
  }

  async function hydrateSummary(root, context, force = false) {
    try {
      const detail = await loadCourseDetail(context.courseCode, force)
      if (!root.isConnected || context.card.dataset.njuclassKey !== context.key) return

      const teacherSummary = findExactTeacherCandidate(detail.teachers, context.rawTeacher)
      if (!teacherSummary) {
        renderUnavailable(root, '该教师组未收录', context, true)
        return
      }

      renderSummary(root, context, detail, teacherSummary)
    } catch (error) {
      if (!root.isConnected || context.card.dataset.njuclassKey !== context.key) return
      if (error?.code === 'not_found') {
        renderUnavailable(root, '课程暂未收录', context)
        return
      }
      renderError(root, context)
    }
  }

  function mountCard(card) {
    const context = getCardContext(card)
    if (!context) return

    const key = `${context.courseCode}|${context.rawTeacher}`
    if (card.dataset.njuclassKey === key && card.querySelector('.njuclass-inline')) return

    card.querySelectorAll('.njuclass-inline').forEach((node) => node.remove())
    card.querySelectorAll('.njuclass-card-content').forEach((node) => {
      node.classList.remove('njuclass-card-content')
    })
    card.classList.remove('njuclass-has-rating')

    const cardHeight = Number.parseFloat(getComputedStyle(card).height)
    const contentHeight = Number.parseFloat(getComputedStyle(context.content).height)
    if (Number.isFinite(cardHeight)) {
      card.style.setProperty('--njuclass-card-height', `${cardHeight + 34}px`)
    }
    if (Number.isFinite(contentHeight)) {
      card.style.setProperty('--njuclass-content-height', `${contentHeight + 34}px`)
    }

    card.dataset.njuclassKey = key
    context.content.classList.add('njuclass-card-content')
    card.classList.add('njuclass-has-rating')

    const root = element('div', 'njuclass-inline njuclass-inline--card')
    root.dataset.njuclassLayout = 'card'
    context.head.insertAdjacentElement('afterend', root)
    const fullContext = { ...context, key }

    if (!context.rawTeacher) {
      renderUnavailable(root, '教师信息缺失', fullContext)
      return
    }

    renderLoading(root)
    hydrateSummary(root, fullContext)
  }

  function unmountCard(card) {
    if (activeModal?.trigger && card.contains(activeModal.trigger)) closeModal()
    card.querySelectorAll('.njuclass-inline').forEach((node) => node.remove())
    card.querySelectorAll('.njuclass-card-content').forEach((node) => {
      node.classList.remove('njuclass-card-content')
    })
    card.classList.remove('njuclass-has-rating')
    card.style.removeProperty('--njuclass-card-height')
    card.style.removeProperty('--njuclass-content-height')
    delete card.dataset.njuclassKey
  }

  function mountFlatRow(row) {
    const context = getFlatRowContext(row)
    if (!context) return

    const key = `${context.courseCode}|${context.rawTeacher}`
    const existingRoot = row.querySelector('.njuclass-inline--row')
    if (row.dataset.njuclassKey === key && existingRoot) return

    unmountFlatRow(row)
    row.dataset.njuclassKey = key
    row.classList.add('njuclass-has-row-rating')

    const root = element('div', 'njuclass-inline njuclass-inline--row')
    root.dataset.njuclassLayout = 'row'
    context.targetCell.append(root)
    const fullContext = { ...context, key }

    if (!context.rawTeacher) {
      renderUnavailable(root, '教师信息缺失', fullContext)
      return
    }

    renderLoading(root)
    if (flatRowObserver) {
      flatRowContexts.set(row, { context: fullContext, root })
      flatRowObserver.observe(row)
    } else {
      hydrateSummary(root, fullContext)
    }
  }

  function unmountFlatRow(row) {
    if (activeModal?.trigger && row.contains(activeModal.trigger)) closeModal()
    flatRowObserver?.unobserve(row)
    flatRowContexts.delete(row)
    row.querySelectorAll('.njuclass-inline--row').forEach((node) => node.remove())
    row.classList.remove('njuclass-has-row-rating')
    delete row.dataset.njuclassKey
  }

  function scanCards() {
    scanScheduled = false
    document.querySelectorAll('.njuclass-has-rating').forEach((card) => {
      if (!getCardContext(card)) unmountCard(card)
    })
    document.querySelectorAll('.njuclass-has-row-rating').forEach((row) => {
      if (!getFlatRowContext(row)) unmountFlatRow(row)
    })
    document
      .querySelectorAll('.course-jxb-container[data-coursenumber] .jxb-item')
      .forEach(mountCard)
    document
      .querySelectorAll('tr.course-tr')
      .forEach(mountFlatRow)
  }

  function scheduleScan() {
    if (scanScheduled) return
    scanScheduled = true
    window.requestAnimationFrame(scanCards)
  }

  function closeModal() {
    if (!activeModal) return

    document.removeEventListener('keydown', activeModal.onKeydown, true)
    activeModal.overlay.remove()
    const trigger = activeModal.trigger
    if (activeModal.body?.isConnected) {
      activeModal.body.style.overflow = activeModal.previousBodyOverflow
    }
    activeModal = null
    if (trigger?.isConnected) trigger.focus({ preventScroll: true })
  }

  function starRating(value, label, className = '') {
    const rating = Number(value)
    const normalizedRating = Number.isFinite(rating)
      ? Math.min(5, Math.max(0, rating))
      : 0
    const stars = element('span', `njuclass-stars${className ? ` ${className}` : ''}`)

    stars.setAttribute('role', 'img')
    stars.setAttribute('aria-label', label)

    for (let index = 0; index < 5; index += 1) {
      const star = element('span', 'njuclass-star')
      const base = element('span', 'njuclass-star-base', '★')
      const fill = element('span', 'njuclass-star-fill', '★')
      const fillRatio = Math.min(1, Math.max(0, normalizedRating - index))

      star.setAttribute('aria-hidden', 'true')
      fill.style.setProperty('--njuclass-star-fill', `${fillRatio * 100}%`)
      star.append(base, fill)
      stars.append(star)
    }

    return stars
  }

  function modalScore(teacherSummary) {
    const rating = formatRating(teacherSummary.avg_rating)
    const count = Number(teacherSummary.review_count) || 0
    const summary = element('div', 'njuclass-modal-score')
    const score = element('strong', 'njuclass-modal-score-value', rating === null ? '—' : rating)
    const stars = starRating(
      rating,
      rating === null ? '暂无平均评分' : `平均评分 ${rating} 分，满分 5 分`,
      'njuclass-modal-stars',
    )
    const countText = element('span', 'njuclass-modal-score-count', `${count} 条评价`)

    score.setAttribute('aria-hidden', 'true')
    summary.append(stars, score, countText)
    return summary
  }

  function reviewKey(review, page, index) {
    if (review.id !== null && review.id !== undefined) return `id:${review.id}`
    return `page:${page}:index:${index}`
  }

  function createReviewItem(review) {
    const item = element('article', 'njuclass-review-item')
    const header = element('div', 'njuclass-review-header')
    const rating = review.rating === null || review.rating === undefined
      ? null
      : Number(review.rating)
    const score = element('span', 'njuclass-review-rating')
    const semester = element('span', 'njuclass-review-semester', review.semester || '学期未知')

    if (Number.isFinite(rating)) {
      score.append(starRating(rating, `评分 ${rating} 分，满分 5 分`, 'njuclass-review-stars'))
    } else {
      score.textContent = '暂无评分'
    }

    header.append(score, semester)
    if (review.is_ai_rated) {
      const ai = element('span', 'njuclass-review-ai', 'AI 评分')
      ai.title = '此分数由 AI 根据评价内容生成'
      header.append(ai)
    }

    const content = element('p', 'njuclass-review-content', review.content || '（无文字内容）')
    item.append(header, content)
    return item
  }

  function renderEmptyReviews(body, isFiltered = false) {
    const empty = element('div', 'njuclass-modal-empty')
    empty.append(
      element('div', 'njuclass-modal-empty-icon', '✦'),
      element('strong', '', isFiltered ? '当前评分筛选下没有评价' : '这组教师还没有评价'),
      element(
        'span',
        '',
        isFiltered ? '可以换一个评分继续查看。' : '上完课后，欢迎回来留下第一条。',
      ),
    )
    body.replaceChildren(empty)
  }

  function selectOption(value, text) {
    const option = element('option', '', text)
    option.value = value
    return option
  }

  function updateFullReviewsLink(modal, context) {
    const state = modal.reviewState
    modal.fullReviewsLink.href = courseUrl(
      context.courseCode,
      context.teacherSummary.teacher,
      { rating: state.rating, sort: state.sort },
    )
  }

  function resetReviewResults(state) {
    state.loading = false
    state.page = 0
    state.total = 0
    state.seenIds.clear()
    state.view = null
  }

  function applyReviewFilters(body, context, sort, rating) {
    const modal = activeModal
    const state = modal?.reviewState
    if (!modal || !state || modal.reviewBody !== body) return
    if (state.sort === sort && state.rating === rating) return

    modal.requestToken = Symbol('review-filter-change')
    state.sort = sort
    state.rating = rating
    resetReviewResults(state)
    updateFullReviewsLink(modal, context)
    body.scrollTop = 0
    loadModalReviews(body, context, 1)
  }

  function createReviewFilters(body, context) {
    const controls = element('div', 'njuclass-modal-filters')
    const sortField = element('label', 'njuclass-filter-field')
    const sortLabel = element('span', 'njuclass-filter-label', '排序')
    const sortSelect = element('select', 'njuclass-filter-select')
    const ratingField = element('label', 'njuclass-filter-field')
    const ratingLabel = element('span', 'njuclass-filter-label', '评分')
    const ratingSelect = element('select', 'njuclass-filter-select')

    sortSelect.setAttribute('aria-label', '评价排序')
    sortSelect.setAttribute('aria-controls', body.id)
    sortSelect.append(
      selectOption('semester', '最近学期'),
      selectOption('rating', '评分最高'),
      selectOption('rating_asc', '评分最低'),
    )
    sortSelect.value = DEFAULT_EVALUATION_SORT

    ratingSelect.setAttribute('aria-label', '评分筛选')
    ratingSelect.setAttribute('aria-controls', body.id)
    ratingSelect.append(selectOption('', '全部评分'))
    for (let rating = 5; rating >= 1; rating -= 1) {
      ratingSelect.append(selectOption(String(rating), `${rating} 分`))
    }

    const onChange = () => {
      applyReviewFilters(
        body,
        context,
        sortSelect.value,
        ratingSelect.value ? Number(ratingSelect.value) : null,
      )
    }
    sortSelect.addEventListener('change', onChange)
    ratingSelect.addEventListener('change', onChange)

    sortField.append(sortLabel, sortSelect)
    ratingField.append(ratingLabel, ratingSelect)
    controls.append(sortField, ratingField)
    return controls
  }

  function createReviewView(body, context) {
    const meta = element('div', 'njuclass-modal-list-meta')
    const list = element('div', 'njuclass-review-list')
    const actions = element('div', 'njuclass-review-actions')
    const feedback = element('span', 'njuclass-review-feedback')
    const loadMore = element('button', 'njuclass-modal-load-more', '继续加载')
    const done = element('span', 'njuclass-review-done', '已显示全部评价')

    feedback.setAttribute('role', 'status')
    feedback.setAttribute('aria-live', 'polite')
    loadMore.type = 'button'
    done.hidden = true
    loadMore.addEventListener('click', () => {
      const state = activeModal?.reviewState
      if (!state || state.loading || activeModal.reviewBody !== body) return
      loadModalReviews(body, context, state.page + 1)
    })
    actions.append(loadMore, done, feedback)
    body.replaceChildren(meta, list, actions)

    return { actions, done, feedback, list, loadMore, meta }
  }

  function renderReviewPage(body, context, result, page) {
    const items = Array.isArray(result.items) ? result.items : []
    const total = Math.max(0, Number(result.total) || 0)
    const state = activeModal?.reviewState
    if (!state || activeModal.reviewBody !== body) return

    if (page === 1 && items.length === 0) {
      state.page = 1
      state.total = total
      state.seenIds.clear()
      state.view = null
      renderEmptyReviews(body, state.rating !== null)
      return
    }

    if (page === 1 || !state.view) {
      state.page = 0
      state.seenIds.clear()
      state.view = createReviewView(body, context)
    }

    const fragment = document.createDocumentFragment()
    items.forEach((review, index) => {
      const key = reviewKey(review, page, index)
      if (state.seenIds.has(key)) return
      state.seenIds.add(key)
      fragment.append(createReviewItem(review))
    })
    state.view.list.append(fragment)
    state.page = page
    state.total = total

    const loaded = state.seenIds.size
    const parsedResponsePage = Number(result.page)
    const parsedResponseSize = Number(result.size)
    const responsePage = Number.isSafeInteger(parsedResponsePage) && parsedResponsePage >= 1
      ? parsedResponsePage
      : page
    const responseSize = Number.isSafeInteger(parsedResponseSize) && parsedResponseSize >= 1
      ? parsedResponseSize
      : EVALUATIONS_PAGE_SIZE
    const exhausted = items.length === 0 || loaded >= total || responsePage * responseSize >= total
    const remaining = Math.max(0, total - loaded)

    state.view.meta.textContent = `已显示 ${loaded} 条 · 共 ${total} 条评价`
    state.view.feedback.textContent = ''
    state.view.loadMore.disabled = false
    state.view.loadMore.removeAttribute('aria-busy')
    state.view.loadMore.hidden = exhausted
    state.view.done.hidden = !exhausted
    state.view.done.textContent = loaded >= total ? '已显示全部评价' : '已加载至最后一页'
    if (!exhausted) {
      state.view.loadMore.textContent = `继续加载（剩余 ${remaining} 条）`
    }
  }

  function renderModalError(body, context) {
    const errorBox = element('div', 'njuclass-modal-empty')
    const retry = element('button', 'njuclass-modal-retry', '重新加载')
    retry.type = 'button'
    retry.addEventListener('click', () => {
      loadModalReviews(body, context, 1)
    })
    errorBox.append(
      element('div', 'njuclass-modal-empty-icon', '!'),
      element('strong', '', '评价暂时加载失败'),
      retry,
    )
    body.replaceChildren(errorBox)
  }

  function renderModalLoading(body) {
    const loading = element('div', 'njuclass-modal-loading')
    loading.setAttribute('role', 'status')
    loading.append(
      element('span', 'njuclass-modal-spinner'),
      element('span', '', '正在加载评价…'),
    )
    body.replaceChildren(loading)
  }

  function setLoadMoreLoading(state) {
    if (!state.view) return
    state.view.feedback.textContent = ''
    state.view.loadMore.hidden = false
    state.view.loadMore.disabled = true
    state.view.loadMore.setAttribute('aria-busy', 'true')
    state.view.loadMore.textContent = '正在加载…'
  }

  function renderLoadMoreError(state) {
    if (!state.view) return
    state.view.loadMore.hidden = false
    state.view.loadMore.disabled = false
    state.view.loadMore.removeAttribute('aria-busy')
    state.view.loadMore.textContent = '重试加载更多'
    state.view.feedback.textContent = '加载失败，请重试'
  }

  async function loadModalReviews(body, context, page = 1) {
    const modal = activeModal
    const state = modal?.reviewState
    if (!modal || !state || modal.reviewBody !== body || state.loading) return

    const requestToken = Symbol('review-request')
    const requestSort = state.sort
    const requestRating = state.rating
    state.loading = true
    modal.requestToken = requestToken
    body.setAttribute('aria-busy', 'true')
    if (page === 1) renderModalLoading(body)
    else setLoadMoreLoading(state)

    try {
      const result = await sendMessage({
        type: 'njuclass:get-course-evaluations',
        courseCode: context.courseCode,
        page,
        rating: requestRating,
        sort: requestSort,
        teacher: context.teacherSummary.teacher,
      })
      if (activeModal !== modal || modal.requestToken !== requestToken || !body.isConnected) return
      state.loading = false
      body.setAttribute('aria-busy', 'false')
      renderReviewPage(body, context, result, page)
    } catch {
      if (activeModal !== modal || modal.requestToken !== requestToken || !body.isConnected) return
      state.loading = false
      body.setAttribute('aria-busy', 'false')
      if (page === 1) renderModalError(body, context)
      else renderLoadMoreError(state)
    }
  }

  function openEvaluationModal(context, trigger) {
    closeModal()

    const overlay = element('div', 'njuclass-modal-overlay')
    const dialog = element('section', 'njuclass-modal')
    const header = element('header', 'njuclass-modal-header')
    const headingGroup = element('div', 'njuclass-modal-heading-group')
    const eyebrow = element('div', 'njuclass-modal-eyebrow', 'NJU 红黑榜')
    const title = element('h2', 'njuclass-modal-title', context.detail.course_name)
    const subtitle = element(
      'div',
      'njuclass-modal-subtitle',
      `${context.courseCode} · ${context.teacherSummary.teacher}`,
    )
    const close = element('button', 'njuclass-modal-close', '×')
    const body = element('div', 'njuclass-modal-body')
    body.id = 'njuclass-evaluation-dialog-body'
    const filters = createReviewFilters(body, context)
    const footer = element('footer', 'njuclass-modal-footer')
    const fullReviewsLink = externalLink(
      courseUrl(
        context.courseCode,
        context.teacherSummary.teacher,
        { sort: DEFAULT_EVALUATION_SORT },
      ),
      'njuclass-modal-link njuclass-modal-link--secondary',
      '查看完整评价',
    )
    const dialogTitleId = 'njuclass-evaluation-dialog-title'

    title.id = dialogTitleId
    close.type = 'button'
    close.setAttribute('aria-label', '关闭评价弹窗')
    dialog.setAttribute('role', 'dialog')
    dialog.setAttribute('aria-modal', 'true')
    dialog.setAttribute('aria-labelledby', dialogTitleId)
    dialog.tabIndex = -1

    headingGroup.append(eyebrow, title, subtitle)
    header.append(headingGroup, close)
    footer.append(
      fullReviewsLink,
      externalLink(
        submitUrl(context.courseCode, context.teacherSummary.teacher),
        'njuclass-modal-link njuclass-modal-link--primary',
        '写评价',
      ),
    )
    dialog.append(header, modalScore(context.teacherSummary), filters, body, footer)
    overlay.append(dialog)

    const onKeydown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        closeModal()
        return
      }

      if (event.key === 'Tab') {
        const focusable = [...dialog.querySelectorAll(
          'button:not([disabled]), a[href], select:not([disabled])',
        )]
          .filter((node) => node.getClientRects().length > 0)
        if (focusable.length === 0) {
          event.preventDefault()
          dialog.focus({ preventScroll: true })
          return
        }

        const first = focusable[0]
        const last = focusable[focusable.length - 1]
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault()
          last.focus({ preventScroll: true })
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault()
          first.focus({ preventScroll: true })
        } else if (!dialog.contains(document.activeElement)) {
          event.preventDefault()
          first.focus({ preventScroll: true })
        }
      }
    }

    const bodyElement = document.body
    const previousBodyOverflow = bodyElement.style.overflow
    activeModal = {
      body: bodyElement,
      overlay,
      previousBodyOverflow,
      fullReviewsLink,
      reviewBody: body,
      reviewState: {
        loading: false,
        page: 0,
        rating: null,
        seenIds: new Set(),
        sort: DEFAULT_EVALUATION_SORT,
        total: 0,
        view: null,
      },
      requestToken: null,
      trigger,
      onKeydown,
    }
    close.addEventListener('click', closeModal)
    overlay.addEventListener('click', (event) => {
      event.stopPropagation()
      if (event.target === overlay) closeModal()
    })
    document.addEventListener('keydown', onKeydown, true)
    bodyElement.style.overflow = 'hidden'
    bodyElement.append(overlay)
    close.focus({ preventScroll: true })

    renderModalLoading(body)
    loadModalReviews(body, context)
  }

  function cleanupRemovedUi(node) {
    if (!(node instanceof Element)) return

    if (node.matches('.njuclass-has-rating')) unmountCard(node)
    if (node.matches('.njuclass-has-row-rating')) unmountFlatRow(node)
    node.querySelectorAll('.njuclass-has-rating').forEach(unmountCard)
    node.querySelectorAll('.njuclass-has-row-rating').forEach(unmountFlatRow)
  }

  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.removedNodes.forEach(cleanupRemovedUi)
    })
    const onlyExtensionUiChanged = mutations.every((mutation) => {
      const target = mutation.target instanceof Element
        ? mutation.target
        : mutation.target.parentElement
      return Boolean(target?.closest('.njuclass-inline, .njuclass-modal-overlay'))
    })
    if (!onlyExtensionUiChanged) scheduleScan()
  })
  observer.observe(document.documentElement, {
    attributeFilter: ['data-coursenumber', 'data-number', 'title'],
    attributes: true,
    characterData: true,
    childList: true,
    subtree: true,
  })

  const runtimeOnMessage = globalThis.chrome?.runtime?.onMessage
  if (runtimeOnMessage?.addListener) {
    runtimeOnMessage.addListener((message, sender, sendResponse) => {
      if (message?.type !== 'njuclass:ping') return false
      sendResponse({
        ok: true,
        cardCount: document.querySelectorAll(
          '.njuclass-has-rating, .njuclass-has-row-rating',
        ).length,
        rowCount: document.querySelectorAll('.njuclass-has-row-rating').length,
      })
      return false
    })
  }

  scheduleScan()
})()
