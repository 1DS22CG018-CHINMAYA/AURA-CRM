import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import { Users, Plus, X, Brain, CheckCircle2, Check, Loader2, ChevronRight, Building2, FileText, ListChecks, History, Pencil, Trash2, AlertTriangle } from 'lucide-react'
import api, { NO_TIMEOUT } from '../api/client'
import { ListItemSkeleton, CardSkeleton, TaskSkeleton } from '../components/Skeleton'
import { ModelWarmupBanner, useModelStatus } from '../components/ModelStatus'
import MarkdownRenderer from '../components/MarkdownRenderer'


// ─── Edit-Client Modal ────────────────────────────────────────────────────────
function EditClientModal({ client, onClose, onSaved }) {
    const [name, setName] = useState(client.name)
    const [company, setCompany] = useState(client.company)

    const updateMutation = useMutation({
        mutationFn: () => api.put(`/clients/${client.id}`, { name: name.trim(), company: company.trim() }),
        onSuccess: ({ data }) => {
            toast.success('Client updated!')
            onSaved(data)
            onClose()
        },
    })

    const inputStyle = {
        width: '100%', padding: '10px 13px', borderRadius: '10px',
        border: '1px solid #1f1f3d', background: 'rgba(19,19,43,0.8)',
        color: '#f1f5f9', fontSize: '13px', outline: 'none',
        transition: 'border-color 0.2s', fontFamily: 'Inter, system-ui, sans-serif', boxSizing: 'border-box',
    }

    return (
        <div style={{
            position: 'fixed', inset: 0, zIndex: 200,
            background: 'rgba(5,5,15,0.85)', backdropFilter: 'blur(8px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px',
        }} onClick={onClose}>
            <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 12 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 8 }}
                transition={{ duration: 0.2 }}
                onClick={e => e.stopPropagation()}
                style={{ background: '#0c0c1d', border: '1px solid #1f1f3d', borderRadius: '20px', padding: '28px', width: '100%', maxWidth: '420px', fontFamily: 'Inter, system-ui, sans-serif' }}
            >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{ width: '32px', height: '32px', borderRadius: '10px', background: 'rgba(124,58,237,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Pencil size={14} color="#a78bfa" />
                        </div>
                        <h2 style={{ fontSize: '15px', fontWeight: 700, color: '#f1f5f9', margin: 0 }}>Edit Client</h2>
                    </div>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#475569', padding: '4px', display: 'flex' }}>
                        <X size={18} />
                    </button>
                </div>

                <form onSubmit={e => { e.preventDefault(); updateMutation.mutate() }} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    <div>
                        <label style={{ display: 'block', fontSize: '11px', fontWeight: 500, color: '#64748b', marginBottom: '6px', letterSpacing: '0.04em' }}>Client Name</label>
                        <input value={name} onChange={e => setName(e.target.value)} required style={inputStyle}
                            onFocus={e => (e.target.style.borderColor = 'rgba(124,58,237,0.6)')}
                            onBlur={e => (e.target.style.borderColor = '#1f1f3d')}
                        />
                    </div>
                    <div>
                        <label style={{ display: 'block', fontSize: '11px', fontWeight: 500, color: '#64748b', marginBottom: '6px', letterSpacing: '0.04em' }}>Company</label>
                        <input value={company} onChange={e => setCompany(e.target.value)} required style={inputStyle}
                            onFocus={e => (e.target.style.borderColor = 'rgba(124,58,237,0.6)')}
                            onBlur={e => (e.target.style.borderColor = '#1f1f3d')}
                        />
                    </div>
                    <motion.button type="submit" disabled={updateMutation.isPending} whileTap={{ scale: 0.97 }}
                        style={{
                            padding: '11px', borderRadius: '10px', border: 'none', marginTop: '4px',
                            background: updateMutation.isPending ? 'rgba(124,58,237,0.3)' : 'linear-gradient(135deg, #7c3aed, #6366f1)',
                            color: 'white', fontSize: '13px', fontWeight: 600,
                            cursor: updateMutation.isPending ? 'not-allowed' : 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontFamily: 'inherit',
                        }}
                    >
                        {updateMutation.isPending ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Saving…</> : 'Save Changes'}
                    </motion.button>
                </form>
            </motion.div>
        </div>
    )
}

