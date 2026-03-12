import { useState } from 'react'
import { Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Clients from './pages/Clients'
import Search from './pages/Search'
import Login from './pages/Login'

export default function App() {
  const [userId, setUserId] = useState(() => localStorage.getItem('aura_user_id'))
  const [userName, setUserName] = useState(() => localStorage.getItem('aura_user_name') || 'User')

  function handleLogin(id, name) {
    setUserId(id)
    setUserName(name)
  }

  // Not logged in → show onboarding
  if (!userId) {
    return <Login onLogin={handleLogin} />
  }

  return (
    <Routes>
      <Route path="/" element={<Layout userName={userName} onLogout={() => {
        localStorage.removeItem('aura_user_id')
        localStorage.removeItem('aura_user_name')
        setUserId(null)
      }} />}>
        <Route index element={<Dashboard userId={userId} userName={userName} />} />
        <Route path="clients" element={<Clients userId={userId} />} />
        <Route path="search" element={<Search userId={userId} />} />
      </Route>
    </Routes>
  )
}
