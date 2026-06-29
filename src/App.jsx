import { Routes, Route } from 'react-router-dom'
import { AuthProvider } from './lib/auth'
import Navbar from './components/Navbar'
import Leaderboard from './pages/Leaderboard'
import Login from './pages/Login'
import Admin from './pages/Admin'

export default function App() {
  return (
    <AuthProvider>
      <Navbar />
      <Routes>
        <Route path="/" element={<Leaderboard />} />
        <Route path="/login" element={<Login />} />
        <Route path="/admin" element={<Admin />} />
      </Routes>
    </AuthProvider>
  )
}