// ─── Delete-Client Confirmation ───────────────────────────────────────────────
function DeleteClientConfirm({ client, onClose, onDeleted }) {
    const deleteMutation = useMutation({
        mutationFn: () => api.delete(`/clients/${client.id}`),
        onSuccess: () => {
            toast.success(`"${client.name}" deleted`, { description: 'All tasks and notes were also removed.' })
            onDeleted()
            onClose()
        },
    })

    return (
        <div style={{
            position: 'fixed', inset: 0, zIndex: 200,
            background: 'rgba(5,5,15,0.85)', backdropFilter: 'blur(8px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px',
        }} onClick={onClose}>
            <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 12 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 8 }}
                transition={{ duration: 0.2 }}
                onClick={e => e.stopPropagation()}
                style={{ background: '#0c0c1d', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '20px', padding: '28px', width: '100%', maxWidth: '400px', fontFamily: 'Inter, system-ui, sans-serif' }}
            >
                {/* Icon + title */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', marginBottom: '24px', gap: '12px' }}>
                    <div style={{ width: '48px', height: '48px', borderRadius: '14px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <AlertTriangle size={22} color="#f87171" />
                    </div>
                    <div>
                        <h2 style={{ fontSize: '16px', fontWeight: 700, color: '#f1f5f9', margin: '0 0 8px' }}>Delete Client?</h2>
                        <p style={{ fontSize: '13px', color: '#64748b', margin: 0, lineHeight: 1.6 }}>
                            Are you sure you want to delete <strong style={{ color: '#94a3b8' }}>{client.name}</strong>?
                            <br />This will permanently remove all their <strong style={{ color: '#94a3b8' }}>tasks and meeting notes</strong>.
                            <br /><span style={{ color: '#f87171', fontWeight: 600 }}>This cannot be undone.</span>
                        </p>
                    </div>
                </div>

                <div style={{ display: 'flex', gap: '10px' }}>
                    <button onClick={onClose}
                        style={{
                            flex: 1, padding: '11px', borderRadius: '10px',
                            border: '1px solid #1f1f3d', background: 'transparent', color: '#94a3b8',
                            fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                        }}
                    >
                        Cancel
                    </button>
                    <motion.button
                        whileTap={{ scale: 0.97 }}
                        onClick={() => deleteMutation.mutate()}
                        disabled={deleteMutation.isPending}
                        style={{
                            flex: 1, padding: '11px', borderRadius: '10px', border: 'none',
                            background: deleteMutation.isPending ? 'rgba(239,68,68,0.3)' : 'linear-gradient(135deg, #dc2626, #b91c1c)',
                            color: 'white', fontSize: '13px', fontWeight: 600,
                            cursor: deleteMutation.isPending ? 'not-allowed' : 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontFamily: 'inherit',
                            boxShadow: deleteMutation.isPending ? 'none' : '0 4px 16px rgba(220,38,38,0.3)',
                        }}
                    >
                        {deleteMutation.isPending
                            ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Deleting…</>
                            : <><Trash2 size={14} /> Yes, Delete</>}
                    </motion.button>
                </div>
            </motion.div>
        </div>
    )
}

// ─── Add-Client Modal ─────────────────────────────────────────────────────────
function AddClientModal({ userId, onClose, onCreated }) {
    const [name, setName] = useState('')
    const [company, setCompany] = useState('')

    const createMutation = useMutation({
        mutationFn: () => api.post('/clients/', { user_id: userId, name: name.trim(), company: company.trim() }),
        onSuccess: ({ data }) => {
            toast.success(`Client "${data.name}" added!`)
            onCreated(data)
            onClose()
        },
    })

    const inputStyle = {
        width: '100%', padding: '10px 13px', borderRadius: '10px',
        border: '1px solid #1f1f3d', background: 'rgba(19,19,43,0.8)',
        color: '#f1f5f9', fontSize: '13px', outline: 'none',
        transition: 'border-color 0.2s', fontFamily: 'Inter, system-ui, sans-serif',
    }

    return (
        <div style={{
            position: 'fixed', inset: 0, zIndex: 100,
            background: 'rgba(5,5,15,0.8)', backdropFilter: 'blur(8px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px',
        }} onClick={onClose}>
            <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 16 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 8 }}
                transition={{ duration: 0.2 }}
                onClick={e => e.stopPropagation()}
                style={{ background: '#0c0c1d', border: '1px solid #1f1f3d', borderRadius: '20px', padding: '28px', width: '100%', maxWidth: '420px', fontFamily: 'Inter, system-ui, sans-serif' }}
            >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
                    <h2 style={{ fontSize: '16px', fontWeight: 700, color: '#f1f5f9', margin: 0 }}>Add New Client</h2>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#475569', padding: '4px', display: 'flex' }}>
                        <X size={18} />
                    </button>
                </div>

                <form onSubmit={e => { e.preventDefault(); createMutation.mutate() }} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    <div>
                        <label style={{ display: 'block', fontSize: '11px', fontWeight: 500, color: '#64748b', marginBottom: '6px', letterSpacing: '0.04em' }}>Client Name</label>
                        <input value={name} onChange={e => setName(e.target.value)} placeholder="Sarah Johnson" required
                            style={inputStyle}
                            onFocus={e => (e.target.style.borderColor = 'rgba(124,58,237,0.6)')}
                            onBlur={e => (e.target.style.borderColor = '#1f1f3d')}
                        />
                    </div>
                    <div>
                        <label style={{ display: 'block', fontSize: '11px', fontWeight: 500, color: '#64748b', marginBottom: '6px', letterSpacing: '0.04em' }}>Company</label>
                        <input value={company} onChange={e => setCompany(e.target.value)} placeholder="Acme Corp" required
                            style={inputStyle}
                            onFocus={e => (e.target.style.borderColor = 'rgba(124,58,237,0.6)')}
                            onBlur={e => (e.target.style.borderColor = '#1f1f3d')}
                        />
                    </div>
                    <motion.button type="submit" disabled={createMutation.isPending} whileTap={{ scale: 0.97 }}
                        style={{
                            padding: '11px', borderRadius: '10px', border: 'none', marginTop: '4px',
                            background: createMutation.isPending ? 'rgba(124,58,237,0.3)' : 'linear-gradient(135deg, #7c3aed, #6366f1)',
                            color: 'white', fontSize: '13px', fontWeight: 600, cursor: createMutation.isPending ? 'not-allowed' : 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                            fontFamily: 'inherit',
                        }}
                    >
                        {createMutation.isPending ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Creating…</> : <><Plus size={14} /> Add Client</>}
                    </motion.button>
                </form>
            </motion.div>
        </div>
    )
}

