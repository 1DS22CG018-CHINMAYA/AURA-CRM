import { useQueryClient, useQuery, useMutation, useQueryClient as useQC } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import { useState, useRef } from 'react'
import { Sparkles, TrendingDown, TrendingUp, CalendarDays, CheckCircle2, Clock, Check, Loader2, RefreshCw, Pencil, Trash2, Star } from 'lucide-react'
import api from '../api/client'
import { CardSkeleton, ListItemSkeleton, TaskSkeleton } from '../components/Skeleton'

function getGreeting() {
    const h = new Date().getHours()
    if (h < 12) return 'Good morning'
    if (h < 18) return 'Good afternoon'
    return 'Good evening'
}
function formatDate() {
    return new Date().toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}
function formatTime(iso) {
    return new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
}
function formatDue(iso) {
    if (!iso) return null
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function TaskCheckbox({ done, loading, onClick }) {
    return (
        <motion.button whileTap={{ scale: 0.82 }} onClick={onClick} disabled={loading}
            style={{
                width: '18px', height: '18px', borderRadius: '5px', flexShrink: 0,
                border: done ? '2px solid #7c3aed' : '2px solid #334155',
                background: done ? '#7c3aed' : 'transparent',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: loading ? 'not-allowed' : 'pointer', transition: 'all 0.2s', outline: 'none',
            }}
        >
            <AnimatePresence>
                {done && (
                    <motion.span initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0, opacity: 0 }} transition={{ duration: 0.15 }}>
                        <Check size={10} color="white" strokeWidth={3} />
                    </motion.span>
                )}
            </AnimatePresence>
        </motion.button>
    )
}

function ScoreBadge({ score }) {
    const [color, bg] = score < 30 ? ['#f87171', 'rgba(239,68,68,0.1)'] : score < 50 ? ['#fbbf24', 'rgba(245,158,11,0.1)'] : ['#34d399', 'rgba(16,185,129,0.1)']
    return <span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '999px', color, background: bg, flexShrink: 0 }}>{score}</span>
}

function PulseDot() {
    return (
        <span style={{ position: 'relative', display: 'inline-flex', width: '8px', height: '8px', flexShrink: 0 }}>
            <motion.span animate={{ scale: [1, 1.8, 1], opacity: [0.7, 0, 0.7] }} transition={{ duration: 1.5, repeat: Infinity }}
                style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: '#ef4444' }} />
            <span style={{ position: 'relative', width: '8px', height: '8px', borderRadius: '50%', background: '#ef4444' }} />
        </span>
    )
}

const listV = { hidden: {}, show: { transition: { staggerChildren: 0.06 } } }
const itemV = { hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0, transition: { duration: 0.25 } } }

