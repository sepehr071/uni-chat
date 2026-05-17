import api from './api'

export async function listSeries() {
  const response = await api.get('/series')
  return response.data
}

export async function createSeries({ name, email_tone } = {}) {
  const response = await api.post('/series', {
    name,
    email_tone: email_tone ?? 'formal',
  })
  return response.data
}

export async function updateSeries(id, patch) {
  const response = await api.patch(`/series/${id}`, patch)
  return response.data
}

export async function deleteSeries(id) {
  const response = await api.delete(`/series/${id}`)
  return response.data
}

export async function listKeyterms(seriesId, source) {
  const params = {}
  if (source) params.source = source
  const response = await api.get(`/series/${seriesId}/keyterms`, { params })
  return response.data
}

export async function addKeyterm(seriesId, term) {
  const response = await api.post(`/series/${seriesId}/keyterms`, { term })
  return response.data
}

export async function acceptKeyterm(seriesId, termId) {
  const response = await api.post(
    `/series/${seriesId}/keyterms/${termId}/accept`
  )
  return response.data
}

export async function rejectKeyterm(seriesId, termId) {
  const response = await api.delete(
    `/series/${seriesId}/keyterms/${termId}`
  )
  return response.data
}

export async function listSeriesSpeakerNames(seriesId) {
  const response = await api.get(`/series/${seriesId}/speaker-names`)
  return response.data
}