// ─── Client Task Panel ────────────────────────────────────────────────────────
function ClientTaskPanel({ client, userId }) {
    const qc = useQueryClient()
    const [editingId, setEditingId] = useState(null)
    const [editValue, setEditValue] = useState('')
    const inputRef = useRef(null)

    // ── Add-task form state
    const [showAddForm, setShowAddForm] = useState(false)
    const [newTitle, setNewTitle] = useState('')
    const [newDue, setNewDue] = useState('')

    const { data: tasks = [], isLoading } = useQuery({
        queryKey: ['client-tasks', client.id],
        queryFn: () => api.get(`/clients/${client.id}/tasks`).then(r => r.data),
    })

    // ── Toggle status (optimistic) ──────────────────────────────────────────
    const toggleMutation = useMutation({
        mutationFn: ({ taskId, newStatus }) => api.put(`/tasks/${taskId}`, { status: newStatus }),
        onMutate: async ({ taskId, newStatus }) => {
            await qc.cancelQueries({ queryKey: ['client-tasks', client.id] })
            const prev = qc.getQueryData(['client-tasks', client.id])
            qc.setQueryData(['client-tasks', client.id], (old = []) =>
                old.map(t => t.id === taskId ? { ...t, status: newStatus } : t)
            )
            // keep global dashboard in sync too
            qc.setQueryData(['tasks', userId, 'today'], (old = []) =>
                old?.map(t => t.id === taskId ? { ...t, status: newStatus } : t)
            )
            return { prev }
        },
        onSuccess: (_, { newStatus }) => {
            if (newStatus === 'completed') toast.success('Task completed! ✓')
            else toast.info('Task marked as pending')
        },
        onError: (_, __, ctx) => {
            if (ctx?.prev) qc.setQueryData(['client-tasks', client.id], ctx.prev)
            toast.error('Failed to update task')
        },
    })

    // ── Rename (optimistic) ─────────────────────────────────────────────
    const renameMutation = useMutation({
        mutationFn: ({ taskId, title }) => api.put(`/tasks/${taskId}`, { title }),
        onMutate: async ({ taskId, title }) => {
            await qc.cancelQueries({ queryKey: ['client-tasks', client.id] })
            const prev = qc.getQueryData(['client-tasks', client.id])
            qc.setQueryData(['client-tasks', client.id], (old = []) =>
                old.map(t => t.id === taskId ? { ...t, title } : t)
            )
            return { prev }
        },
        onSuccess: () => toast.success('Task renamed'),
        onError: (_, __, ctx) => {
            if (ctx?.prev) qc.setQueryData(['client-tasks', client.id], ctx.prev)
            toast.error('Rename failed')
        },
    })

    // ── Delete (optimistic) ──────────────────────────────────────────────
    const deleteMutation = useMutation({
        mutationFn: (taskId) => api.delete(`/tasks/${taskId}`),
        onMutate: async (taskId) => {
            await qc.cancelQueries({ queryKey: ['client-tasks', client.id] })
            const prev = qc.getQueryData(['client-tasks', client.id])
            qc.setQueryData(['client-tasks', client.id], (old = []) => old.filter(t => t.id !== taskId))
            // remove from global list too
            qc.setQueryData(['tasks', userId, 'today'], (old = []) => old?.filter(t => t.id !== taskId))
            return { prev }
        },
        onSuccess: () => toast.success('Task deleted'),
        onError: (_, __, ctx) => {
            if (ctx?.prev) qc.setQueryData(['client-tasks', client.id], ctx.prev)
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
        const original = tasks.find(t => t.id === taskId)?.title
        if (trimmed && trimmed !== original) renameMutation.mutate({ taskId, title: trimmed })
        setEditingId(null)
    }

    // ── Create (manual)
    const createMutation = useMutation({
        mutationFn: ({ title, due_date }) =>
            api.post(`/clients/${client.id}/tasks`, { title, due_date: due_date || null }),
        onSuccess: ({ data }) => {
            qc.setQueryData(['client-tasks', client.id], (old = []) => [data, ...old])
            qc.invalidateQueries({ queryKey: ['client-tasks', client.id] })
            qc.invalidateQueries({ queryKey: ['tasks', userId, 'today'] })
            toast.success('Task created!')
            setNewTitle('')
            setNewDue('')
            setShowAddForm(false)
        },
        onError: () => toast.error('Failed to create task'),
    })

    function submitNewTask(e) {
        e.preventDefault()
        const trimmed = newTitle.trim()
        if (!trimmed) return
        const due_date = newDue ? new Date(newDue).toISOString() : null
        createMutation.mutate({ title: trimmed, due_date })
    }

    function formatDue(iso) {
        if (!iso) return null
        const d = new Date(iso)
        const now = new Date()
        const diffDays = Math.floor((d - now) / 86_400_000)
        if (diffDays < 0) return `Overdue · ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
        if (diffDays === 0) return 'Due today'
        if (diffDays === 1) return 'Due tomorrow'
        return `Due ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
    }

    // Client-side resort: pending first, completed last
    const sortedTasks = [...tasks].sort((a, b) => {
        const aDone = a.status === 'completed'
        const bDone = b.status === 'completed'
        if (aDone !== bDone) return aDone ? 1 : -1
        if (!a.due_date && !b.due_date) return 0
        if (!a.due_date) return 1
        if (!b.due_date) return -1
        return new Date(a.due_date) - new Date(b.due_date)
    })

    const pendingCount = tasks.filter(t => t.status !== 'completed').length

    return (
        <div style={{
            display: 'flex', flexDirection: 'column', height: '100%',
            background: '#0a0a1a', borderLeft: '1px solid #1f1f3d',
        }}>
            {/* Header */}
            <div style={{
                padding: '20px 20px 16px',
                borderBottom: '1px solid #1f1f3d',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                flexShrink: 0,
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ width: '26px', height: '26px', borderRadius: '8px', background: 'rgba(16,185,129,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <ListChecks size={13} color="#34d399" />
                    </div>
                    <h3 style={{ fontSize: '13px', fontWeight: 600, color: '#e2e8f0', margin: 0 }}>Client Tasks</h3>
                </div>
                {!isLoading && tasks.length > 0 && (
                    <span style={{ fontSize: '11px', color: '#334155' }}>
                        {pendingCount} pending · {tasks.length} total
                    </span>
                )}
                <motion.button
                    whileTap={{ scale: 0.92 }}
                    onClick={() => setShowAddForm(s => !s)}
                    style={{
                        display: 'flex', alignItems: 'center', gap: '4px',
                        padding: '5px 10px', borderRadius: '7px', border: '1px solid rgba(124,58,237,0.2)',
                        background: showAddForm ? 'rgba(124,58,237,0.15)' : 'rgba(124,58,237,0.07)',
                        color: '#a78bfa', fontSize: '11px', fontWeight: 600,
                        cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s',
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(124,58,237,0.18)'}
                    onMouseLeave={e => e.currentTarget.style.background = showAddForm ? 'rgba(124,58,237,0.15)' : 'rgba(124,58,237,0.07)'}
                >
                    <Plus size={11} /> Add Task
                </motion.button>
            </div>

            {/* Inline add-task form */}
            <AnimatePresence>
                {showAddForm && (
                    <motion.form
                        key="add-task-form"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.22, ease: 'easeInOut' }}
                        onSubmit={submitNewTask}
                        style={{ overflow: 'hidden', borderBottom: '1px solid #1f1f3d', flexShrink: 0 }}
                    >
                        <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <input
                                autoFocus
                                value={newTitle}
                                onChange={e => setNewTitle(e.target.value)}
                                placeholder="Task title…"
                                style={{
                                    width: '100%', padding: '8px 11px', borderRadius: '8px',
                                    border: '1px solid rgba(124,58,237,0.3)',
                                    background: 'rgba(124,58,237,0.06)',
                                    color: '#f1f5f9', fontSize: '12.5px', outline: 'none',
                                    fontFamily: 'Inter, system-ui, sans-serif', boxSizing: 'border-box',
                                }}
                                onFocus={e => (e.target.style.borderColor = 'rgba(124,58,237,0.55)')}
                                onBlur={e => (e.target.style.borderColor = 'rgba(124,58,237,0.3)')}
                            />
                            <input
                                type="date"
                                value={newDue}
                                onChange={e => setNewDue(e.target.value)}
                                style={{
                                    width: '100%', padding: '7px 11px', borderRadius: '8px',
                                    border: '1px solid #1f1f3d', background: '#0a0a1a',
                                    color: '#64748b', fontSize: '12px', outline: 'none',
                                    fontFamily: 'Inter, system-ui, sans-serif', boxSizing: 'border-box',
                                    colorScheme: 'dark',
                                }}
                                onFocus={e => (e.target.style.borderColor = 'rgba(124,58,237,0.4)')}
                                onBlur={e => (e.target.style.borderColor = '#1f1f3d')}
                            />
                            <div style={{ display: 'flex', gap: '6px' }}>
                                <motion.button
                                    type="submit"
                                    whileTap={{ scale: 0.95 }}
                                    disabled={createMutation.isPending || !newTitle.trim()}
                                    style={{
                                        flex: 1, padding: '7px', borderRadius: '8px', border: 'none',
                                        background: createMutation.isPending || !newTitle.trim()
                                            ? 'rgba(124,58,237,0.15)'
                                            : 'linear-gradient(135deg, #7c3aed, #6366f1)',
                                        color: createMutation.isPending || !newTitle.trim() ? '#475569' : 'white',
                                        fontSize: '12px', fontWeight: 600,
                                        cursor: createMutation.isPending || !newTitle.trim() ? 'not-allowed' : 'pointer',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px',
                                        fontFamily: 'inherit', transition: 'all 0.2s',
                                    }}
                                >
                                    {createMutation.isPending
                                        ? <><Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} /> Saving…</>
                                        : 'Save Task'
                                    }
                                </motion.button>
                                <button
                                    type="button"
                                    onClick={() => { setShowAddForm(false); setNewTitle(''); setNewDue('') }}
                                    style={{
                                        padding: '7px 12px', borderRadius: '8px',
                                        border: '1px solid #1f1f3d', background: 'transparent',
                                        color: '#475569', fontSize: '12px', cursor: 'pointer', fontFamily: 'inherit',
                                    }}
                                >Cancel</button>
                            </div>
                        </div>
                    </motion.form>
                )}
            </AnimatePresence>

            {/* Task list */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '8px 12px' }}>
                {isLoading ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', padding: '12px 4px' }}>
                        {[0, 1, 2, 3].map(i => <TaskSkeleton key={i} />)}
                    </div>
                ) : tasks.length === 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: '200px', textAlign: 'center' }}>
                        <div style={{ width: '40px', height: '40px', borderRadius: '12px', background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '12px' }}>
                            <CheckCircle2 size={18} color="#34d399" />
                        </div>
                        <p style={{ color: '#475569', fontSize: '12px', fontWeight: 500, margin: '0 0 4px' }}>No tasks yet</p>
                        <p style={{ color: '#334155', fontSize: '11px', margin: 0 }}>Process notes to generate tasks for {client.name}</p>
                    </div>
                ) : (
                    <motion.ul
                        layout
                        style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '1px' }}
                    >
                        <AnimatePresence mode="popLayout">
                            {sortedTasks.map(task => {
                                const done = task.status === 'completed'
                                const isToggling = toggleMutation.isPending && toggleMutation.variables?.taskId === task.id
                                const isDeleting = deleteMutation.isPending && deleteMutation.variables === task.id
                                const isEditing = editingId === task.id
                                const dueStr = formatDue(task.due_date)
                                const isOverdue = dueStr?.startsWith('Overdue')

                                return (
                                    <motion.li
                                        key={task.id}
                                        layout
                                        layoutId={`ct-${task.id}`}
                                        initial={{ opacity: 0, x: 8 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        exit={{ opacity: 0, height: 0, paddingTop: 0, paddingBottom: 0 }}
                                        transition={{ layout: { type: 'spring', stiffness: 350, damping: 30 }, exit: { duration: 0.2 } }}
                                        style={{ display: 'flex', alignItems: 'flex-start', gap: '9px', padding: '9px 8px', borderRadius: '10px', position: 'relative' }}
                                        onMouseEnter={e => {
                                            e.currentTarget.style.background = 'rgba(255,255,255,0.025)'
                                            e.currentTarget.querySelectorAll('.ct-action').forEach(el => el.style.opacity = '1')
                                        }}
                                        onMouseLeave={e => {
                                            e.currentTarget.style.background = 'transparent'
                                            e.currentTarget.querySelectorAll('.ct-action').forEach(el => el.style.opacity = '0')
                                        }}
                                    >
                                        {/* Checkbox */}
                                        <motion.button
                                            whileTap={{ scale: 0.82 }}
                                            onClick={() => !isToggling && !isEditing && toggleMutation.mutate({
                                                taskId: task.id, newStatus: done ? 'pending' : 'completed'
                                            })}
                                            disabled={isToggling}
                                            style={{
                                                width: '16px', height: '16px', borderRadius: '4px', flexShrink: 0, marginTop: '2px',
                                                border: done ? '2px solid #7c3aed' : '2px solid #334155',
                                                background: done ? '#7c3aed' : 'transparent',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                cursor: isToggling ? 'not-allowed' : 'pointer',
                                                transition: 'all 0.2s', outline: 'none',
                                            }}
                                        >
                                            <AnimatePresence>
                                                {done && (
                                                    <motion.span
                                                        initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0, opacity: 0 }}
                                                        transition={{ duration: 0.12 }}
                                                    >
                                                        <Check size={9} color="white" strokeWidth={3} />
                                                    </motion.span>
                                                )}
                                            </AnimatePresence>
                                        </motion.button>

                                        {/* Title + due date */}
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
                                                        border: '1px solid rgba(124,58,237,0.4)', borderRadius: '5px',
                                                        color: '#f1f5f9', fontSize: '12px', padding: '2px 7px',
                                                        outline: 'none', fontFamily: 'inherit',
                                                    }}
                                                />
                                            ) : (
                                                <p style={{
                                                    fontSize: '12.5px', margin: '0 0 2px', lineHeight: 1.4,
                                                    color: done ? '#334155' : '#cbd5e1',
                                                    textDecoration: done ? 'line-through' : 'none',
                                                    transition: 'color 0.3s',
                                                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                                }}>
                                                    {task.title}
                                                </p>
                                            )}
                                            {task.due_date && !isEditing && (
                                                <p style={{
                                                    fontSize: '10.5px', margin: 0,
                                                    color: done ? '#1e293b' : isOverdue ? '#fbbf24' : '#334155',
                                                    fontWeight: isOverdue ? 600 : 400,
                                                }}>
                                                    {dueStr}
                                                </p>
                                            )}
                                        </div>

                                        {/* Hover actions */}
                                        {!isEditing && (
                                            <div style={{ display: 'flex', gap: '2px', flexShrink: 0 }}>
                                                <button
                                                    className="ct-action"
                                                    onClick={() => startEdit(task)}
                                                    style={{
                                                        opacity: 0, transition: 'opacity 0.15s',
                                                        background: 'none', border: 'none', cursor: 'pointer',
                                                        padding: '3px', borderRadius: '5px', color: '#475569',
                                                        display: 'flex', alignItems: 'center',
                                                    }}
                                                    title="Rename"
                                                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(99,102,241,0.12)'; e.currentTarget.style.color = '#818cf8' }}
                                                    onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = '#475569' }}
                                                >
                                                    <Pencil size={11} />
                                                </button>
                                                <button
                                                    className="ct-action"
                                                    onClick={() => !isDeleting && deleteMutation.mutate(task.id)}
                                                    disabled={isDeleting}
                                                    style={{
                                                        opacity: 0, transition: 'opacity 0.15s',
                                                        background: 'none', border: 'none', cursor: isDeleting ? 'not-allowed' : 'pointer',
                                                        padding: '3px', borderRadius: '5px', color: '#475569',
                                                        display: 'flex', alignItems: 'center',
                                                    }}
                                                    title="Delete"
                                                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.1)'; e.currentTarget.style.color = '#f87171' }}
                                                    onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = '#475569' }}
                                                >
                                                    {isDeleting
                                                        ? <Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} />
                                                        : <Trash2 size={11} />}
                                                </button>
                                            </div>
                                        )}
                                    </motion.li>
                                )
                            })}
                        </AnimatePresence>
                    </motion.ul>
                )}
            </div>
        </div>
    )
}

