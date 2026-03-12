import axios from 'axios'
import { toast } from 'sonner'

/**
 * Default timeout (ms) for all API calls.
 * 120 000 = 2 minutes — covers Ollama inference on first load.
 * Override per-request with { timeout: NO_TIMEOUT } for the brain-dump
 * endpoint, which may take 3-5 min when the embedding model is cold.
 */
const DEFAULT_TIMEOUT = Number(import.meta.env.VITE_API_TIMEOUT) || 120_000

/** Pass as { timeout: NO_TIMEOUT } to disable the timeout entirely. */
export const NO_TIMEOUT = 0

/**
 * Global Axios instance pointing at the FastAPI backend.
 *
 * Error interceptor
 * -----------------
 * • HTTP 404  → silently rejected (callers render empty/placeholder states)
 * • Timeout   → friendly toast explaining the model may be loading
 * • Everything else → generic error toast
 * • Per-request opt-out: { suppressToast: true }
 */
const api = axios.create({
    baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8000',
    timeout: DEFAULT_TIMEOUT,
    headers: { 'Content-Type': 'application/json' },
})

api.interceptors.response.use(
    (response) => response,
    (error) => {
        const status = error.response?.status
        const suppressed = error.config?.suppressToast
        const isTimeout = error.code === 'ECONNABORTED' || error.message?.includes('timeout')

        if (!suppressed) {
            if (status === 404) {
                // Expected "not found" — callers handle empty states
                return Promise.reject(error)
            }

            if (isTimeout) {
                toast.error('Request timed out', {
                    description: 'The AI model may still be loading. Try again in 30 seconds.',
                    duration: 8000,
                })
            } else {
                const detail = error.response?.data?.detail ?? error.message ?? 'An unexpected error occurred.'
                toast.error('API Error', { description: String(detail), duration: 5000 })
            }
        }

        return Promise.reject(error)
    }
)

export default api
