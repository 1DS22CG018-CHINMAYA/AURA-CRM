import { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Sparkles, Send, Bot, User, RotateCcw, Database } from 'lucide-react'
import api, { NO_TIMEOUT } from '../api/client'
import MarkdownRenderer from '../components/MarkdownRenderer'

// ─── Constants ───────────────────────────────────────────────────────────────
const WELCOME = {
    role: 'ai',
    content: "**Hello! I'm Aura**, your AI CRM assistant.\n\nI have access to all your client meeting notes and can answer questions like:\n- *\"Who raised concerns about the Q2 roadmap?\"*\n- *\"What did we discuss with Sarah Johnson last week?\"*\n- *\"Which clients have budget constraints this quarter?\"*\n\nAsk me anything about your clients.",
}

const SUGGESTIONS = [
    'Who asked about the Q2 roadmap?',
    'Summarise recent follow-ups',
    'Clients with budget concerns',
    'What decisions were made last week?',
]

// ─── Avatar components ────────────────────────────────────────────────────────
function AuraAvatar() {
    return (
        <div style={{
            width: '30px', height: '30px', borderRadius: '50%', flexShrink: 0,
            background: 'linear-gradient(135deg, #7c3aed, #6366f1)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 0 14px rgba(124,58,237,0.35)',
        }}>
            <Bot size={15} color="white" />
        </div>
    )
}

function UserAvatar() {
    return (
        <div style={{
            width: '30px', height: '30px', borderRadius: '50%', flexShrink: 0,
            background: 'linear-gradient(135deg, #0f172a, #1e293b)',
            border: '1px solid #334155',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
            <User size={14} color="#64748b" />
        </div>
    )
}

// ─── Typing indicator ─────────────────────────────────────────────────────────
function TypingIndicator() {
    return (
        <motion.div
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            style={{ display: 'flex', alignItems: 'flex-end', gap: '10px' }}
        >
            <AuraAvatar />
            <div style={{
                background: '#0c0c1d', border: '1px solid #1f1f3d',
                borderRadius: '16px 16px 16px 4px', padding: '14px 18px',
                display: 'flex', alignItems: 'center', gap: '5px',
            }}>
                {[0, 1, 2].map(i => (
                    <motion.span key={i}
                        animate={{ y: [0, -5, 0] }}
                        transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.15, ease: 'easeInOut' }}
                        style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#7c3aed', display: 'block' }}
                    />
                ))}
                <span style={{ fontSize: '11px', color: '#334155', marginLeft: '6px' }}>Aura is thinking…</span>
            </div>
        </motion.div>
    )
}

// ─── Single message bubble ─────────────────────────────────────────────────────
function MessageBubble({ msg, index }) {
    const isUser = msg.role === 'user'

    return (
        <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.25, delay: Math.min(index * 0.04, 0.2) }}
            style={{
                display: 'flex', alignItems: 'flex-end', gap: '10px',
                flexDirection: isUser ? 'row-reverse' : 'row',
                maxWidth: '82%',
                alignSelf: isUser ? 'flex-end' : 'flex-start',
            }}
        >
            {isUser ? <UserAvatar /> : <AuraAvatar />}

            <div style={{
                padding: isUser ? '11px 16px' : '14px 18px',
                borderRadius: isUser
                    ? '16px 16px 4px 16px'
                    : '16px 16px 16px 4px',
                background: isUser
                    ? 'linear-gradient(135deg, #7c3aed, #6366f1)'
                    : '#0c0c1d',
                border: isUser ? 'none' : '1px solid #1f1f3d',
                fontSize: '13.5px', lineHeight: 1.7,
                boxShadow: isUser ? '0 4px 20px rgba(124,58,237,0.25)' : 'none',
                maxWidth: '100%',
            }}>
                {isUser ? (
                    <p style={{ color: 'white', margin: 0, lineHeight: 1.6 }}>{msg.content}</p>
                ) : (
                    <MarkdownRenderer prose="#94a3b8" accent="#a78bfa">
                        {msg.content}
                    </MarkdownRenderer>
                )}
            </div>
        </motion.div>
    )
}

// ─── Context source badge ─────────────────────────────────────────────────────
function ContextBadge({ visible }) {
    if (!visible) return null
    return (
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
            style={{
                alignSelf: 'center', display: 'flex', alignItems: 'center', gap: '5px',
                padding: '3px 10px', borderRadius: '999px',
                border: '1px solid rgba(99,102,241,0.15)',
                background: 'rgba(99,102,241,0.05)',
                fontSize: '10px', color: '#475569',
            }}
        >
            <Database size={9} color="#6366f1" />
            Searching vector database…
        </motion.div>
    )
}

