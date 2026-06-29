import { useState, useEffect } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { calculateScore, qualifiesForShell, hasImmunity } from '../lib/scoring'

const ADMIN_EMAIL = 'simonjamesgreen@gmail.com'

export default function Admin() {
  const { user } = useAuth()

  const [league,   setLeague]   = useState(null)
  const [members,  setMembers]  = useState([])
  const [date,     setDate]     = useState(new Date().toISOString().split('T')[0])
  const [inputs,   setInputs]   = useState({})   // player_id -> { move_calories, exercise_minutes, stand_hours }
  const [saving,   setSaving]   = useState(false)
  const [saveMsg,  setSaveMsg]  = useState(null)
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState(null)

  const isAdmin = user?.email === ADMIN_EMAIL

  // Load league + members once
  useEffect(() => {
    if (!user || !isAdmin) { setLoading(false); return }
    loadData()
  }, [user])

  // Reload existing scores when date changes
  useEffect(() => {
    if (league && isAdmin) loadExisting()
  }, [date, league])

  async function loadData() {
    try {
      const { data: l, error: le } = await supabase
        .from('leagues').select('*').eq('status', 'active').single()
      if (le) throw le
      setLeague(l)

      const { data: m, error: me } = await supabase
        .from('league_members')
        .select('*, player:players(*)')
        .eq('league_id', l.id)
        .order('created_at')
      if (me) throw me
      setMembers(m || [])

      // Initialise empty inputs
      const blank = {}
      m?.forEach(mem => {
        blank[mem.player_id] = { move_calories: '', exercise_minutes: '', stand_hours: '' }
      })
      setInputs(blank)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function loadExisting() {
    const { data } = await supabase
      .from('daily_scores')
      .select('*')
      .eq('league_id', league.id)
      .eq('date', date)

    if (!data) return

    const filled = {}
    members.forEach(m => {
      const ex = data.find(s => s.player_id === m.player_id)
      filled[m.player_id] = ex
        ? { move_calories: String(ex.move_calories), exercise_minutes: String(ex.exercise_minutes), stand_hours: String(ex.stand_hours) }
        : { move_calories: '', exercise_minutes: '', stand_hours: '' }
    })
    setInputs(filled)
    setSaveMsg(null)
  }

  function setField(playerId, field, value) {
    setInputs(prev => ({ ...prev, [playerId]: { ...prev[playerId], [field]: value } }))
  }

  async function save() {
    setSaving(true)
    setSaveMsg(null)
    try {
      for (const mem of members) {
        const inp = inputs[mem.player_id]
        if (!inp.move_calories && !inp.exercise_minutes && !inp.stand_hours) continue

        const row = {
          league_id:        league.id,
          player_id:        mem.player_id,
          date,
          move_calories:    parseInt(inp.move_calories)    || 0,
          exercise_minutes: parseInt(inp.exercise_minutes) || 0,
          stand_hours:      parseInt(inp.stand_hours)      || 0,
        }

        const { error: ue } = await supabase
          .from('daily_scores')
          .upsert(row, { onConflict: 'league_id,player_id,date' })

        if (ue) throw ue
      }
      setSaveMsg('success')
      await loadExisting()
    } catch (err) {
      setSaveMsg('error:' + err.message)
    } finally {
      setSaving(false)
    }
  }

  // ── Guards ──────────────────────────────────────────
  if (!user)    return <Navigate to="/login" />
  if (!isAdmin) return (
    <main className="admin-page">
      <div className="alert alert-error" style={{ marginTop: '2rem' }}>
        Access denied. Only Simon can access this page.
      </div>
    </main>
  )
  if (loading) return <div className="loading-state">Loading…</div>
  if (error)   return <div className="loading-state">Error: {error}</div>

  // ── Render ──────────────────────────────────────────
  return (
    <main className="admin-page">
      <div className="admin-heading">
        <h1>Admin Panel</h1>
        <p>{league?.name} · Score Entry</p>
      </div>

      <div className="admin-card">
        <p className="admin-card-title">Enter Scores</p>

        <div className="date-row">
          <label htmlFor="score-date">Date</label>
          <input
            id="score-date"
            type="date"
            className="date-input"
            value={date}
            onChange={e => setDate(e.target.value)}
          />
        </div>

        <div className="score-grid-header">
          <span>Player</span>
          <span>Move cal</span>
          <span>Exercise min</span>
          <span>Stand hrs</span>
          <span>Score</span>
        </div>

        {members.map(mem => {
          const inp   = inputs[mem.player_id] || {}
          const score = calculateScore(
            parseInt(inp.move_calories)    || 0,
            mem.move_goal,
            parseInt(inp.exercise_minutes) || 0,
            parseInt(inp.stand_hours)      || 0,
          )

          return (
            <div key={mem.player_id} className="score-grid-row">
              <span
                className="score-player"
                style={{ color: mem.player.avatar_color }}
              >
                {mem.player.display_name}
              </span>
              <input
                type="number" min="0" max="9999"
                className="score-num-input"
                value={inp.move_calories}
                onChange={e => setField(mem.player_id, 'move_calories', e.target.value)}
                placeholder="Cal"
              />
              <input
                type="number" min="0" max="180"
                className="score-num-input"
                value={inp.exercise_minutes}
                onChange={e => setField(mem.player_id, 'exercise_minutes', e.target.value)}
                placeholder="Min"
              />
              <input
                type="number" min="0" max="24"
                className="score-num-input"
                value={inp.stand_hours}
                onChange={e => setField(mem.player_id, 'stand_hours', e.target.value)}
                placeholder="Hrs"
              />
              <span className={`score-preview ${hasImmunity(score) ? 'immune' : qualifiesForShell(score) ? 'qualifying' : ''}`}>
                {score > 0 ? `${score}%` : '—'}
              </span>
            </div>
          )
        })}

        {saveMsg === 'success' && (
          <div className="alert alert-success" style={{ marginTop: '1rem' }}>
            Scores saved ✓
          </div>
        )}
        {saveMsg?.startsWith('error:') && (
          <div className="alert alert-error" style={{ marginTop: '1rem' }}>
            {saveMsg.slice(6)}
          </div>
        )}

        <button className="save-btn" onClick={save} disabled={saving}>
          {saving ? 'Saving…' : 'Save Scores'}
        </button>
      </div>
    </main>
  )
}
