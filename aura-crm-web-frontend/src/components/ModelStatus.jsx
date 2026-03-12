import { useQuery } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { Cpu, CheckCircle2, Loader2, AlertTriangle } from 'lucide-react'
import api from '../api/client'

/**
 * React Query hook — polls GET /api/model-status every 4 s until ready.
 *
 * Returns:
 *   ready: true  → model is loaded, brain dump is available
 *   ready: false → model is still warming up
 *   ready: null  → unknown (first fetch pending)
 */
export function useModelStatus() {
    const { data, isLoading } = useQuery({
        queryKey: ['model-status'],
        queryFn: () =>
            api.get('/api/model-status', { suppressToast: true })
                .then(r => r.data)
                .catch(() => ({ ready: false })),
        // Poll every 4 s while not ready, stop once ready
        refetchInterval: (query) => query.state.data?.ready ? false : 4_000,
        staleTime: 0,
        gcTime: 0,
        retry: 3,
    })

    return {
        ready: data?.ready ?? null,   // null = still checking
        isLoading,
    }
}

/**
 * A full-width warm-up banner rendered inside the Brain Dump panel.
 * Fades away automatically once models are ready.
 */
export function ModelWarmupBanner({ onDismiss }) {
    const { ready } = useModelStatus()

    return (
        <AnimatePresence>
            {ready === false && (
                <motion.div
                    initial={{ opacity: 0, height: 0, marginBottom: 0 }}
                    animate={{ opacity: 1, height: 'auto', marginBottom: '16px' }}
                    exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                    transition={{ duration: 0.35 }}
                    style={{
                        background: 'rgba(245,158,11,0.06)',
                        border: '1px solid rgba(245,158,11,0.2)',
                        borderRadius: '12px',
                        padding: '14px 16px',
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '12px',
                        overflow: 'hidden',
                        fontFamily: 'Inter, system-ui, sans-serif',
                    }}
                >
                    {/* Animated icon */}
                    <div style={{
                        width: '32px', height: '32px', borderRadius: '8px',
                        background: 'rgba(245,158,11,0.1)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    }}>
                        <Loader2 size={16} color="#fbbf24" style={{ animation: 'spin 1.2s linear infinite' }} />
                    </div>

                    <div style={{ flex: 1 }}>
                        <p style={{ fontSize: '13px', fontWeight: 600, color: '#fbbf24', margin: '0 0 4px' }}>
                            AI Engine warming up…
                        </p>
                        <p style={{ fontSize: '12px', color: '#92400e', margin: 0, lineHeight: 1.55 }}>
                            The HuggingFace embedding model is loading into memory (takes ~30–120 s on first use,
                            faster on subsequent server restarts). You can still submit notes — they will queue
                            and process once the model is ready.
                        </p>
                    </div>

                    {/* Animated dots */}
                    <div style={{ display: 'flex', gap: '4px', alignItems: 'center', paddingTop: '2px', flexShrink: 0 }}>
                        {[0, 1, 2].map(i => (
                            <motion.span
                                key={i}
                                animate={{ opacity: [0.3, 1, 0.3] }}
                                transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }}
                                style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#fbbf24', display: 'block' }}
                            />
                        ))}
                    </div>
                </motion.div>
            )}

            {ready === true && (
                <motion.div
                    key="ready"
                    initial={{ opacity: 0, height: 0, marginBottom: 0 }}
                    animate={{ opacity: 1, height: 'auto', marginBottom: '16px' }}
                    exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                    transition={{ duration: 0.3 }}
                    onAnimationComplete={() => setTimeout(onDismiss, 2000)}  // auto-dismiss after 2s
                    style={{
                        background: 'rgba(16,185,129,0.06)',
                        border: '1px solid rgba(16,185,129,0.2)',
                        borderRadius: '12px',
                        padding: '12px 16px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        overflow: 'hidden',
                        fontFamily: 'Inter, system-ui, sans-serif',
                    }}
                >
                    <CheckCircle2 size={16} color="#34d399" />
                    <p style={{ fontSize: '13px', fontWeight: 500, color: '#34d399', margin: 0 }}>
                        AI Engine ready — all models loaded ✓
                    </p>
                </motion.div>
            )}
        </AnimatePresence>
    )
}

/**
 * Small header badge shown in Layout's top bar — indicates model readiness at a glance.
 */
export function ModelStatusBadge() {
    const { ready, isLoading } = useModelStatus()

    if (isLoading || ready === null) return null

    return (
        <AnimatePresence>
            {!ready && (
                <motion.div
                    initial={{ opacity: 0, x: 8 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 8 }}
                    style={{
                        display: 'flex', alignItems: 'center', gap: '5px',
                        padding: '4px 10px', borderRadius: '8px',
                        background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.2)',
                        fontSize: '11px', fontWeight: 600, color: '#fbbf24', flexShrink: 0,
                    }}
                >
                    <Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} />
                    Models warming up
                </motion.div>
            )}
            {ready && (
                <motion.div
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    style={{
                        display: 'flex', alignItems: 'center', gap: '5px',
                        padding: '4px 10px', borderRadius: '8px',
                        background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.15)',
                        fontSize: '11px', fontWeight: 600, color: '#34d399', flexShrink: 0,
                    }}
                >
                    <CheckCircle2 size={11} />
                    AI Ready
                </motion.div>
            )}
        </AnimatePresence>
    )
}
