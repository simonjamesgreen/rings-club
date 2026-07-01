import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../lib/auth'

const SIMON = 'simonjamesgreen@gmail.com'

export default function Navbar() {
  const { user, signOut } = useAuth()
  const navigate  = useNavigate()
  const location  = useLocation()
  const isActive  = (path) => location.pathname === path

  const handleSignOut = async () => {
    await signOut()
    navigate('/')
  }

  return (
    <nav className="navbar">
      <Link to="/" className="navbar-logo">🏁 Rings Club</Link>
      <div className="navbar-actions">
        <Link to="/rules" className={`nav-link ${isActive('/rules') ? 'nav-link-active' : ''}`}>
          Rules
        </Link>
        {user ? (
          <>
            {user.email === SIMON && (
              <Link to="/superadmin" className="nav-link nav-link-admin" title="Admin Override">⚙️</Link>
            )}
            <button onClick={handleSignOut} className="nav-link">Sign out</button>
          </>
        ) : (
          <Link to="/login" className="nav-btn">Sign in</Link>
        )}
      </div>
    </nav>
  )
}
