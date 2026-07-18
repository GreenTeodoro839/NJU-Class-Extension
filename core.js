;(function attachNjuClassCore(root, factory) {
  const api = factory()

  if (typeof module === 'object' && module.exports) {
    module.exports = api
  }

  root.NjuClassCore = api
})(typeof globalThis === 'undefined' ? this : globalThis, function createNjuClassCore() {
  'use strict'

  const TEACHER_SEPARATOR = /[,，、/;；\n]+/
  const COURSE_CODE_PATTERN = /^[0-9A-Za-z_-]{1,64}$/

  function splitTeacherNames(value) {
    if (typeof value !== 'string') return []

    return [...new Set(
      value
        .split(TEACHER_SEPARATOR)
        .map((name) => name.trim())
        .filter(Boolean),
    )]
  }

  function sameTeacherSet(left, right) {
    const leftNames = splitTeacherNames(left)
    const rightNames = splitTeacherNames(right)

    if (leftNames.length === 0 || leftNames.length !== rightNames.length) return false

    const rightSet = new Set(rightNames)
    return leftNames.every((name) => rightSet.has(name))
  }

  function findExactTeacherCandidate(candidates, rawTeacher) {
    if (!Array.isArray(candidates)) return null

    const matches = candidates.filter(
      (candidate) => candidate && sameTeacherSet(candidate.teacher, rawTeacher),
    )

    return matches.length === 1 ? matches[0] : null
  }

  function isValidCourseCode(value) {
    return typeof value === 'string' && COURSE_CODE_PATTERN.test(value.trim())
  }

  function formatRating(value) {
    if (value === null || value === undefined || value === '') return null
    const rating = Number(value)
    return Number.isFinite(rating) ? rating.toFixed(1) : null
  }

  function buildCourseUrl(siteOrigin, courseCode, teacher = '', filters = {}) {
    const origin = String(siteOrigin || '').replace(/\/+$/, '')
    const code = String(courseCode || '').trim()
    const baseUrl = `${origin}/courses/${encodeURIComponent(code)}`
    const normalizedTeacher = typeof teacher === 'string' ? teacher.trim() : ''
    const sort = typeof filters?.sort === 'string' ? filters.sort.trim() : ''
    const rating = Number(filters?.rating)
    const params = new URLSearchParams()

    if (normalizedTeacher) params.set('teacher', normalizedTeacher)
    if (['rating', 'rating_asc', 'semester'].includes(sort)) params.set('sort', sort)
    if (Number.isSafeInteger(rating) && rating >= 1 && rating <= 5) {
      params.set('rating', String(rating))
    }

    const query = params.toString()
    return query ? `${baseUrl}?${query}` : baseUrl
  }

  return Object.freeze({
    buildCourseUrl,
    findExactTeacherCandidate,
    formatRating,
    isValidCourseCode,
    sameTeacherSet,
    splitTeacherNames,
  })
})
