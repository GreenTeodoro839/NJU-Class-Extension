;(function installNjuClassUserscriptTransport() {
  'use strict'

  const currentLocation = globalThis.location
  if (currentLocation && (
    currentLocation.origin !== 'https://xk.nju.edu.cn'
    || !currentLocation.pathname?.startsWith('/xsxkapp/')
  )) return

  const { isValidCourseCode, splitTeacherNames } = globalThis.NjuClassCore || {}
  if (!isValidCourseCode || !splitTeacherNames) return

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

  function runGmRequest(options) {
    if (typeof GM_xmlhttpRequest === 'function') {
      return GM_xmlhttpRequest(options)
    }
    throw new PublicApiError('userscript_error', '油猴跨域请求权限不可用')
  }

  function responseJson(response) {
    if (response?.response && typeof response.response === 'object') {
      return response.response
    }

    const raw = typeof response?.response === 'string'
      ? response.response
      : response?.responseText
    if (typeof raw !== 'string' || raw.trim() === '') {
      throw new PublicApiError('invalid_response', 'API 返回数据格式异常')
    }

    try {
      return JSON.parse(raw)
    } catch {
      throw new PublicApiError('invalid_response', 'API 返回数据格式异常')
    }
  }

  function fetchJson(path) {
    return new Promise((resolve, reject) => {
      let requestHandle = null
      let settled = false
      const finish = (action) => {
        if (settled) return
        settled = true
        clearTimeout(watchdog)
        action()
      }
      const watchdog = setTimeout(() => {
        if (settled) return
        settled = true
        requestHandle?.abort?.()
        reject(new PublicApiError('timeout', '请求超时'))
      }, REQUEST_TIMEOUT_MS)

      try {
        requestHandle = runGmRequest({
          method: 'GET',
          url: `${API_ORIGIN}${path}`,
          anonymous: true,
          headers: { Accept: 'application/json' },
          nocache: true,
          responseType: 'json',
          timeout: REQUEST_TIMEOUT_MS,
          onload(response) {
            finish(() => {
              if (response.status === 404) {
                reject(new PublicApiError('not_found', '课程未收录'))
                return
              }
              if (response.status < 200 || response.status >= 300) {
                reject(new PublicApiError('server_error', `API 请求失败（${response.status}）`))
                return
              }

              try {
                resolve(responseJson(response))
              } catch (error) {
                reject(error)
              }
            })
          },
          ontimeout() {
            finish(() => reject(new PublicApiError('timeout', '请求超时')))
          },
          onerror() {
            finish(() => reject(new PublicApiError('network_error', '网络请求失败')))
          },
          onabort() {
            finish(() => reject(new PublicApiError('network_error', '网络请求失败')))
          },
        })
      } catch (error) {
        finish(() => {
          reject(
            error instanceof PublicApiError
              ? error
              : new PublicApiError('network_error', '网络请求失败'),
          )
        })
      }
    })
  }

  function normalizeCourseCode(value) {
    const courseCode = typeof value === 'string' ? value.trim() : ''
    if (!isValidCourseCode(courseCode)) {
      throw new PublicApiError('invalid_request', '课程号格式无效')
    }
    return courseCode
  }

  function normalizeTeacher(value) {
    const teacher = typeof value === 'string' ? value.trim() : ''
    if (!teacher || teacher.length > 500 || splitTeacherNames(teacher).length === 0) {
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

  globalThis.NjuClassRequest = handleMessage
})()
