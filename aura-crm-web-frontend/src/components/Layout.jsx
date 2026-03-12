import { useLocation, NavLink, Outlet } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { LayoutDashboard, Users, Sparkles, Settings2, Bell, Zap, LogOut } from 'lucide-react'
import { ModelStatusBadge } from './ModelStatus'

const NAV_ITEMS = [
    { to: '/', icon: LayoutDashboard, label: 'Dashboard', end: true },
    { to: '/clients', icon: Users, label: 'Clients' },
    { to: '/search', icon: Sparkles, label: 'Semantic Search' },
]

const PAGE_TITLES = {
    '/': 'Dashboard',
    '/clients': 'Clients',
    '/search': 'Semantic Search',
    '/settings': 'Settings',
}

function getTitle(pathname) {
    if (PAGE_TITLES[pathname]) return PAGE_TITLES[pathname]
    if (pathname.startsWith('/clients')) return 'Client Detail'
    return 'Aura CRM'
}

export default function Layout({ userName = 'User', onLogout }) {
    const location = useLocation()
    const initial = userName.trim()[0]?.toUpperCase() ?? 'U'

    return (
        <div style={{ display: 'flex', height: '100vh', background: '#05050f', overflow: 'hidden', fontFamily: 'Inter, system-ui, sans-serif' }}>

            {/* ── Sidebar ─── */}
            <aside style={{
                width: '258px', flexShrink: 0, display: 'flex', flexDirection: 'column',
                borderRight: '1px solid #1f1f3d', background: '#0c0c1d',
                height: '100vh', position: 'sticky', top: 0, zIndex: 20,
            }}>
                {/* Logo */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '0 20px', height: '60px', borderBottom: '1px solid #1f1f3d', flexShrink: 0 }}>
                    <div style={{ width: '32px', height: '32px', borderRadius: '10px', background: 'linear-gradient(135deg, #7c3aed, #4f46e5)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: '0 4px 20px rgba(124,58,237,0.3)' }}>
                        <Zap size={14} color="white" fill="white" />
                    </div>
                    <div>
                        <p style={{ fontSize: '13px', fontWeight: 700, color: '#f1f5f9', margin: 0, lineHeight: 1 }}>Aura CRM</p>
                        <p style={{ fontSize: '10px', color: '#475569', margin: '3px 0 0', lineHeight: 1 }}>AI-Powered</p>
                    </div>
                </div>

                {/* Nav */}
                <nav style={{ flex: 1, padding: '16px 12px', overflowY: 'auto' }}>
                    <p style={{ padding: '0 12px', marginBottom: '10px', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.12em', color: '#334155', fontWeight: 600 }}>Menu</p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        {NAV_ITEMS.map(({ to, icon: Icon, label, end }) => (
                            <NavLink key={to} to={to} end={end}
                                style={({ isActive }) => ({
                                    display: 'flex', alignItems: 'center', gap: '10px',
                                    padding: '10px 12px', borderRadius: '12px',
                                    textDecoration: 'none', fontSize: '13px', fontWeight: 500,
                                    transition: 'all 0.15s',
                                    background: isActive ? 'rgba(124,58,237,0.1)' : 'transparent',
                                    color: isActive ? '#c4b5fd' : '#64748b',
                                    position: 'relative',
                                })}
                            >
                                {({ isActive }) => (
                                    <>
                                        <Icon size={15} color={isActive ? '#a78bfa' : '#475569'} />
                                        <span style={{ flex: 1 }}>{label}</span>
                                        {isActive && (
                                            <motion.span layoutId="nav-dot"
                                                style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#7c3aed', flexShrink: 0 }}
                                                transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                                            />
                                        )}
                                    </>
                                )}
                            </NavLink>
                        ))}
                    </div>
                </nav>

                {/* Bottom */}
                <div style={{ borderTop: '1px solid #1f1f3d', padding: '10px 12px', flexShrink: 0 }}>
                    <NavLink to="/settings"
                        style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', borderRadius: '12px', textDecoration: 'none', fontSize: '13px', fontWeight: 500, color: '#475569', transition: 'all 0.15s' }}
                    >
                        <Settings2 size={15} color="#334155" />
                        Settings
                    </NavLink>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', marginTop: '4px' }}>
                        <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'linear-gradient(135deg, #7c3aed, #4f46e5)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700, color: 'white', flexShrink: 0 }}>
                            {initial}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ fontSize: '13px', color: '#e2e8f0', fontWeight: 500, margin: 0, lineHeight: 1.3 }}>{userName}</p>
                            <p style={{ fontSize: '10px', color: '#334155', margin: 0 }}>Admin</p>
                        </div>
                        {onLogout && (
                            <button onClick={onLogout} title="Sign out"
                                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: '#334155', display: 'flex', alignItems: 'center', transition: 'color 0.15s' }}
                                onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')}
                                onMouseLeave={e => (e.currentTarget.style.color = '#334155')}
                            >
                                <LogOut size={13} />
                            </button>
                        )}
                    </div>
                </div>
            </aside>

            {/* ── Right panel ─── */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
                {/* Header */}
                <header style={{
                    height: '60px', borderBottom: '1px solid #1f1f3d',
                    background: 'rgba(12,12,29,0.8)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
                    display: 'flex', alignItems: 'center', padding: '0 24px', gap: '12px',
                    position: 'sticky', top: 0, zIndex: 10, flexShrink: 0,
                }}>
                    <h1 style={{ flex: 1, fontSize: '14px', fontWeight: 600, color: '#f1f5f9', margin: 0 }}>
                        {getTitle(location.pathname)}
                    </h1>
                    <button
                        style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '7px 14px', borderRadius: '10px', border: '1px solid #1f1f3d', background: 'rgba(19,19,43,0.6)', color: '#64748b', fontSize: '12px', cursor: 'pointer', transition: 'all 0.15s', fontFamily: 'inherit' }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(124,58,237,0.4)'; e.currentTarget.style.color = '#94a3b8' }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = '#1f1f3d'; e.currentTarget.style.color = '#64748b' }}
                    >
                        <Sparkles size={13} color="#475569" />
                        <span>Semantic search…</span>
                        <kbd style={{ marginLeft: '4px', fontSize: '10px', padding: '1px 6px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px', color: '#334155', fontFamily: 'monospace' }}>⌘K</kbd>
                    </button>
                    <ModelStatusBadge />
                    <button style={{ position: 'relative', padding: '8px', borderRadius: '10px', border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                        <Bell size={16} color="#64748b" />
                        <span style={{ position: 'absolute', top: '8px', right: '8px', width: '6px', height: '6px', borderRadius: '50%', background: '#7c3aed', outline: '2px solid #05050f' }} />
                    </button>
                    <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'linear-gradient(135deg, #7c3aed, #4f46e5)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700, color: 'white', flexShrink: 0 }}>
                        {initial}
                    </div>
                </header>

                {/* Page content with route transition */}
                <main style={{ flex: 1, overflowY: 'auto' }}>
                    <AnimatePresence mode="wait" initial={false}>
                        <motion.div key={location.pathname}
                            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18, ease: 'easeOut' }}
                        >
                            <Outlet />
                        </motion.div>
                    </AnimatePresence>
                </main>
            </div>
        </div>
    )
}
