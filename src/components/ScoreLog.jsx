import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { calculateScore } from '../lib/scoring'

function formatBST(iso) {
  const d = new Date(iso)
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  }).formatToParts(d)
  const h   = parts.find(p => p.type === 'hour').value
  const min = parts.find(p => p.type === 'minute').value
  const s   = parts.find(p => p.type === 'second').value
  const date = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London', day: 'numeric', month: 'short',
  }).format(d)
  return `${h}:${min}:${s} · ${date} BST`
}

export default function ScoreLog({ leagueId, standings }) {
  const [entries, setEntries] = useState([])

  useEffect(() => { load() }, [leagueId])

  async function load() {
    const { data } = await supabase
      .from('daily_scores')
      .select('*, player:players(display_name, avatar_color)')
      .eq('league_id', leagueId)
      .order('updated_at', { ascending: false })
      .limit(30)
    setEntries(data || [])
  }

  const goalOf = pid => standings.find(s => s.player_id === pid)?.move_goal || 500

  if (!entries.length) return null

  return (
    <div className="score-log">
      <p className="admin-card-title">Score Log</p>
      {entries.map(e => {
        const score   = calculateScore(e.move_calories, goalOf(e.player_id), e.exercise_minutes, e.stand_hours)
        const exDate  = new Date(e.date + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
        const qualifies = score >= 125

        return (
          <div key={e.id} className="score-log-row">
            <div className="score-log-left">
              <span className="score-log-name" style={{ color: e.player.avatar_color }}>
                {e.player.display_name}
              </span>
              <span className="score-log-date">{exDate}</span>
            </div>
            <div className="score-log-right">
              <span className={`score-log-pct ${score >= 300 ? 'immune' : qualifies ? 'qualifying' : ''}`}>
                {score}%
              </span>
              <span className="score-log-detail">
                {e.move_calories} cal · {e.exercise_minutes}m · {e.stand_hours}h
              </span>
              <span className="score-log-time">{formatBST(e.updated_at)}</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}
