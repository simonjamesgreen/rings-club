import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { resolveAndGetStandings } from '../lib/shellEngine'
import PlayerCard from '../components/PlayerCard'
import TeamCard from '../components/TeamCard'

export default function Archive() {
  const [seasons, setSeasons]     = useState([])
  const [selected, setSelected]   = useState(null)
  const [standings, setStandings] = useState([])
  const [teamStandings, setTeamStandings] = useState([])
  const [tab, setTab]             = useState('individual')
  const [loading, setLoading]     = useState(true)
  const [loadingSeason, setLoadingSeason] = useState(false)

  useEffect(() => { loadSeasons() }, [])

  async function loadSeasons() {
    const { data } = await supabase
      .from('leagues')
      .select('*')
      .neq('status', 'active')
      .order('start_date', { ascending: false })
    setSeasons(data || [])
    if (data && data.length > 0) selectSeason(data[0])
    setLoading(false)
  }

  async function selectSeason(season) {
    setSelected(season)
    setLoadingSeason(true)
    const { standings: st, teamStandings: ts } = await resolveAndGetStandings(season.id)
    setStandings(st)
    setTeamStandings(ts || [])
    setLoadingSeason(false)
  }

  if (loading) return <div className="loading-state">Loading…</div>

  if (!seasons.length) {
    return (
      <main className="leaderboard-page">
        <div className="empty-state">
          <div className="empty-state-icon">🗄️</div>
          <h2>No archived seasons yet</h2>
          <p>Past seasons will appear here once completed.</p>
        </div>
      </main>
    )
  }

  const fmt = d => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

  return (
    <main className="leaderboard-page">
      <header className="leaderboard-header">
        <h1 className="leaderboard-title">🗄️ Archive</h1>
        <p className="leaderboard-meta">Past seasons</p>
      </header>

      {seasons.length > 1 && (
        <div className="tab-bar" style={{ marginBottom: '1rem' }}>
          {seasons.map(s => (
            <button
              key={s.id}
              className={`tab-btn ${selected?.id === s.id ? 'active' : ''}`}
              onClick={() => selectSeason(s)}
            >
              {s.name}
            </button>
          ))}
        </div>
      )}

      {selected && (
        <>
          <p className="daily-date-label" style={{ marginBottom: '1rem' }}>
            {fmt(selected.start_date)} – {fmt(selected.end_date)}
          </p>

          <div className="tab-bar">
            <button className={`tab-btn ${tab === 'individual' ? 'active' : ''}`} onClick={() => setTab('individual')}>
              Individual
            </button>
            <button className={`tab-btn ${tab === 'teams' ? 'active' : ''}`} onClick={() => setTab('teams')}>
              Teams
            </button>
          </div>

          {loadingSeason ? (
            <div className="loading-state">Loading…</div>
          ) : tab === 'individual' ? (
            <div className="standings-list">
              {standings.map((row, i) => (
                <PlayerCard
                  key={row.player_id}
                  rank={i + 1}
                  player={row.player}
                  totalScore={row.totalScore}
                  avgScore={row.avgScore}
                  todayScore={null}
                  todayPoints={null}
                  isImmune={false}
                  shells={{ red: 0, green: 0, blue: 0, mushrooms: 0, clouds: 0 }}
                />
              ))}
            </div>
          ) : (
            <div className="standings-list">
              {teamStandings.map((team, i) => (
                <TeamCard key={team.id} rank={i + 1} team={team} />
              ))}
            </div>
          )}
        </>
      )}
    </main>
  )
}
