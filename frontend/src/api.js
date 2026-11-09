import axios from 'axios'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://127.0.0.1:5000/api',
  timeout: 15000,
})

export const getAssetUrl = (value) => {
  if (!value) return ''
  try {
    return new URL(value, api.defaults.baseURL).toString()
  } catch {
    return value
  }
}

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('smart-news-token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

export const getErrorMessage = (error) =>
  error.response?.data?.message || error.message || 'Something went wrong. Please try again.'

export default api
