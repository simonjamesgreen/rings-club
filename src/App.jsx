import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './lib/auth'
import Navbar from './components/Navbar'
import Home from './pages/Home'
import Login from './pages/Login'
import Rules from './pages/Rules'
import SuperAdmin from './pages/SuperAdmin'

export default function App() {
  return (
    <AuthProvider>
      <Navbar />
      <Routes>
        <Route path="/"           element={<Home />} />
        <Route path="/login"      element={<Login />} />
        <Route path="/rules"      element={<Rules />} />
        <Route path="/superadmin" element={<SuperAdmin />} />
        <Route path="/admin"      element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  )
}
