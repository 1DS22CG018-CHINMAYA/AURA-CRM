import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import { Zap, ArrowRight, Loader2, UserCheck, UserPlus, Mail, User } from 'lucide-react'
import api from '../api/client'

/**
 * Login — smart sign-in / sign-up flow
 *
 * Phase 1 — user types name + email, clicks "Continue"
 *   → Backend: GET /users/by-email?email=...
 *   → 200  = returning user → log in silently (no extra step)
 *   → 404  = new address  → show confirmation card (phase 2)
 *
 * Phase 2 (new user only) — confirmation card
 *   "We don't have an account for this email. Create one?"
 *   Confirm → POST /users/  →  log in
 *   Back    → return to phase 1
 */
export default function Login({ onLogin }) {
    const [name, setName] = useState('')
    const [email, setEmail] = useState('')
    const [phase, setPhase] = useState('form')   // 'form' | 'confirm'
    const [loading, setLoading] = useState(false)

    /* ── shared styles ─────────────────────────────────────────────── */
    const inputStyle = {
        width: '100%', padding: '11px 14px', borderRadius: '10px',
        border: '1px solid #1f1f3d', background: 'rgba(19,19,43,0.8)',
        color: '#f1f5f9', fontSize: '14px', outline: 'none',
        transition: 'border-color 0.2s',
        fontFamily: 'Inter, system-ui, sans-serif',
        boxSizing: 'border-box',
    }

    /* ── Phase 1: check whether the email already exists ───────────── */
    async function handleContinue(e) {
        e.preventDefault()
        const trimName = name.trim()
        const trimEmail = email.trim().toLowerCase()
        if (!trimName || !trimEmail) {
            toast.error('Please fill in both your name and email.')
            return
        }

        setLoading(true)
        try {
            // Does an account already exist for this email?
            const { data } = await api.get('/users/by-email', { params: { email: trimEmail } })
            // ── Returning user ──────────────────────────────────────────
            persist(data)
            toast.success(`Welcome back, ${data.name}! 👋`, { description: 'Picking up right where you left off.' })
        } catch (err) {
            if (err?.response?.status === 404) {
                // ── New user → show confirmation step ──────────────────
                setPhase('confirm')
            }
            // Any other error (5xx, network) is handled by the axios interceptor
        } finally {
            setLoading(false)
        }
    }

    /* ── Phase 2: confirmed new-user creation ───────────────────────── */
    async function handleCreate() {
        setLoading(true)
        try {
            const { data } = await api.post('/users/', {
                name: name.trim(),
                email: email.trim().toLowerCase(),
            })
            persist(data)
            toast.success(`Account created! Welcome, ${data.name} 🎉`, {
                description: 'Your Aura CRM workspace is ready.',
            })
        } catch {
            // interceptor handles it
        } finally {
            setLoading(false)
        }
    }

    function persist(data) {
        localStorage.setItem('aura_user_id', data.id)
        localStorage.setItem('aura_user_name', data.name)
        onLogin(data.id, data.name)
    }

    /* ── render ─────────────────────────────────────────────────────── */
    return (
        <div style={{
            minHeight: '100vh', background: '#05050f',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '24px',
            fontFamily: 'Inter, system-ui, sans-serif',
        }}>
            {/* Radial glow */}
            <div style={{
                position: 'fixed', top: '30%', left: '50%', transform: 'translateX(-50%)',
                width: '600px', height: '400px', borderRadius: '50%',
                background: 'radial-gradient(ellipse, rgba(124,58,237,0.12) 0%, transparent 70%)',
                pointerEvents: 'none',
            }} />

            <motion.div
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, ease: 'easeOut' }}
                style={{
                    width: '100%', maxWidth: '420px',
                    background: '#0c0c1d',
                    border: '1px solid #1f1f3d',
                    borderRadius: '20px',
                    padding: '40px',
                    position: 'relative', zIndex: 1,
                    overflow: 'hidden',
                }}
            >
                {/* Logo */}
                <div style={{ textAlign: 'center', marginBottom: '32px' }}>
                    <div style={{
                        width: '52px', height: '52px', borderRadius: '16px',
                        background: 'linear-gradient(135deg, #7c3aed, #4f46e5)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        margin: '0 auto 16px',
                        boxShadow: '0 8px 32px rgba(124,58,237,0.4)',
                    }}>
                        <Zap size={24} color="white" fill="white" />
                    </div>
                    <h1 style={{ fontSize: '22px', fontWeight: 800, color: '#f1f5f9', margin: '0 0 6px', letterSpacing: '-0.02em' }}>
                        Welcome to Aura CRM
                    </h1>
                    <p style={{ fontSize: '13px', color: '#475569', margin: 0 }}>
                        {phase === 'form'
                            ? 'Sign in to your account or create a new one'
                            : 'Confirm your details to create an account'}
                    </p>
                </div>

                <AnimatePresence mode="wait">

                    {/* ── Phase 1: name + email form ── */}
                    {phase === 'form' && (
                        <motion.form
                            key="form"
                            initial={{ opacity: 0, x: -16 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 16 }}
                            transition={{ duration: 0.2 }}
                            onSubmit={handleContinue}
                            style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}
                        >
                            {/* Name */}
                            <div>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px', fontWeight: 500, color: '#64748b', marginBottom: '6px', letterSpacing: '0.02em' }}>
                                    <User size={11} /> Full Name
                                </label>
                                <input
                                    type="text"
                                    placeholder="Chinmaya Adiga"
                                    value={name}
                                    onChange={e => setName(e.target.value)}
                                    style={inputStyle}
                                    onFocus={e => (e.target.style.borderColor = 'rgba(124,58,237,0.6)')}
                                    onBlur={e => (e.target.style.borderColor = '#1f1f3d')}
                                    disabled={loading}
                                    required
                                />
                            </div>

                            {/* Email */}
                            <div>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px', fontWeight: 500, color: '#64748b', marginBottom: '6px', letterSpacing: '0.02em' }}>
                                    <Mail size={11} /> Email Address
                                </label>
                                <input
                                    type="email"
                                    placeholder="you@example.com"
                                    value={email}
                                    onChange={e => setEmail(e.target.value)}
                                    style={inputStyle}
                                    onFocus={e => (e.target.style.borderColor = 'rgba(124,58,237,0.6)')}
                                    onBlur={e => (e.target.style.borderColor = '#1f1f3d')}
                                    disabled={loading}
                                    required
                                />
                            </div>

                            {/* Submit */}
                            <motion.button
                                type="submit"
                                disabled={loading}
                                whileTap={{ scale: 0.97 }}
                                style={{
                                    width: '100%', padding: '13px',
                                    borderRadius: '12px', border: 'none',
                                    background: loading
                                        ? 'rgba(124,58,237,0.4)'
                                        : 'linear-gradient(135deg, #7c3aed, #6366f1)',
                                    color: 'white', fontSize: '14px', fontWeight: 600,
                                    cursor: loading ? 'not-allowed' : 'pointer',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                                    marginTop: '4px',
                                    boxShadow: loading ? 'none' : '0 4px 20px rgba(124,58,237,0.35)',
                                    transition: 'all 0.2s',
                                    fontFamily: 'inherit',
                                }}
                            >
                                {loading
                                    ? <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Checking…</>
                                    : <>Continue <ArrowRight size={16} /></>
                                }
                            </motion.button>
                        </motion.form>
                    )}

                    {/* ── Phase 2: new-user confirmation card ── */}
                    {phase === 'confirm' && (
                        <motion.div
                            key="confirm"
                            initial={{ opacity: 0, x: 16 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -16 }}
                            transition={{ duration: 0.2 }}
                            style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}
                        >
                            {/* Info banner */}
                            <div style={{
                                padding: '16px', borderRadius: '12px',
                                background: 'rgba(99,102,241,0.07)',
                                border: '1px solid rgba(99,102,241,0.18)',
                                display: 'flex', gap: '12px', alignItems: 'flex-start',
                            }}>
                                <div style={{
                                    width: '32px', height: '32px', borderRadius: '9px', flexShrink: 0,
                                    background: 'rgba(99,102,241,0.15)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                }}>
                                    <UserPlus size={15} color="#818cf8" />
                                </div>
                                <div>
                                    <p style={{ fontSize: '13px', fontWeight: 600, color: '#e2e8f0', margin: '0 0 4px' }}>
                                        No account found
                                    </p>
                                    <p style={{ fontSize: '12px', color: '#64748b', margin: 0, lineHeight: 1.55 }}>
                                        We couldn't find an account for <strong style={{ color: '#94a3b8' }}>{email.trim().toLowerCase()}</strong>.
                                        Would you like to create a new Aura CRM workspace?
                                    </p>
                                </div>
                            </div>

                            {/* Preview of what will be created */}
                            <div style={{
                                padding: '14px 16px', borderRadius: '12px',
                                background: 'rgba(15,15,35,0.6)',
                                border: '1px solid #1f1f3d',
                                display: 'flex', flexDirection: 'column', gap: '8px',
                            }}>
                                <p style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#334155', margin: 0 }}>
                                    Account to create
                                </p>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    <div style={{
                                        width: '36px', height: '36px', borderRadius: '10px', flexShrink: 0,
                                        background: 'linear-gradient(135deg, #7c3aed, #6366f1)',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        fontSize: '14px', fontWeight: 700, color: 'white',
                                    }}>
                                        {name.trim()[0]?.toUpperCase() ?? '?'}
                                    </div>
                                    <div>
                                        <p style={{ fontSize: '14px', fontWeight: 600, color: '#f1f5f9', margin: '0 0 2px' }}>{name.trim()}</p>
                                        <p style={{ fontSize: '12px', color: '#475569', margin: 0 }}>{email.trim().toLowerCase()}</p>
                                    </div>
                                </div>
                            </div>

                            {/* Action buttons */}
                            <div style={{ display: 'flex', gap: '10px' }}>
                                {/* Back */}
                                <button
                                    onClick={() => setPhase('form')}
                                    disabled={loading}
                                    style={{
                                        flex: '0 0 auto', padding: '12px 18px', borderRadius: '12px',
                                        border: '1px solid #1f1f3d', background: 'transparent',
                                        color: '#475569', fontSize: '13px', fontWeight: 600,
                                        cursor: loading ? 'not-allowed' : 'pointer',
                                        fontFamily: 'inherit', transition: 'all 0.2s',
                                    }}
                                    onMouseEnter={e => { e.currentTarget.style.borderColor = '#334155'; e.currentTarget.style.color = '#94a3b8' }}
                                    onMouseLeave={e => { e.currentTarget.style.borderColor = '#1f1f3d'; e.currentTarget.style.color = '#475569' }}
                                >
                                    ← Back
                                </button>

                                {/* Confirm create */}
                                <motion.button
                                    whileTap={{ scale: 0.97 }}
                                    onClick={handleCreate}
                                    disabled={loading}
                                    style={{
                                        flex: 1, padding: '12px',
                                        borderRadius: '12px', border: 'none',
                                        background: loading
                                            ? 'rgba(124,58,237,0.4)'
                                            : 'linear-gradient(135deg, #7c3aed, #6366f1)',
                                        color: 'white', fontSize: '13px', fontWeight: 600,
                                        cursor: loading ? 'not-allowed' : 'pointer',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                                        boxShadow: loading ? 'none' : '0 4px 20px rgba(124,58,237,0.35)',
                                        transition: 'all 0.2s',
                                        fontFamily: 'inherit',
                                    }}
                                >
                                    {loading
                                        ? <><Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> Creating…</>
                                        : <><UserCheck size={15} /> Yes, create my account</>
                                    }
                                </motion.button>
                            </div>
                        </motion.div>
                    )}

                </AnimatePresence>

                {/* Footer */}
                <p style={{ textAlign: 'center', fontSize: '11px', color: '#1e293b', marginTop: '28px', marginBottom: 0, lineHeight: 1.55 }}>
                    {phase === 'form'
                        ? 'Existing accounts sign in automatically · No password required'
                        : 'Your data is stored securely in MongoDB Atlas'}
                </p>
            </motion.div>

            <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
        </div>
    )
}
