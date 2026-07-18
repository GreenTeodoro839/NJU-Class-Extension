importScripts('core.js')

const API_ORIGIN = 'https://njuclass.zcec.top'
const DETAIL_TTL_MS = 5 * 60 * 1000
const EVALUATIONS_TTL_MS = 2 * 60 * 1000
const EVALUATIONS_PAGE_SIZE = 5
const EVALUATION_SORTS = new Set(['rating', 'rating_asc', 'semester'])
const DEFAULT_EVALUATION_SORT = 'semester'
const REQUEST_TIMEOUT_MS = 10 * 1000
const responseCache = new Map()

class PublicApiError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'PublicApiError'
    this.code = code
  }
}

function cached(key, ttlMs, loader) {
  const now = Date.now()
  const current = responseCache.get(key)

  if (current && current.expiresAt > now) return current.promise

  const promise = loader().catch((error) => {
    responseCache.delete(key)
    throw error
  })

  responseCache.set(key, { expiresAt: now + ttlMs, promise })
  return promise
}

async function fetchJson(path) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  try {
    const response = await fetch(`${API_ORIGIN}${path}`, {
      cache: 'no-store',
      credentials: 'omit',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    })

    if (response.status === 404) {
      throw new PublicApiError('not_found', '课程未收录')
    }
    if (!response.ok) {
      throw new PublicApiError('server_error', `API 请求失败（${response.status}）`)
    }

    return await response.json()
  } catch (error) {
    if (error instanceof PublicApiError) throw error
    if (error && error.name === 'AbortError') {
      throw new PublicApiError('timeout', '请求超时')
    }
    throw new PublicApiError('network_error', '网络请求失败')
  } finally {
    clearTimeout(timer)
  }
}

function normalizeCourseCode(value) {
  const courseCode = typeof value === 'string' ? value.trim() : ''
  if (!NjuClassCore.isValidCourseCode(courseCode)) {
    throw new PublicApiError('invalid_request', '课程号格式无效')
  }
  return courseCode
}

function normalizeTeacher(value) {
  const teacher = typeof value === 'string' ? value.trim() : ''
  if (!teacher || teacher.length > 500 || NjuClassCore.splitTeacherNames(teacher).length === 0) {
    throw new PublicApiError('invalid_request', '教师信息无效')
  }
  return teacher
}

function normalizePage(value) {
  const page = value === undefined ? 1 : Number(value)
  if (!Number.isSafeInteger(page) || page < 1) {
    throw new PublicApiError('invalid_request', '评价页码无效')
  }
  return page
}

function normalizeEvaluationSort(value) {
  const sort = value === undefined ? DEFAULT_EVALUATION_SORT : value
  if (typeof sort !== 'string' || !EVALUATION_SORTS.has(sort)) {
    throw new PublicApiError('invalid_request', '评价排序方式无效')
  }
  return sort
}

function normalizeRatingFilter(value) {
  if (value === undefined || value === null || value === '') return null

  const rating = Number(value)
  if (!Number.isSafeInteger(rating) || rating < 1 || rating > 5) {
    throw new PublicApiError('invalid_request', '评分筛选无效')
  }
  return rating
}

function getCourseDetail(courseCode) {
  const normalizedCode = normalizeCourseCode(courseCode)
  const key = `detail:${normalizedCode}`

  return cached(key, DETAIL_TTL_MS, async () => {
    const detail = await fetchJson(`/api/courses/${encodeURIComponent(normalizedCode)}`)
    if (!detail || !Array.isArray(detail.teachers)) {
      throw new PublicApiError('invalid_response', '课程数据格式异常')
    }
    return detail
  })
}

function getCourseEvaluations(
  courseCode,
  teacher,
  page = 1,
  sort = DEFAULT_EVALUATION_SORT,
  rating = null,
) {
  const normalizedCode = normalizeCourseCode(courseCode)
  const normalizedTeacher = normalizeTeacher(teacher)
  const normalizedPage = normalizePage(page)
  const normalizedSort = normalizeEvaluationSort(sort)
  const normalizedRating = normalizeRatingFilter(rating)
  const key = `evaluations:${JSON.stringify([
    normalizedCode,
    normalizedTeacher,
    normalizedSort,
    normalizedRating ?? 'all',
    normalizedPage,
    EVALUATIONS_PAGE_SIZE,
  ])}`

  return cached(key, EVALUATIONS_TTL_MS, async () => {
    const params = new URLSearchParams({
      teacher: normalizedTeacher,
      sort: normalizedSort,
      page: String(normalizedPage),
      size: String(EVALUATIONS_PAGE_SIZE),
    })
    if (normalizedRating !== null) params.set('rating', String(normalizedRating))
    const result = await fetchJson(
      `/api/courses/${encodeURIComponent(normalizedCode)}/evaluations?${params.toString()}`,
    )
    if (!result || !Array.isArray(result.items)) {
      throw new PublicApiError('invalid_response', '评价数据格式异常')
    }
    return result
  })
}

async function handleMessage(message) {
  if (!message || typeof message !== 'object') {
    throw new PublicApiError('invalid_request', '请求格式无效')
  }

  if (message.type === 'njuclass:get-course-detail') {
    return getCourseDetail(message.courseCode)
  }
  if (message.type === 'njuclass:get-course-evaluations') {
    return getCourseEvaluations(
      message.courseCode,
      message.teacher,
      message.page,
      message.sort,
      message.rating,
    )
  }

  throw new PublicApiError('invalid_request', '未知请求')
}

function publicError(error) {
  if (error instanceof PublicApiError) {
    return { code: error.code, message: error.message }
  }
  return { code: 'unknown_error', message: '未知错误' }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.id && sender.id !== chrome.runtime.id) return false

  handleMessage(message)
    .then((data) => sendResponse({ ok: true, data }))
    .catch((error) => sendResponse({ ok: false, error: publicError(error) }))

  return true
})
