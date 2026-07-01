import { useState, useEffect } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { calculateScore } from '../lib/scoring'
import { resolveAndGetStandings } from '../lib/shellEngine'

const SIMON = 'simonjamesgreen@gmail.com'

export default function SuperAdmin() {
  const { user } = useAuth()

  const [league,    setLeague]    = useState(null)
  const [standings, setStandings] = useState([])
  const [date,      setDate]      = useState(new Date().toISOString().split('T')[0])
  const [inputs,    setInputs]    = useState({})    // player_id -> { move_calories, exercise_minutes, stand_hours }
  const [saving,    setSaving]    = useState(false)
  const [saveMsg,   setSaveMsg]   = useState(null)
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState(null)

  useEffect(() => { if (user?.email === SIMON) loadAll() }, [user])
  useEffect(() => { if (league) loadExisting() }, [date, league?.id])

  async function loadAll() {
    try {
      const { data: l, error: le } = await supabase
        .from('leagues').select('*').eq('status', 'active').single()
      if (le) throw le
      setLeague(l)

      const { standings } = await resolveAndGetStandings(l.id)
      setStandings(standings)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function loadExisting() {
    const { data } = await supabase
      .from('daily_scores').select('*')
      .eq('league_id', league.id).eq('date', date)

    const filled = {}
    standings.forEach(m => {
      const ex = data?.find(s => s.player_id === m.player_id)
      filled[m.player_id] = ex
        ? { move_calories: String(ex.move_calories), exercise_minutes: String(ex.exercise_minutes), stand_hours: String(ex.stand_hours) }
        : { move_calories: '', exercise_minutes: '', stand_hours: '' }
    })
    setInputs(filled)
    setSaveMsg(null)
  }

  async function refreshStandings() {
    const { standings } = await resolveAndGetStandings(league.id)
    setStandings(standings)
  }

  function setField(pid, field, value) {
    setInputs(prev => ({ ...prev, [pid]: { ...prev[pid], [field]: value } }))
  }

  async function saveScores() {
    setSaving(true)
    setSaveMsg(null)
    try {
      for (const m of standings) {
        const inp = inputs[m.player_id]
        if (!inp || (!inp.move_calories && !inp.exercise_minutes && !inp.stand_hours)) continue
        const { error } = await supabase.from('daily_scores').upsert({
          league_id: league.id, player_id: m.player_id, date,
          move_calories:    parseInt(inp.move_calories)    || 0,
          exercise_minutes: parseInt(inp.exercise_minutes) || 0,
          stand_hours:      parseInt(inp.stand_hours)      || 0,
        }, { onConflict: 'league_id,player_id,date' })
        if (error) throw error
      }
      setSaveMsg('success')
      await refreshStandings()
    } catch (err) {
      setSaveMsg('error:' + err.message)
    } finally {
      setSaving(false)
    }
  }

  async function adjustShell(memberId, col, delta) {
    const member = standings.find(s => s.id === memberId)
    if (!member) return
    const current = member[col] || 0
    const next = Math.max(0, current + delta)
    await supabase.from('league_members').update({ [col]: next }).eq('id', memberId)
    await refreshStandings()
  }

  if (!user) return <Navigate to="/login" />
  if (user.email !== SIMON) return (
    <main className="admin-page">
      <div className="alert alert-error" style={{ marginTop: '3rem' }}>Access denied.</div>
    </main>
  )
  if (loading) return <div className="loading-state">Loading…</div>
  if (error)   return <main className="admin-page"><div className="alert alert-error" style={{ marginTop: '2rem' }}>{error}</div></main>

  return (
    <main className="admin-page">
      <div className="admin-heading">
        <h1>⚙️ Admin Override</h1>
        <p>{league?.name} · Simon only</p>
      </div>

      {/* ALL PLAYER SCORES */}
      <div className="admin-card">
        <p className="admin-card-title">Score Entry — All Players</p>

        <div className="date-row">
          <label>Date</label>
          <input type="date" className="date-input" value={date}
            onChange={e => setDate(e.target.value)} />
        </div>

        {standings.map(m => {
          const inp = inputs[m.player_id] || {}
          const score = calculateScore(
            parseInt(inp.move_calories)    || 0,
            m.move_goal,
            parseInt(inp.exercise_minutes) || 0,
            parseInt(inp.stand_hours)      || 0,
          )
          return (
            <div key={m.player_id} className="superadmin-player-row">
              <div className="superadmin-player-header">
                <span className="score-player" style={{ color: m.player.avatar_color }}>
                  {m.player.display_name}
                </span>
                <span className={`score-preview ${score >= 300 ? 'immune' : score >= 150 ? 'qualifying' : ''}`}>
                  {score > 0 ? `${score}%` : '—'}
                </span>
              </div>
              <div className="superadmin-inputs">
                <div className="score-entry-field">
                  <label className="score-entry-label">Move Cal</label>
                  <input type="number" min="0" max="9999" className="score-entry-input"
                    value={inp.move_calories}
                    onChange={e => setField(m.player_id, 'move_calories', e.target.value)}
                    placeholder="0" inputMode="numeric" />
                </div>
                <div className="score-entry-field">
                  <label className="score-entry-label">Exercise Min</label>
                  <input type="number" min="0" max="180" className="score-entry-input"
                    value={inp.exercise_minutes}
                    onChange={e => setField(m.player_id, 'exercise_minutes', e.target.value)}
                    placeholder="0" inputMode="numeric" />
                </div>
                <div className="score-entry-field">
                  <label className="score-entry-label">Stand Hrs</label>
                  <input type="number" min="0" max="24" className="score-entry-input"
                    value={inp.stand_hours}
                    onChange={e => setField(m.player_id, 'stand_hours', e.target.value)}
                    placeholder="0" inputMode="numeric" />
                </div>
              </div>
            </div>
          )
        })}

        {saveMsg === 'success' && <div className="alert alert-success" style={{ marginTop: '1rem' }}>Scores saved ✓</div>}
        {saveMsg?.startsWith('error:') && <div className="alert alert-error" style={{ marginTop: '1rem' }}>{saveMsg.slice(6)}</div>}

        <button className="save-btn" onClick={saveScores} disabled={saving}>
          {saving ? 'Saving…' : 'Save All Scores'}
        </button>
      </div>

      {/* SHELL INVENTORY MANAGEMENT */}
      <div className="admin-card">
        <p className="admin-card-title">Shell Inventory — Manual Adjust</p>
        <div className="inventory-adjust-grid">
          {standings.map(m => (
            <div key={m.player_id} className="inventory-adjust-row">
              <span className="inventory-name" style={{ color: m.player.avatar_color }}>
                {m.player.display_name}
              </span>
              <div className="shell-adjusters">
                {[
                  { col: 'red_shells',   icon: '🔴', val: m.red_shells   },
                  { col: 'green_shells', icon: '🟢', val: m.green_shells },
                  { col: 'blue_shells',  icon: '🔵', val: m.blue_shells  },
                  { col: 'mushrooms',    icon: '🍄', val: m.mushrooms    },
                ].map(s => (
                  <div key={s.col} className="shell-adjuster">
                    <button className="adj-btn" onClick={() => adjustShell(m.id, s.col, -1)} disabled={s.val < 1}>−</button>
                    <span className="adj-val">{s.icon} {s.val}</span>
                    <button className="adj-btn" onClick={() => adjustShell(m.id, s.col, +1)}>+</button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  )
}