// ─── Main chat page ────────────────────────────────────────────────────────────
export default function Search({ userId }) {
    const [messages, setMessages] = useState([WELCOME])
    const [input, setInput] = useState('')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState(null)

    const bottomRef = useRef(null)
    const inputRef = useRef(null)
    const isWelcome = messages.length === 1 && messages[0] === WELCOME

    // Auto-scroll to newest message
    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [messages, loading])

    const sendMessage = useCallback(async (text = input) => {
        const trimmed = text.trim()
        if (!trimmed || loading) return

        setInput('')
        setError(null)

        // Optimistic: add user message immediately
        const userMsg = { role: 'user', content: trimmed }
        const nextHistory = [...messages, userMsg]
        setMessages(nextHistory)
        setLoading(true)

        try {
            const { data } = await api.post(
                '/chat',
                {
                    messages: nextHistory.map(m => ({ role: m.role, content: m.content })),
                    user_id: userId ?? localStorage.getItem('aura_user_id') ?? '',
                },
                { timeout: NO_TIMEOUT }
            )
            setMessages(prev => [...prev, { role: 'ai', content: data.content }])
        } catch (err) {
            const msg = err?.response?.data?.detail || 'The assistant is unavailable. Is Ollama running?'
            setError(msg)
            setMessages(prev => [...prev, {
                role: 'ai',
                content: `⚠️ **Error**: ${msg}`,
            }])
        } finally {
            setLoading(false)
            setTimeout(() => inputRef.current?.focus(), 50)
        }
    }, [input, loading, messages])

    function resetChat() {
        setMessages([WELCOME])
        setInput('')
        setError(null)
        setTimeout(() => inputRef.current?.focus(), 50)
    }

    return (
        <div style={{
            display: 'flex', flexDirection: 'column',
            height: 'calc(100vh - 60px)',
            background: '#07070e',
            fontFamily: 'Inter, system-ui, sans-serif',
            position: 'relative',
        }}>

            {/* ── Top bar ─────────────────────────────────────────────── */}
            <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '14px 24px', borderBottom: '1px solid #1f1f3d',
                background: 'rgba(10,10,26,0.7)', backdropFilter: 'blur(8px)',
                flexShrink: 0,
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ width: '28px', height: '28px', borderRadius: '8px', background: 'linear-gradient(135deg, #7c3aed, #6366f1)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 12px rgba(124,58,237,0.3)' }}>
                        <Sparkles size={13} color="white" />
                    </div>
                    <div>
                        <p style={{ fontSize: '13px', fontWeight: 700, color: '#f1f5f9', margin: 0, lineHeight: 1 }}>Aura AI Assistant</p>
                        <p style={{ fontSize: '10px', color: '#334155', margin: '2px 0 0', lineHeight: 1 }}>RAG · MongoDB Atlas Vector Search</p>
                    </div>
                </div>

                <button
                    onClick={resetChat}
                    title="New conversation"
                    style={{
                        display: 'flex', alignItems: 'center', gap: '6px',
                        padding: '6px 12px', borderRadius: '8px',
                        border: '1px solid #1f1f3d', background: 'transparent',
                        color: '#475569', fontSize: '11px', cursor: 'pointer',
                        fontFamily: 'inherit', transition: 'all 0.15s',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(124,58,237,0.3)'; e.currentTarget.style.color = '#94a3b8' }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = '#1f1f3d'; e.currentTarget.style.color = '#475569' }}
                >
                    <RotateCcw size={11} /> New chat
                </button>
            </div>

            {/* ── Message area ──────────────────────────────────────────── */}
            <div style={{
                flex: 1, overflowY: 'auto', padding: '28px 0',
                display: 'flex', flexDirection: 'column',
            }}>
                <div style={{
                    width: '100%', maxWidth: '760px', margin: '0 auto',
                    padding: '0 24px', display: 'flex', flexDirection: 'column', gap: '20px',
                }}>

                    <AnimatePresence initial={false}>
                        {messages.map((msg, i) => (
                            <MessageBubble key={i} msg={msg} index={i} />
                        ))}
                    </AnimatePresence>

                    {/* Typing indicator */}
                    <AnimatePresence>
                        {loading && (
                            <>
                                <ContextBadge visible={loading} />
                                <TypingIndicator />
                            </>
                        )}
                    </AnimatePresence>

                    {/* Suggestion chips — only on welcome */}
                    <AnimatePresence>
                        {isWelcome && !loading && (
                            <motion.div
                                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                                style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', paddingLeft: '40px' }}
                            >
                                {SUGGESTIONS.map((s, i) => (
                                    <motion.button key={s}
                                        initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: 0.3 + i * 0.07 }}
                                        whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                                        onClick={() => sendMessage(s)}
                                        style={{
                                            padding: '7px 14px', borderRadius: '999px',
                                            border: '1px solid rgba(99,102,241,0.2)',
                                            background: 'rgba(99,102,241,0.06)',
                                            color: '#64748b', fontSize: '12px', cursor: 'pointer',
                                            fontFamily: 'inherit', transition: 'all 0.15s',
                                        }}
                                        onMouseEnter={e => { e.currentTarget.style.color = '#94a3b8'; e.currentTarget.style.background = 'rgba(99,102,241,0.12)' }}
                                        onMouseLeave={e => { e.currentTarget.style.color = '#64748b'; e.currentTarget.style.background = 'rgba(99,102,241,0.06)' }}
                                    >
                                        {s}
                                    </motion.button>
                                ))}
                            </motion.div>
                        )}
                    </AnimatePresence>

                    <div ref={bottomRef} />
                </div>
            </div>

            {/* ── Input bar ─────────────────────────────────────────────── */}
            <div style={{
                borderTop: '1px solid #1f1f3d',
                background: 'rgba(10,10,26,0.85)', backdropFilter: 'blur(12px)',
                padding: '16px 24px', flexShrink: 0,
            }}>
                <div style={{ maxWidth: '760px', margin: '0 auto' }}>
                    <div style={{
                        padding: '1px', borderRadius: '16px',
                        background: loading
                            ? 'linear-gradient(135deg, #7c3aed, #6366f1, #3b82f6)'
                            : input.trim()
                                ? 'linear-gradient(135deg, rgba(124,58,237,0.5), rgba(99,102,241,0.3))'
                                : 'linear-gradient(135deg, rgba(99,102,241,0.15), rgba(124,58,237,0.1))',
                        transition: 'background 0.3s',
                    }}>
                        <div style={{
                            display: 'flex', alignItems: 'flex-end', gap: '10px',
                            background: '#0a0a1a', borderRadius: '15px', padding: '12px 14px',
                        }}>
                            <textarea
                                ref={inputRef}
                                value={input}
                                onChange={e => setInput(e.target.value)}
                                onKeyDown={e => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault()
                                        sendMessage()
                                    }
                                }}
                                placeholder="Ask about your clients… (Enter to send, Shift+Enter for newline)"
                                rows={1}
                                disabled={loading}
                                style={{
                                    flex: 1, background: 'none', border: 'none', outline: 'none',
                                    resize: 'none', fontSize: '13.5px', color: '#f1f5f9',
                                    fontFamily: 'Inter, system-ui, sans-serif',
                                    caretColor: '#818cf8', lineHeight: 1.6,
                                    maxHeight: '120px', overflowY: 'auto',
                                    opacity: loading ? 0.5 : 1,
                                }}
                                onInput={e => {
                                    e.target.style.height = 'auto'
                                    e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px'
                                }}
                            />

                            <motion.button
                                whileTap={{ scale: 0.9 }}
                                onClick={() => sendMessage()}
                                disabled={loading || !input.trim()}
                                style={{
                                    width: '36px', height: '36px', borderRadius: '10px', border: 'none',
                                    background: loading || !input.trim()
                                        ? 'rgba(124,58,237,0.1)'
                                        : 'linear-gradient(135deg, #7c3aed, #6366f1)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    cursor: loading || !input.trim() ? 'not-allowed' : 'pointer',
                                    flexShrink: 0, transition: 'all 0.2s',
                                    boxShadow: loading || !input.trim() ? 'none' : '0 4px 16px rgba(124,58,237,0.3)',
                                }}
                            >
                                {loading
                                    ? <motion.div animate={{ rotate: 360 }} transition={{ duration: 1.2, repeat: Infinity, ease: 'linear' }}>
                                        <Sparkles size={14} color="#7c3aed" />
                                    </motion.div>
                                    : <Send size={14} color={input.trim() ? 'white' : '#475569'} />
                                }
                            </motion.button>
                        </div>
                    </div>

                    <p style={{ textAlign: 'center', fontSize: '10px', color: '#1e293b', margin: '8px 0 0' }}>
                        Powered by MongoDB Atlas Vector Search · Gemma 3 12B (via Ollama) · LangGraph
                    </p>
                </div>
            </div>
        </div>
    )
}
