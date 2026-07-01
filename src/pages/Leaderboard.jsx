import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { resolveAndGetStandings } from '../lib/shellEngine'
import { useAuth } from '../lib/auth'
import PlayerCard from '../components/PlayerCard'
import ActivityFeed from '../components/ActivityFeed'

export default function Leaderboard() {
  const { user } = useAuth()
  const [league,    setLeague]    = useState(null)
  const [standings, setStandings] = useState([])
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState(null)

  useEffect(() => { load() }, [])

  async function load() {
    try {
      const { data: activeLeague, error: le } = await supabase
        .from('leagues').select('*').eq('status', 'active').single()
      if (le) throw le

      const { league, standings } = await resolveAndGetStandings(activeLeague.id)
      setLeague(league)
      setStandings(standings)
    } catch (err) {
      console.error(err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  if (loading) return <div className="loading-state">Loading…</div>
  if (error)   return <div className="loading-state">Error: {error}</div>
  if (!league) return (
    <div className="empty-state">
      <div className="empty-state-icon">🏁</div>
      <h2>No active league</h2>
      <p>Ask Simon to set one up.</p>
    </div>
  )

  const startDate = new Date(league.start_date).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric'
  })

  const hasScores = standings.some(s => s.totalScore > 0)

  return (
    <main className="leaderboard-page">
      <header className="leaderboard-header">
        <h1 className="leaderboard-title">{league.name}</h1>
        <p className="leaderboard-meta">Started {startDate}</p>
      </header>

      <div className="standings-list">
        {standings.map((row, i) => (
          <PlayerCard
            key={row.player_id}
            rank={i + 1}
            player={row.player}
            totalScore={row.totalScore}
            todayScore={row.todayScore}
            isImmune={row.todayImmune}
            shells={{
              red:       row.red_shells,
              green:     row.green_shells,
              blue:      row.blue_shells,
              mushrooms: row.mushrooms,
            }}
          />
        ))}
      </div>

      {!hasScores && (
        <div className="empty-state" style={{ marginTop: '2rem' }}>
          <div className="empty-state-icon">🎮</div>
          <h2>Race not started</h2>
          <p>Sign in and enter your first score to get going.</p>
        </div>
      )}

      {user && <ActivityFeed leagueId={league.id} standings={standings} />}
    </main>
  )
}