export default function Dashboard({ userId, userName = 'there' }) {
    const qc = useQueryClient()

    // ── Inline task edit state ─────────────────────────────────────────────────
    const [editingId, setEditingId] = useState(null)
    const [editValue, setEditValue] = useState('')
    const inputRef = useRef(null)

    // ── Morning Briefing ──────────────────────────────────────────────────────
    const { data: briefing, isLoading: briefingLoading, refetch: refetchBriefing } = useQuery({
        queryKey: ['briefing', userId],
        enabled: Boolean(userId),
        queryFn: async () => {
            try { return (await api.get(`/users/${userId}/briefings/today`)).data }
            catch (err) { if (err.response?.status === 404) return null; throw err }
        },
    })

    const triggerMutation = useMutation({
        mutationFn: () => api.post(`/test/trigger-briefing/${userId}`),
        onSuccess: () => {
            toast.success('Briefing generated!', { description: 'Fetching your morning briefing…' })
            setTimeout(() => refetchBriefing(), 800)
        },
    })

    // ── Briefing edit/delete ────────────────────────────────────────
    const [briefingEditing, setBriefingEditing] = useState(false)
    const [briefingDraft, setBriefingDraft] = useState('')

    const saveBriefingMutation = useMutation({
        mutationFn: (content) => api.put(`/briefings/${briefing?.id}`, { content }),
        onSuccess: ({ data }) => {
            qc.setQueryData(['briefing', userId], data)
            setBriefingEditing(false)
            toast.success('Briefing updated!')
        },
        onError: () => toast.error('Failed to save briefing'),
    })

    const deleteBriefingMutation = useMutation({
        mutationFn: () => api.delete(`/briefings/${briefing?.id}`),
        onSuccess: () => {
            qc.setQueryData(['briefing', userId], null)   // instant empty-state
            toast.success('Briefing deleted')
        },
        onError: () => toast.error('Failed to delete briefing'),
    })

    function startBriefingEdit() {
        setBriefingDraft(briefing?.content ?? '')
        setBriefingEditing(true)
    }

    // ── At-risk clients (score < 50)
    const { data: atRisk = [], isLoading: atRiskLoading } = useQuery({
        queryKey: ['clients', userId, 'at-risk'],
        enabled: Boolean(userId),
        queryFn: () => api.get(`/users/${userId}/clients`, { params: { health_score_max: 49 } }).then(r => r.data),
    })

    // ── Healthy / stable clients (score ≥ 50)
    const { data: healthy = [], isLoading: healthyLoading } = useQuery({
        queryKey: ['clients', userId, 'healthy'],
        enabled: Boolean(userId),
        queryFn: () => api.get(`/users/${userId}/clients`, { params: { health_score_min: 50 } }).then(r => r.data),
    })

    // ── All tasks ─────────────────────────────────────────────────────────────
    const { data: tasks = [], isLoading: tasksLoading } = useQuery({
        queryKey: ['tasks', userId, 'today'],
        enabled: Boolean(userId),
        queryFn: () => api.get(`/users/${userId}/tasks/today`).then(r => r.data),
    })

    // ── Toggle complete / pending (optimistic, two-way) ───────────────────────
    const toggleMutation = useMutation({
        mutationFn: ({ taskId, newStatus }) => api.put(`/tasks/${taskId}`, { status: newStatus }),
        onMutate: async ({ taskId, newStatus }) => {
            await qc.cancelQueries({ queryKey: ['tasks', userId, 'today'] })
            const previous = qc.getQueryData(['tasks', userId, 'today'])
            qc.setQueryData(['tasks', userId, 'today'], (old = []) =>
                old.map(t => t.id === taskId ? { ...t, status: newStatus } : t)
            )
            return { previous }
        },
        onSuccess: (_, { newStatus }) => {
            if (newStatus === 'completed') toast.success('Task completed! ✓', { description: 'Keep up the momentum.' })
            else toast.info('Task marked as pending', { description: 'Task moved back to your list.' })
        },
        onError: (_, __, ctx) => {
            if (ctx?.previous) qc.setQueryData(['tasks', userId, 'today'], ctx.previous)
            toast.error('Failed to update task')
        },
    })

    // ── Rename task (optimistic) ───────────────────────────────────────────────
    const renameMutation = useMutation({
        mutationFn: ({ taskId, title }) => api.put(`/tasks/${taskId}`, { title }),
        onMutate: async ({ taskId, title }) => {
            await qc.cancelQueries({ queryKey: ['tasks', userId, 'today'] })
            const previous = qc.getQueryData(['tasks', userId, 'today'])
            qc.setQueryData(['tasks', userId, 'today'], (old = []) =>
                old.map(t => t.id === taskId ? { ...t, title } : t)
            )
            return { previous }
        },
        onSuccess: () => toast.success('Task renamed'),
        onError: (_, __, ctx) => {
            if (ctx?.previous) qc.setQueryData(['tasks', userId, 'today'], ctx.previous)
            toast.error('Rename failed')
        },
    })

    // ── Delete task (optimistic) ───────────────────────────────────────────────
    const deleteMutation = useMutation({
        mutationFn: (taskId) => api.delete(`/tasks/${taskId}`),
        onMutate: async (taskId) => {
            await qc.cancelQueries({ queryKey: ['tasks', userId, 'today'] })
            const previous = qc.getQueryData(['tasks', userId, 'today'])
            qc.setQueryData(['tasks', userId, 'today'], (old = []) => old.filter(t => t.id !== taskId))
            return { previous }
        },
        onSuccess: () => toast.success('Task deleted'),
        onError: (_, __, ctx) => {
            if (ctx?.previous) qc.setQueryData(['tasks', userId, 'today'], ctx.previous)
            toast.error('Delete failed')
        },
    })

    function startEdit(task) {
        setEditingId(task.id)
        setEditValue(task.title)
        setTimeout(() => inputRef.current?.focus(), 30)
    }

    function commitEdit(taskId) {
        const trimmed = editValue.trim()
        if (trimmed && trimmed !== tasks.find(t => t.id === taskId)?.title) {
            renameMutation.mutate({ taskId, title: trimmed })
        }
        setEditingId(null)
    }

    const pendingCount = tasks.filter(t => t.status !== 'completed').length
    const totalCount = tasks.length

    // Sort: pending/overdue first (earliest due_date first, nulls last), completed at bottom
    const sortedTasks = [...tasks].sort((a, b) => {
        const aDone = a.status === 'completed'
        const bDone = b.status === 'completed'
        if (aDone !== bDone) return aDone ? 1 : -1
        if (!a.due_date && !b.due_date) return 0
        if (!a.due_date) return 1
        if (!b.due_date) return -1
        return new Date(a.due_date) - new Date(b.due_date)
    })

    const card = { background: '#0c0c1d', border: '1px solid #1f1f3d', borderRadius: '16px', padding: '20px', display: 'flex', flexDirection: 'column' }

    return (
        <div style={{ padding: '32px', maxWidth: '1100px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '24px', fontFamily: 'Inter, system-ui, sans-serif' }}>

            {/* Greeting */}
            <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
                <h2 style={{ fontSize: '22px', fontWeight: 800, color: '#f1f5f9', margin: '0 0 4px', letterSpacing: '-0.02em' }}>
                    {getGreeting()},{' '}
                    <span style={{ background: 'linear-gradient(90deg, #a78bfa, #818cf8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>{userName}</span>{' '}👋
                </h2>
                <p style={{ color: '#475569', fontSize: '13px', margin: 0 }}>{formatDate()}</p>
            </motion.div>

            {/* ── Morning Briefing ── */}
            <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: 0.06 }}>
                <div style={{ padding: '1px', borderRadius: '18px', background: 'linear-gradient(135deg, #7c3aed, #6366f1, #3b82f6)' }}>
                    <div style={{ background: '#0c0c1d', borderRadius: '17px', padding: '24px' }}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px', marginBottom: '20px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'rgba(124,58,237,0.15)', border: '1px solid rgba(124,58,237,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                    <Sparkles size={16} color="#a78bfa" />
                                </div>
                                <div>
                                    <p style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#a78bfa', margin: '0 0 2px' }}>AI Generated</p>
                                    <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#f1f5f9', margin: 0 }}>Morning Briefing</h3>
                                </div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                {briefing?.generated_date && !briefingEditing && (
                                    <span style={{ fontSize: '11px', color: '#334155', display: 'flex', alignItems: 'center', gap: '4px', paddingTop: '2px', flexShrink: 0 }}>
                                        <Clock size={11} color="#334155" />{formatTime(briefing.generated_date)}
                                    </span>
                                )}
                                {briefing && !briefingEditing && (
                                    <>
                                        <button
                                            onClick={startBriefingEdit}
                                            title="Edit briefing"
                                            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '5px', borderRadius: '7px', color: '#334155', display: 'flex', transition: 'all 0.15s' }}
                                            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(99,102,241,0.12)'; e.currentTarget.style.color = '#818cf8' }}
                                            onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = '#334155' }}
                                        >
                                            <Pencil size={13} />
                                        </button>
                                        <button
                                            onClick={() => !deleteBriefingMutation.isPending && deleteBriefingMutation.mutate()}
                                            disabled={deleteBriefingMutation.isPending}
                                            title="Delete briefing"
                                            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '5px', borderRadius: '7px', color: '#334155', display: 'flex', transition: 'all 0.15s' }}
                                            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.1)'; e.currentTarget.style.color = '#f87171' }}
                                            onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = '#334155' }}
                                        >
                                            {deleteBriefingMutation.isPending ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Trash2 size={13} />}
                                        </button>
                                    </>
                                )}
                            </div>
                        </div>

                        {briefingLoading ? (
                            <CardSkeleton lines={4} />
                        ) : briefingEditing ? (
                            <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                <textarea
                                    value={briefingDraft}
                                    onChange={e => setBriefingDraft(e.target.value)}
                                    rows={6}
                                    autoFocus
                                    style={{
                                        width: '100%', background: 'rgba(124,58,237,0.06)',
                                        border: '1px solid rgba(124,58,237,0.3)', borderRadius: '10px',
                                        color: '#cbd5e1', fontSize: '13.5px', lineHeight: 1.75,
                                        padding: '12px 14px', outline: 'none', resize: 'vertical',
                                        fontFamily: 'Inter, system-ui, sans-serif', boxSizing: 'border-box',
                                    }}
                                />
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <motion.button whileTap={{ scale: 0.96 }}
                                        onClick={() => saveBriefingMutation.mutate(briefingDraft)}
                                        disabled={saveBriefingMutation.isPending || !briefingDraft.trim()}
                                        style={{
                                            padding: '7px 16px', borderRadius: '9px', border: 'none',
                                            background: saveBriefingMutation.isPending ? 'rgba(124,58,237,0.3)' : 'linear-gradient(135deg, #7c3aed, #6366f1)',
                                            color: 'white', fontSize: '12px', fontWeight: 600,
                                            cursor: saveBriefingMutation.isPending ? 'not-allowed' : 'pointer',
                                            display: 'flex', alignItems: 'center', gap: '6px', fontFamily: 'inherit',
                                        }}
                                    >
                                        {saveBriefingMutation.isPending ? <><Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> Saving…</> : 'Save'}
                                    </motion.button>
                                    <button onClick={() => setBriefingEditing(false)}
                                        style={{
                                            padding: '7px 14px', borderRadius: '9px',
                                            border: '1px solid #1f1f3d', background: 'transparent',
                                            color: '#475569', fontSize: '12px', cursor: 'pointer', fontFamily: 'inherit',
                                        }}
                                    >Cancel</button>
                                </div>
                            </motion.div>
                        ) : briefing ? (
                            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5, delay: 0.1 }}
                                style={{ color: '#94a3b8', fontSize: '13.5px', lineHeight: 1.75, margin: 0 }}
                            >
                                {briefing.content}
                            </motion.p>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '16px' }}>
                                <p style={{ color: '#475569', fontSize: '13px', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <Clock size={14} color="#334155" />
                                    No briefing generated yet today — runs automatically at <strong style={{ color: '#64748b' }}>06:00 UTC</strong>.
                                </p>
                                <motion.button
                                    whileTap={{ scale: 0.96 }}
                                    onClick={() => triggerMutation.mutate()}
                                    disabled={triggerMutation.isPending}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: '8px',
                                        padding: '10px 20px', borderRadius: '10px', border: 'none',
                                        background: triggerMutation.isPending ? 'rgba(124,58,237,0.3)' : 'linear-gradient(135deg, #7c3aed, #6366f1)',
                                        color: 'white', fontSize: '13px', fontWeight: 600,
                                        cursor: triggerMutation.isPending ? 'not-allowed' : 'pointer',
                                        boxShadow: triggerMutation.isPending ? 'none' : '0 4px 16px rgba(124,58,237,0.3)',
                                        transition: 'all 0.2s', fontFamily: 'inherit',
                                    }}
                                >
                                    {triggerMutation.isPending
                                        ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Generating…</>
                                        : <><RefreshCw size={14} /> Generate Today's Briefing</>
                                    }
                                </motion.button>
                            </div>
                        )}
                    </div>
                </div>
            </motion.div>

            {/* ── Two-column: [At-Risk + Stable] left, [All Tasks] right ── */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>

                {/* At-Risk Clients */}
                <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: 0.12 }} style={card}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <div style={{ width: '28px', height: '28px', borderRadius: '8px', background: 'rgba(239,68,68,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <TrendingDown size={14} color="#f87171" />
                            </div>
                            <h3 style={{ fontSize: '13px', fontWeight: 600, color: '#e2e8f0', margin: 0 }}>At-Risk Clients</h3>
                        </div>
                        <span style={{ fontSize: '11px', fontWeight: 600, color: '#f87171', background: 'rgba(239,68,68,0.1)', padding: '3px 10px', borderRadius: '999px' }}>score &lt; 50</span>
                    </div>

                    {atRiskLoading ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>{[0, 1, 2].map(i => <ListItemSkeleton key={i} />)}</div>
                    ) : atRisk.length === 0 ? (
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '28px 0', textAlign: 'center' }}>
                            <div style={{ width: '40px', height: '40px', borderRadius: '12px', background: 'rgba(16,185,129,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '12px' }}>
                                <CheckCircle2 size={20} color="#34d399" />
                            </div>
                            <p style={{ color: '#94a3b8', fontSize: '13px', fontWeight: 500, margin: '0 0 4px' }}>All clients healthy!</p>
                            <p style={{ color: '#334155', fontSize: '12px', margin: 0 }}>No clients below score 50</p>
                        </div>
                    ) : (
                        <motion.ul variants={listV} initial="hidden" animate="show" style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '2px' }}>
                            {atRisk.map(client => (
                                <motion.li key={client.id} variants={itemV}
                                    style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 12px', borderRadius: '12px', cursor: 'pointer', transition: 'background 0.15s' }}
                                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')}
                                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                                >
                                    <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 700, color: '#fca5a5', flexShrink: 0 }}>
                                        {client.name[0]?.toUpperCase()}
                                    </div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <p style={{ fontSize: '13px', color: '#e2e8f0', fontWeight: 500, margin: '0 0 2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{client.name}</p>
                                        <p style={{ fontSize: '11px', color: '#334155', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{client.company}</p>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                                        {client.health_score < 30 && <PulseDot />}
                                        <ScoreBadge score={client.health_score} />
                                    </div>
                                </motion.li>
                            ))}
                        </motion.ul>
                    )}
                </motion.div>

                {/* Stable / Healthy Clients */}
                <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: 0.16 }} style={card}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <div style={{ width: '28px', height: '28px', borderRadius: '8px', background: 'rgba(16,185,129,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <TrendingUp size={14} color="#34d399" />
                            </div>
                            <h3 style={{ fontSize: '13px', fontWeight: 600, color: '#e2e8f0', margin: 0 }}>Stable Accounts</h3>
                        </div>
                        <span style={{ fontSize: '11px', fontWeight: 600, color: '#34d399', background: 'rgba(16,185,129,0.1)', padding: '3px 10px', borderRadius: '999px' }}>score ≥ 50</span>
                    </div>

                    {healthyLoading ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>{[0, 1, 2].map(i => <ListItemSkeleton key={i} />)}</div>
                    ) : healthy.length === 0 ? (
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '28px 0', textAlign: 'center' }}>
                            <div style={{ width: '40px', height: '40px', borderRadius: '12px', background: 'rgba(99,102,241,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '12px' }}>
                                <TrendingUp size={20} color="#818cf8" />
                            </div>
                            <p style={{ color: '#94a3b8', fontSize: '13px', fontWeight: 500, margin: '0 0 4px' }}>No healthy clients yet</p>
                            <p style={{ color: '#334155', fontSize: '12px', margin: 0 }}>Process meeting notes to improve scores</p>
                        </div>
                    ) : (
                        <motion.ul variants={listV} initial="hidden" animate="show" style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '2px' }}>
                            {healthy.map(client => (
                                <motion.li key={client.id} variants={itemV}
                                    style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 12px', borderRadius: '12px', cursor: 'pointer', transition: 'background 0.15s' }}
                                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(16,185,129,0.04)')}
                                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                                >
                                    <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 700, color: '#6ee7b7', flexShrink: 0 }}>
                                        {client.name[0]?.toUpperCase()}
                                    </div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <p style={{ fontSize: '13px', color: '#e2e8f0', fontWeight: 500, margin: '0 0 2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{client.name}</p>
                                        <p style={{ fontSize: '11px', color: '#334155', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{client.company}</p>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                                        {client.health_score >= 90 && (
                                            <Star size={11} color="#fbbf24" fill="#fbbf24" />
                                        )}
                                        <ScoreBadge score={client.health_score} />
                                    </div>
                                </motion.li>
                            ))}
                        </motion.ul>
                    )}
                </motion.div>

                {/* All Tasks */}
                <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: 0.18 }} style={{ ...card, maxHeight: '520px', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', flexShrink: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <div style={{ width: '28px', height: '28px', borderRadius: '8px', background: 'rgba(99,102,241,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <CalendarDays size={14} color="#818cf8" />
                            </div>
                            <h3 style={{ fontSize: '13px', fontWeight: 600, color: '#e2e8f0', margin: 0 }}>All Tasks</h3>
                        </div>
                        {!tasksLoading && tasks.length > 0 && (
                            <span style={{ fontSize: '11px', color: '#475569' }}>
                                {pendingCount} pending · {totalCount} total
                            </span>
                        )}
                    </div>

                    {tasksLoading ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>{[0, 1, 2, 3].map(i => <TaskSkeleton key={i} />)}</div>
                    ) : tasks.length === 0 ? (
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '32px 0', textAlign: 'center' }}>
                            <div style={{ width: '40px', height: '40px', borderRadius: '12px', background: 'rgba(99,102,241,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '12px' }}>
                                <CheckCircle2 size={20} color="#818cf8" />
                            </div>
                            <p style={{ color: '#94a3b8', fontSize: '13px', fontWeight: 500, margin: '0 0 4px' }}>No tasks yet!</p>
                            <p style={{ color: '#334155', fontSize: '12px', margin: 0 }}>Process meeting notes to generate tasks</p>
                        </div>
                    ) : (
                        <div style={{ flex: 1, overflowY: 'auto', marginRight: '-4px', paddingRight: '4px' }}>
                            <motion.ul
                                layout
                                variants={listV} initial="hidden" animate="show"
                                style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '2px' }}
                            >
                                <AnimatePresence mode="popLayout">
                                    {sortedTasks.map(task => {
                                        const done = task.status === 'completed'
                                        const isToggling = toggleMutation.isPending && toggleMutation.variables?.taskId === task.id
                                        const isDeleting = deleteMutation.isPending && deleteMutation.variables === task.id
                                        const isEditing = editingId === task.id
                                        return (
                                            <motion.li
                                                key={task.id}
                                                layout
                                                layoutId={`task-${task.id}`}
                                                variants={itemV}
                                                exit={{ opacity: 0, height: 0, marginBottom: 0, paddingTop: 0, paddingBottom: 0 }}
                                                transition={{ layout: { type: 'spring', stiffness: 350, damping: 30 }, exit: { duration: 0.22 } }}
                                                className="task-row"
                                                style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 8px', borderRadius: '10px', position: 'relative' }}
                                                onMouseEnter={e => {
                                                    e.currentTarget.style.background = 'rgba(255,255,255,0.03)'
                                                    e.currentTarget.querySelectorAll('.task-action').forEach(el => el.style.opacity = '1')
                                                }}
                                                onMouseLeave={e => {
                                                    e.currentTarget.style.background = 'transparent'
                                                    e.currentTarget.querySelectorAll('.task-action').forEach(el => el.style.opacity = '0')
                                                }}
                                            >
                                                {/* Checkbox */}
                                                <TaskCheckbox
                                                    done={done}
                                                    loading={isToggling}
                                                    onClick={() => !isToggling && !isEditing && toggleMutation.mutate({
                                                        taskId: task.id,
                                                        newStatus: done ? 'pending' : 'completed',
                                                    })}
                                                />

                                                {/* Title — edit mode vs display mode */}
                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                    {isEditing ? (
                                                        <input
                                                            ref={inputRef}
                                                            value={editValue}
                                                            onChange={e => setEditValue(e.target.value)}
                                                            onBlur={() => commitEdit(task.id)}
                                                            onKeyDown={e => {
                                                                if (e.key === 'Enter') commitEdit(task.id)
                                                                if (e.key === 'Escape') setEditingId(null)
                                                            }}
                                                            style={{
                                                                width: '100%', background: 'rgba(124,58,237,0.1)',
                                                                border: '1px solid rgba(124,58,237,0.4)', borderRadius: '6px',
                                                                color: '#f1f5f9', fontSize: '13px', padding: '3px 8px',
                                                                outline: 'none', fontFamily: 'inherit',
                                                            }}
                                                        />
                                                    ) : (
                                                        <p style={{
                                                            fontSize: '13px', margin: '0 0 1px', lineHeight: 1.4,
                                                            color: done ? '#334155' : '#cbd5e1',
                                                            textDecoration: done ? 'line-through' : 'none',
                                                            transition: 'color 0.3s',
                                                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                                        }}
                                                            title={task.title}>
                                                            {task.title}
                                                        </p>
                                                    )}
                                                    {task.due_date && !isEditing && (
                                                        <p style={{ fontSize: '11px', margin: 0, color: done ? '#1e293b' : '#334155' }}>
                                                            Due {formatDue(task.due_date)}
                                                        </p>
                                                    )}
                                                </div>

                                                {/* Overdue badge */}
                                                {task.status === 'overdue' && !done && (
                                                    <span style={{ fontSize: '10px', fontWeight: 600, color: '#fbbf24', background: 'rgba(245,158,11,0.1)', padding: '2px 6px', borderRadius: '4px', flexShrink: 0 }}>Overdue</span>
                                                )}

                                                {/* Action icons — only visible on row hover */}
                                                {!isEditing && (
                                                    <div style={{ display: 'flex', gap: '2px', flexShrink: 0 }}>
                                                        <button
                                                            className="task-action"
                                                            onClick={() => startEdit(task)}
                                                            style={{
                                                                opacity: 0, transition: 'opacity 0.15s',
                                                                background: 'none', border: 'none', cursor: 'pointer',
                                                                padding: '4px', borderRadius: '6px', color: '#475569',
                                                                display: 'flex', alignItems: 'center',
                                                            }}
                                                            title="Rename task"
                                                            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(99,102,241,0.12)'; e.currentTarget.style.color = '#818cf8' }}
                                                            onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = '#475569' }}
                                                        >
                                                            <Pencil size={12} />
                                                        </button>
                                                        <button
                                                            className="task-action"
                                                            onClick={() => !isDeleting && deleteMutation.mutate(task.id)}
                                                            disabled={isDeleting}
                                                            style={{
                                                                opacity: 0, transition: 'opacity 0.15s',
                                                                background: 'none', border: 'none', cursor: isDeleting ? 'not-allowed' : 'pointer',
                                                                padding: '4px', borderRadius: '6px', color: '#475569',
                                                                display: 'flex', alignItems: 'center',
                                                            }}
                                                            title="Delete task"
                                                            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.1)'; e.currentTarget.style.color = '#f87171' }}
                                                            onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = '#475569' }}
                                                        >
                                                            {isDeleting ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Trash2 size={12} />}
                                                        </button>
                                                    </div>
                                                )}
                                            </motion.li>
                                        )
                                    })}
                                </AnimatePresence>
                            </motion.ul>
                        </div>
                    )}
                </motion.div>
            </div>
            <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
        </div>
    )
}
