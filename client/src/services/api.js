import axios from 'axios'

const configuredURL = import.meta.env.VITE_API_URL?.trim()
const baseURL = configuredURL || (import.meta.env.DEV ? 'http://localhost:5000/api' : null)
if (!baseURL) throw new Error('VITE_API_URL is required for the production client.')

const api = axios.create({
  baseURL,
  timeout: 45000,
})

export default api