// ─── Brain Dump Panel ─────────────────────────────────────────────────────────
function BrainDumpPanel({ client, userId }) {
    const qc = useQueryClient()
    const [notes, setNotes] = useState('')
    const [result, setResult] = useState(null)     // { summary, tasks }
    const [showBanner, setShowBanner] = useState(true)
    const { ready: modelsReady } = useModelStatus()

    // Fetch existing notes for this client (Meeting History)
    const { data: noteHistory = [], isLoading: historyLoading } = useQuery({
        queryKey: ['notes', client.id],
        queryFn: () => api.get(`/clients/${client.id}/notes`).then(r => r.data),
    })

    const processMutation = useMutation({
        mutationFn: () => api.post(
            `/clients/${client.id}/notes/process`,
            { raw_text: notes },
            { timeout: NO_TIMEOUT }   // No timeout — model load + inference can take 3-5 min
        ),
        onSuccess: ({ data }) => {
            setResult(data)
            setNotes('')
            toast.success('AI Processing Complete!', { description: `Extracted ${data.tasks.length} tasks from your notes.` })
            // Instantly refresh both the notes feed and the dashboard task list
            qc.invalidateQueries({ queryKey: ['notes', client.id] })
            qc.invalidateQueries({ queryKey: ['tasks', userId, 'today'] })
            qc.invalidateQueries({ queryKey: ['client-tasks', client.id] })
        },
    })

    function formatRelative(iso) {
        const d = new Date(iso)
        const now = new Date()
        const diffMs = now - d
        const diffDays = Math.floor(diffMs / 86_400_000)
        if (diffDays === 0) return 'Today'
        if (diffDays === 1) return 'Yesterday'
        if (diffDays < 7) return `${diffDays} days ago`
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

            {/* Model warmup banner — auto-dismisses when ready */}
            {showBanner && <ModelWarmupBanner onDismiss={() => setShowBanner(false)} />}

            {/* Client badge */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', paddingBottom: '20px', borderBottom: '1px solid #1f1f3d' }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '12px', background: 'linear-gradient(135deg, rgba(124,58,237,0.2), rgba(99,102,241,0.2))', border: '1px solid rgba(124,58,237,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', fontWeight: 700, color: '#a78bfa', flexShrink: 0 }}>
                    {client.name[0]?.toUpperCase()}
                </div>
                <div>
                    <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#f1f5f9', margin: '0 0 2px' }}>{client.name}</h3>
                    <p style={{ fontSize: '12px', color: '#475569', margin: 0, display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Building2 size={11} /> {client.company}
                    </p>
                </div>
            </div>

            {/* Textarea */}
            <div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 500, color: '#64748b', marginBottom: '10px', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                    <FileText size={12} /> Meeting Notes (Brain Dump)
                </label>
                <textarea
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    placeholder={`Paste your raw meeting notes here for ${client.name}...\n\nExample:\n"Discussed Q4 budget. Client wants weekly status updates. Follow up needed with engineering team by Friday. Budget approved for $50k marketing spend."`}
                    rows={8}
                    style={{
                        width: '100%', padding: '14px', borderRadius: '12px',
                        border: '1px solid #1f1f3d', background: 'rgba(19,19,43,0.6)',
                        color: '#e2e8f0', fontSize: '13px', lineHeight: 1.7,
                        outline: 'none', resize: 'vertical', transition: 'border-color 0.2s',
                        fontFamily: 'Inter, system-ui, sans-serif',
                        boxSizing: 'border-box',
                    }}
                    onFocus={e => (e.target.style.borderColor = 'rgba(124,58,237,0.5)')}
                    onBlur={e => (e.target.style.borderColor = '#1f1f3d')}
                />
            </div>

            {/* Process button */}
            <motion.button
                whileTap={{ scale: 0.97 }}
                disabled={!notes.trim() || processMutation.isPending}
                onClick={() => processMutation.mutate()}
                style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px',
                    padding: '14px 24px', borderRadius: '12px', border: 'none',
                    background: !notes.trim() || processMutation.isPending
                        ? 'rgba(124,58,237,0.25)'
                        : 'linear-gradient(135deg, #7c3aed, #6366f1)',
                    color: !notes.trim() ? '#4c3888' : 'white',
                    fontSize: '14px', fontWeight: 600, cursor: !notes.trim() || processMutation.isPending ? 'not-allowed' : 'pointer',
                    boxShadow: notes.trim() && !processMutation.isPending ? '0 4px 20px rgba(124,58,237,0.35)' : 'none',
                    transition: 'all 0.2s', fontFamily: 'inherit',
                }}
            >
                {processMutation.isPending
                    ? <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
                        {modelsReady === false ? 'Waiting for models to load…' : 'AI is processing your notes…'}
                    </>
                    : <><Brain size={16} /> Process Notes with AI</>
                }
            </motion.button>

            {/* Skeleton while AI processes */}
            <AnimatePresence>
                {processMutation.isPending && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                        style={{ background: 'rgba(124,58,237,0.05)', border: '1px solid rgba(124,58,237,0.15)', borderRadius: '12px', padding: '20px', overflow: 'hidden' }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#7c3aed', animation: 'pulse 1.5s ease-in-out infinite' }} />
                            <p style={{ fontSize: '12px', color: '#7c3aed', fontWeight: 500, margin: 0 }}>
                                {modelsReady === false
                                    ? 'HuggingFace models still loading — your request is queued and will process automatically…'
                                    : 'LangGraph pipeline running: extracting tasks and generating summary…'
                                }
                            </p>
                        </div>
                        <CardSkeleton lines={3} />
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Instant AI results (latest run) */}
            <AnimatePresence>
                {result && !processMutation.isPending && (
                    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.35 }}
                        style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}
                    >
                        {/* Summary card */}
                        <div style={{ background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.15)', borderRadius: '12px', padding: '18px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
                                <FileText size={14} color="#818cf8" />
                                <h4 style={{ fontSize: '12px', fontWeight: 600, color: '#818cf8', margin: 0, textTransform: 'uppercase', letterSpacing: '0.08em' }}>AI Summary</h4>
                            </div>
                            <MarkdownRenderer prose="#94a3b8" accent="#818cf8">
                                {result.summary}
                            </MarkdownRenderer>
                        </div>

                        {/* Tasks card */}
                        {result.tasks?.length > 0 && (
                            <div style={{ background: 'rgba(16,185,129,0.05)', border: '1px solid rgba(16,185,129,0.15)', borderRadius: '12px', padding: '18px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
                                    <ListChecks size={14} color="#34d399" />
                                    <h4 style={{ fontSize: '12px', fontWeight: 600, color: '#34d399', margin: 0, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                                        Extracted Tasks ({result.tasks.length})
                                    </h4>
                                </div>
                                <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    {result.tasks.map((task, i) => (
                                        <motion.li key={task.id ?? i}
                                            initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.07 }}
                                            style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '10px 12px', background: 'rgba(255,255,255,0.03)', borderRadius: '8px' }}
                                        >
                                            <CheckCircle2 size={14} color="#34d399" style={{ marginTop: '1px', flexShrink: 0 }} />
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <p style={{ fontSize: '13px', color: '#e2e8f0', margin: '0 0 2px', fontWeight: 500 }}>{task.title}</p>
                                                {task.due_date && (
                                                    <p style={{ fontSize: '11px', color: '#475569', margin: 0 }}>
                                                        Due: {new Date(task.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                                    </p>
                                                )}
                                            </div>
                                        </motion.li>
                                    ))}
                                </ul>
                            </div>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ── Meeting History feed ──────────────────────────────────────── */}
            <div style={{ marginTop: '8px', paddingTop: '24px', borderTop: '1px solid #1f1f3d' }}>
                {/* Section header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                    <div style={{ width: '26px', height: '26px', borderRadius: '8px', background: 'rgba(99,102,241,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <History size={13} color="#818cf8" />
                    </div>
                    <h3 style={{ fontSize: '13px', fontWeight: 600, color: '#94a3b8', margin: 0 }}>
                        Meeting History
                    </h3>
                    {!historyLoading && (
                        <span style={{ marginLeft: 'auto', fontSize: '11px', color: '#334155' }}>
                            {noteHistory.length} session{noteHistory.length !== 1 ? 's' : ''}
                        </span>
                    )}
                </div>

                {/* Notes feed */}
                {historyLoading ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {[0, 1, 2].map(i => (
                            <div key={i} style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid #1f1f3d', borderRadius: '12px', padding: '16px' }}>
                                <CardSkeleton lines={3} />
                            </div>
                        ))}
                    </div>
                ) : noteHistory.length === 0 ? (
                    <div style={{ padding: '32px 0', textAlign: 'center' }}>
                        <FileText size={24} color="#1f1f3d" style={{ marginBottom: '10px' }} />
                        <p style={{ fontSize: '13px', color: '#334155', margin: 0 }}>
                            No sessions yet — process your first brain dump above.
                        </p>
                    </div>
                ) : (
                    /* Timeline-style feed */
                    <div style={{ position: 'relative' }}>
                        {/* Vertical line */}
                        <div style={{
                            position: 'absolute', left: '11px', top: '8px',
                            bottom: '8px', width: '1px',
                            background: 'linear-gradient(to bottom, #1f1f3d, transparent)',
                        }} />

                        <motion.div
                            variants={{ hidden: {}, show: { transition: { staggerChildren: 0.06 } } }}
                            initial="hidden" animate="show"
                            style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}
                        >
                            {noteHistory.map((note, i) => (
                                <motion.div
                                    key={note.id}
                                    variants={{ hidden: { opacity: 0, x: -10 }, show: { opacity: 1, x: 0, transition: { duration: 0.25 } } }}
                                    style={{ display: 'flex', gap: '16px', alignItems: 'flex-start' }}
                                >
                                    {/* Timeline dot */}
                                    <div style={{
                                        width: '22px', height: '22px', borderRadius: '50%', flexShrink: 0,
                                        background: i === 0 ? 'linear-gradient(135deg, #7c3aed, #6366f1)' : '#13132b',
                                        border: `2px solid ${i === 0 ? '#7c3aed' : '#1f1f3d'}`,
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        boxShadow: i === 0 ? '0 0 12px rgba(124,58,237,0.4)' : 'none',
                                        zIndex: 1,
                                    }}>
                                        {i === 0 && <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'white' }} />}
                                    </div>

                                    {/* Note card */}
                                    <div style={{
                                        flex: 1, background: i === 0 ? 'rgba(124,58,237,0.04)' : 'rgba(255,255,255,0.02)',
                                        border: `1px solid ${i === 0 ? 'rgba(124,58,237,0.15)' : '#1a1a2e'}`,
                                        borderRadius: '12px', padding: '14px 16px',
                                        transition: 'border-color 0.15s',
                                    }}
                                        onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(124,58,237,0.2)')}
                                        onMouseLeave={e => (e.currentTarget.style.borderColor = i === 0 ? 'rgba(124,58,237,0.15)' : '#1a1a2e')}
                                    >
                                        {/* Date row */}
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                                            <span style={{
                                                fontSize: '11px', fontWeight: 600,
                                                color: i === 0 ? '#a78bfa' : '#475569',
                                                textTransform: 'uppercase', letterSpacing: '0.06em',
                                            }}>
                                                {formatRelative(note.created_at)}
                                            </span>
                                            <span style={{ fontSize: '10px', color: '#334155' }}>
                                                {new Date(note.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                                            </span>
                                        </div>

                                        {/* Summary text */}
                                        <MarkdownRenderer
                                            prose={i === 0 ? '#94a3b8' : '#64748b'}
                                            accent={i === 0 ? '#a78bfa' : '#6366f1'}
                                        >
                                            {note.summary || 'No summary available.'}
                                        </MarkdownRenderer>
                                    </div>
                                </motion.div>
                            ))}
                        </motion.div>
                    </div>
                )}
            </div>
        </div>
    )
}

// ─── Clients page ─────────────────────────────────────────────────────────────
export default function Clients({ userId }) {
    const qc = useQueryClient()
    const [selected, setSelected] = useState(null)
    const [showModal, setShowModal] = useState(false)
    const [editClient, setEditClient] = useState(null)   // client object → show EditModal
    const [delClient, setDelClient] = useState(null)   // client object → show DeleteConfirm

    const { data: clients = [], isLoading } = useQuery({
        queryKey: ['clients', userId, 'all'],
        enabled: Boolean(userId),
        queryFn: () => api.get(`/users/${userId}/clients`).then(r => r.data),
    })

    function handleCreated(newClient) {
        qc.setQueryData(['clients', userId, 'all'], old => [newClient, ...(old ?? [])])
        setSelected(newClient)
        // Keep Dashboard at-risk widget in sync
        qc.invalidateQueries({ queryKey: ['clients', userId, 'at-risk'] })
    }

    function handleUpdated(updatedClient) {
        qc.setQueryData(['clients', userId, 'all'], old =>
            (old ?? []).map(c => c.id === updatedClient.id ? updatedClient : c)
        )
        if (selected?.id === updatedClient.id) setSelected(updatedClient)
        // Score may have changed — refetch at-risk list
        qc.invalidateQueries({ queryKey: ['clients', userId, 'at-risk'] })
    }

    function handleDeleted(clientId) {
        qc.setQueryData(['clients', userId, 'all'], old =>
            (old ?? []).filter(c => c.id !== clientId)
        )
        if (selected?.id === clientId) setSelected(null)
        // Purge tasks + at-risk widget on Dashboard
        qc.invalidateQueries({ queryKey: ['tasks', userId, 'today'] })
        qc.invalidateQueries({ queryKey: ['clients', userId, 'at-risk'] })
    }

    const healthColor = score => score < 30 ? '#f87171' : score < 50 ? '#fbbf24' : score < 80 ? '#34d399' : '#818cf8'

    return (
        <div style={{ display: 'flex', height: 'calc(100vh - 60px)', fontFamily: 'Inter, system-ui, sans-serif' }}>

            {/* ── Left: Client List ───────────────────────────────────────────── */}
            <div style={{ width: '290px', flexShrink: 0, borderRight: '1px solid #1f1f3d', display: 'flex', flexDirection: 'column', background: '#0c0c1d' }}>
                {/* Header */}
                <div style={{ padding: '20px 16px 16px', borderBottom: '1px solid #1f1f3d' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Users size={15} color="#7c3aed" />
                            <h3 style={{ fontSize: '13px', fontWeight: 600, color: '#e2e8f0', margin: 0 }}>Clients</h3>
                        </div>
                        <motion.button whileTap={{ scale: 0.9 }} onClick={() => setShowModal(true)}
                            style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '6px 10px', borderRadius: '8px', border: '1px solid rgba(124,58,237,0.3)', background: 'rgba(124,58,237,0.08)', color: '#a78bfa', fontSize: '12px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
                        >
                            <Plus size={13} /> Add
                        </motion.button>
                    </div>
                    <p style={{ fontSize: '11px', color: '#334155', margin: 0 }}>{clients.length} client{clients.length !== 1 ? 's' : ''}</p>
                </div>

                {/* List */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
                    {isLoading ? (
                        <div style={{ padding: '8px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            {[0, 1, 2, 3].map(i => <ListItemSkeleton key={i} />)}
                        </div>
                    ) : clients.length === 0 ? (
                        <div style={{ padding: '32px 16px', textAlign: 'center' }}>
                            <Users size={28} color="#1f1f3d" style={{ marginBottom: '12px' }} />
                            <p style={{ fontSize: '13px', color: '#475569', margin: '0 0 4px', fontWeight: 500 }}>No clients yet</p>
                            <p style={{ fontSize: '12px', color: '#334155', margin: 0 }}>Click "Add" to create your first client</p>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                            {clients.map(client => {
                                const isActive = selected?.id === client.id
                                return (
                                    <div
                                        key={client.id}
                                        style={{ position: 'relative' }}
                                        onMouseEnter={e => e.currentTarget.querySelector('.client-actions')?.style && (e.currentTarget.querySelector('.client-actions').style.opacity = '1')}
                                        onMouseLeave={e => e.currentTarget.querySelector('.client-actions')?.style && (e.currentTarget.querySelector('.client-actions').style.opacity = '0')}
                                    >
                                        <motion.button whileTap={{ scale: 0.98 }}
                                            onClick={() => setSelected(client)}
                                            style={{
                                                display: 'flex', alignItems: 'center', gap: '10px',
                                                padding: '10px 12px', borderRadius: '10px', border: 'none', width: '100%', textAlign: 'left',
                                                background: isActive ? 'rgba(124,58,237,0.12)' : 'transparent',
                                                cursor: 'pointer', transition: 'all 0.15s', fontFamily: 'inherit',
                                            }}
                                            onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'rgba(255,255,255,0.03)' }}
                                            onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent' }}
                                        >
                                            <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: isActive ? 'linear-gradient(135deg, rgba(124,58,237,0.3), rgba(99,102,241,0.3))' : 'rgba(255,255,255,0.05)', border: `1px solid ${isActive ? 'rgba(124,58,237,0.3)' : 'transparent'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: 700, color: isActive ? '#a78bfa' : '#64748b', flexShrink: 0 }}>
                                                {client.name[0]?.toUpperCase()}
                                            </div>
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <p style={{ fontSize: '13px', color: isActive ? '#e2e8f0' : '#94a3b8', fontWeight: isActive ? 600 : 400, margin: '0 0 2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{client.name}</p>
                                                <p style={{ fontSize: '11px', color: '#334155', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{client.company}</p>
                                            </div>
                                            {isActive && <ChevronRight size={12} color="#7c3aed" style={{ flexShrink: 0 }} />}
                                        </motion.button>

                                        {/* Edit + Delete icon buttons — fade in on row hover */}
                                        <div
                                            className="client-actions"
                                            style={{
                                                position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)',
                                                display: 'flex', gap: '2px',
                                                opacity: 0, transition: 'opacity 0.15s',
                                                pointerEvents: 'auto',
                                            }}
                                        >
                                            <button
                                                onClick={e => { e.stopPropagation(); setEditClient(client) }}
                                                title="Edit client"
                                                style={{
                                                    background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.2)',
                                                    borderRadius: '6px', padding: '5px 6px', cursor: 'pointer', color: '#818cf8',
                                                    display: 'flex', alignItems: 'center',
                                                }}
                                            >
                                                <Pencil size={11} />
                                            </button>
                                            <button
                                                onClick={e => { e.stopPropagation(); setDelClient(client) }}
                                                title="Delete client"
                                                style={{
                                                    background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.15)',
                                                    borderRadius: '6px', padding: '5px 6px', cursor: 'pointer', color: '#f87171',
                                                    display: 'flex', alignItems: 'center',
                                                }}
                                            >
                                                <Trash2 size={11} />
                                            </button>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </div>
            </div>

            {/* ── Right: Two-column layout (brain dump + task panel) ────────── */}
            <div style={{ flex: 1, overflow: 'hidden', display: 'flex', background: '#07070e' }}>
                {selected ? (
                    <>
                        {/* Brain dump — scrollable left column */}
                        <div style={{ flex: '0 0 55%', overflowY: 'auto', padding: '28px 28px 28px 32px', borderRight: '1px solid #1f1f3d' }}>
                            <BrainDumpPanel client={selected} userId={userId} key={selected.id} />
                        </div>
                        {/* Client tasks — fixed right column */}
                        <div style={{ flex: '0 0 45%', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                            <ClientTaskPanel client={selected} userId={userId} key={`tasks-${selected.id}`} />
                        </div>
                    </>
                ) : (
                    /* Empty state — spans the full remaining width, centred */
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <motion.div
                            initial={{ opacity: 0, y: 16 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.35 }}
                            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '40px 24px' }}
                        >
                            {/* Icon */}
                            <div style={{ width: '72px', height: '72px', borderRadius: '22px', background: 'linear-gradient(135deg, rgba(124,58,237,0.12), rgba(99,102,241,0.12))', border: '1px solid rgba(124,58,237,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '24px', boxShadow: '0 0 40px rgba(124,58,237,0.08)' }}>
                                <Brain size={32} color="#7c3aed" />
                            </div>

                            <h2 style={{ fontSize: '20px', fontWeight: 800, color: '#f1f5f9', margin: '0 0 12px', letterSpacing: '-0.02em' }}>AI Brain Dump Engine</h2>

                            <p style={{ fontSize: '13.5px', color: '#475569', margin: '0 0 6px', maxWidth: '340px', lineHeight: 1.65 }}>
                                Select a client from the left panel, then paste your raw meeting notes.
                            </p>
                            <p style={{ fontSize: '12.5px', color: '#2d2d55', margin: '0 0 28px', maxWidth: '380px', lineHeight: 1.6 }}>
                                The AI will extract action items, generate a summary, and sync everything to your vector store.
                            </p>

                            {/* Feature chips */}
                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'center' }}>
                                {[
                                    { icon: '✦', label: 'Task Extraction' },
                                    { icon: '◈', label: 'Meeting Summary' },
                                    { icon: '⬡', label: 'Vector Sync' },
                                ].map(({ icon, label }) => (
                                    <span key={label} style={{
                                        display: 'flex', alignItems: 'center', gap: '5px',
                                        padding: '5px 12px', borderRadius: '999px',
                                        border: '1px solid rgba(124,58,237,0.15)',
                                        background: 'rgba(124,58,237,0.05)',
                                        fontSize: '11px', color: '#6d5a9e', fontWeight: 500,
                                    }}>
                                        <span style={{ color: '#7c3aed', fontSize: '10px' }}>{icon}</span>
                                        {label}
                                    </span>
                                ))}
                            </div>
                        </motion.div>
                    </div>
                )}
            </div>

            {/* Add Client Modal */}
            <AnimatePresence>
                {showModal && (
                    <AddClientModal userId={userId} onClose={() => setShowModal(false)} onCreated={handleCreated} />
                )}
            </AnimatePresence>

            {/* Edit Client Modal */}
            <AnimatePresence>
                {editClient && (
                    <EditClientModal
                        client={editClient}
                        onClose={() => setEditClient(null)}
                        onSaved={handleUpdated}
                    />
                )}
            </AnimatePresence>

            {/* Delete Client Confirmation */}
            <AnimatePresence>
                {delClient && (
                    <DeleteClientConfirm
                        client={delClient}
                        onClose={() => setDelClient(null)}
                        onDeleted={() => handleDeleted(delClient.id)}
                    />
                )}
            </AnimatePresence>

            <style>{`
        @keyframes spin   { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes pulse  { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
      `}</style>
        </div>
    )
}
