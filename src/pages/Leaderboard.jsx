import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { calculateScore } from '../lib/scoring'
import PlayerCard from '../components/PlayerCard'

export default function Leaderboard() {
  const [league,    setLeague]    = useState(null)
  const [standings, setStandings] = useState([])
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState(null)

  useEffect(() => { load() }, [])

  async function load() {
    try {
      // Active league
      const { data: league, error: le } = await supabase
        .from('leagues')
        .select('*')
        .eq('status', 'active')
        .single()

      if (le) throw le
      setLeague(league)

      // Members with player info
      const { data: members, error: me } = await supabase
        .from('league_members')
        .select('*, player:players(*)')
        .eq('league_id', league.id)

      if (me) throw me

      // All daily scores for this league
      const { data: scores, error: se } = await supabase
        .from('daily_scores')
        .select('*')
        .eq('league_id', league.id)

      if (se) throw se

      const today = new Date().toISOString().split('T')[0]

      const rows = members.map(m => {
        const playerScores = scores.filter(s => s.player_id === m.player_id)

        const totalScore = playerScores.reduce((sum, s) => {
          return sum + calculateScore(s.move_calories, m.move_goal, s.exercise_minutes, s.stand_hours)
        }, 0)

        const todayRow   = playerScores.find(s => s.date === today)
        const todayScore = todayRow
          ? calculateScore(todayRow.move_calories, m.move_goal, todayRow.exercise_minutes, todayRow.stand_hours)
          : null

        return {
          ...m,
          totalScore,
          todayScore,
        }
      })

      rows.sort((a, b) => b.totalScore - a.totalScore)
      setStandings(rows)
    } catch (err) {
      console.error(err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  if (loading) return <div className="loading-state">Loading…</div>
  if (error)   return <div className="loading-state">Error: {error}</div>
  if (!league) return <div className="empty-state">No active league found.</div>

  const startDate = new Date(league.start_date).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric'
  })

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
            shells={{
              red:       row.red_shells,
              green:     row.green_shells,
              blue:      row.blue_shells,
              mushrooms: row.mushrooms,
            }}
          />
        ))}
      </div>
    </main>
  )
}
