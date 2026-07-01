import { Routes, Route } from 'react-router-dom'
import { AuthProvider } from './lib/auth'
import Navbar from './components/Navbar'
import Leaderboard from './pages/Leaderboard'
import Login from './pages/Login'
import Admin from './pages/Admin'
import SuperAdmin from './pages/SuperAdmin'

export default function App() {
  return (
    <AuthProvider>
      <Navbar />
      <Routes>
        <Route path="/"          element={<Leaderboard />} />
        <Route path="/login"     element={<Login />} />
        <Route path="/admin"     element={<Admin />} />
        <Route path="/superadmin" element={<SuperAdmin />} />
      </Routes>
    </AuthProvider>
  )
}
