import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'

const SIMON = 'simonjamesgreen@gmail.com'

export default function Navbar() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()

  const handleSignOut = async () => {
    await signOut()
    navigate('/')
  }

  return (
    <nav className="navbar">
      <Link to="/" className="navbar-logo">🏁 Rings Club</Link>
      <div className="navbar-actions">
        {user ? (
          <>
            {user.email === SIMON && (
              <Link to="/superadmin" className="nav-link nav-link-admin" title="Admin">⚙️</Link>
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
