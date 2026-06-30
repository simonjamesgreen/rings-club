import { useState, useEffect } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { calculateScore } from '../lib/scoring'
import { resolveAndGetStandings, fireShell } from '../lib/shellEngine'

export default function Admin() {
  const { user } = useAuth()

  const [league,   setLeague]   = useState(null)
  const [me,       setMe]       = useState(null)   // my league_member row
  const [standings,setStandings]= useState([])     // everyone, for shell visibility + green target
  const [date,     setDate]     = useState(new Date().toISOString().split('T')[0])
  const [inputs,   setInputs]   = useState({ move_calories: '', exercise_minutes: '', stand_hours: '' })
  const [saving,   setSaving]   = useState(false)
  const [saveMsg,  setSaveMsg]  = useState(null)
  const [firing,   setFiring]   = useState(null)
  const [fireMsg,  setFireMsg]  = useState(null)
  const [greenTarget, setGreenTarget] = useState('')
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState(null)

  useEffect(() => { if (user) loadAll() }, [user])
  useEffect(() => { if (me) loadExisting() }, [date, me])

  async function loadAll() {
    try {
      const { data: l, error: le } = await supabase
        .from('leagues').select('*').eq('status', 'active').single()
      if (le) throw le
      setLeague(l)

      const { league, standings } = await resolveAndGetStandings(l.id)
      setStandings(standings)

      const myRow = standings.find(s => s.player.email === user.email)
      if (!myRow) throw new Error(`No player record found for ${user.email}. Ask Simon to link your account.`)
      setMe(myRow)
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
      .eq('player_id', me.player_id)
      .eq('date', date)
      .maybeSingle()

    setInputs(data
      ? { move_calories: String(data.move_calories), exercise_minutes: String(data.exercise_minutes), stand_hours: String(data.stand_hours) }
      : { move_calories: '', exercise_minutes: '', stand_hours: '' })
    setSaveMsg(null)
  }

  function setField(field, value) {
    setInputs(prev => ({ ...prev, [field]: value }))
  }

  async function save() {
    setSaving(true)
    setSaveMsg(null)
    try {
      const row = {
        league_id:        league.id,
        player_id:        me.player_id,
        date,
        move_calories:    parseInt(inputs.move_calories)    || 0,
        exercise_minutes: parseInt(inputs.exercise_minutes) || 0,
        stand_hours:      parseInt(inputs.stand_hours)      || 0,
      }
      const { error: ue } = await supabase
        .from('daily_scores')
        .upsert(row, { onConflict: 'league_id,player_id,date' })
      if (ue) throw ue

      setSaveMsg('success')
      await refreshStandings()
    } catch (err) {
      setSaveMsg('error:' + err.message)
    } finally {
      setSaving(false)
    }
  }

  async function refreshStandings() {
    const { standings } = await resolveAndGetStandings(league.id)
    setStandings(standings)
    const myRow = standings.find(s => s.player.email === user.email)
    setMe(myRow)
  }

  async function handleFire(shellType) {
    if (shellType === 'green' && !greenTarget) {
      setFireMsg('error:Pick who to target first')
      return
    }
    setFiring(shellType)
    setFireMsg(null)
    try {
      await fireShell(league.id, me.id, me.player_id, shellType, shellType === 'green' ? greenTarget : null)
      setFireMsg('success:' + shellType)
      setGreenTarget('')
      await refreshStandings()
    } catch (err) {
      setFireMsg('error:' + err.message)
    } finally {
      setFiring(null)
    }
  }

  // ── Guards ──────────────────────────────────────────
  if (!user)    return <Navigate to="/login" />
  if (loading)  return <div className="loading-state">Loading…</div>
  if (error)    return <main className="admin-page"><div className="alert alert-error" style={{ marginTop: '2rem' }}>{error}</div></main>

  const score = calculateScore(
    parseInt(inputs.move_calories)    || 0,
    me.move_goal,
    parseInt(inputs.exercise_minutes) || 0,
    parseInt(inputs.stand_hours)      || 0,
  )

  const otherPlayers = standings.filter(s => s.player_id !== me.player_id)

  const shellDefs = [
    { key: 'red',      label: '🔴 Red Shell',   sub: 'Auto-hits today\'s leader',     count: me.red_shells },
    { key: 'green',    label: '🟢 Green Shell', sub: 'Pick your target',              count: me.green_shells },
    { key: 'blue',     label: '🔵 Blue Shell',  sub: 'Auto-hits season leader',       count: me.blue_shells },
    { key: 'mushroom', label: '🍄 Mushroom',    sub: '+50% to your own score today',  count: me.mushrooms },
  ]

  return (
    <main className="admin-page">
      <div className="admin-heading">
        <h1>My Day</h1>
        <p>{league?.name} · {me.player.display_name}</p>
      </div>

      {/* SCORE ENTRY */}
      <div className="admin-card">
        <p className="admin-card-title">Enter Your Score</p>

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

        <div className="score-grid-row">
          <span className="score-player" style={{ color: me.player.avatar_color }}>
            {me.player.display_name}
          </span>
          <input
            type="number" min="0" max="9999"
            className="score-num-input"
            value={inputs.move_calories}
            onChange={e => setField('move_calories', e.target.value)}
            placeholder="Cal"
          />
          <input
            type="number" min="0" max="180"
            className="score-num-input"
            value={inputs.exercise_minutes}
            onChange={e => setField('exercise_minutes', e.target.value)}
            placeholder="Min"
          />
          <input
            type="number" min="0" max="24"
            className="score-num-input"
            value={inputs.stand_hours}
            onChange={e => setField('stand_hours', e.target.value)}
            placeholder="Hrs"
          />
          <span className={`score-preview ${score >= 300 ? 'immune' : score >= 150 ? 'qualifying' : ''}`}>
            {score > 0 ? `${score}%` : '—'}
          </span>
        </div>

        {saveMsg === 'success' && <div className="alert alert-success" style={{ marginTop: '1rem' }}>Score saved ✓</div>}
        {saveMsg?.startsWith('error:') && <div className="alert alert-error" style={{ marginTop: '1rem' }}>{saveMsg.slice(6)}</div>}

        <button className="save-btn" onClick={save} disabled={saving}>
          {saving ? 'Saving…' : 'Save Score'}
        </button>
      </div>

      {/* SHELL INVENTORY + FIRE */}
      <div className="admin-card">
        <p className="admin-card-title">Your Power-Ups</p>

        {fireMsg?.startsWith('error:') && <div className="alert alert-error">{fireMsg.slice(6)}</div>}
        {fireMsg?.startsWith('success:') && <div className="alert alert-success">Fired! It'll resolve once today's scores are in.</div>}

        <div className="shell-fire-grid">
          {shellDefs.map(s => (
            <div key={s.key} className="shell-fire-card">
              <div className="shell-fire-top">
                <span className="shell-fire-label">{s.label}</span>
                <span className="shell-fire-count">{s.count}</span>
              </div>
              <p className="shell-fire-sub">{s.sub}</p>

              {s.key === 'green' && s.count > 0 && (
                <select
                  className="shell-target-select"
                  value={greenTarget}
                  onChange={e => setGreenTarget(e.target.value)}
                >
                  <option value="">Choose target…</option>
                  {otherPlayers.map(p => (
                    <option key={p.player_id} value={p.player_id}>{p.player.display_name}</option>
                  ))}
                </select>
              )}

              <button
                className="shell-fire-btn"
                disabled={s.count < 1 || firing === s.key}
                onClick={() => handleFire(s.key)}
              >
                {firing === s.key ? 'Firing…' : 'Fire'}
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* EVERYONE'S SHELLS */}
      <div className="admin-card">
        <p className="admin-card-title">Everyone's Inventory</p>
        <div className="inventory-grid">
          {standings.map(s => (
            <div key={s.player_id} className="inventory-row">
              <span className="inventory-name" style={{ color: s.player.avatar_color }}>{s.player.display_name}</span>
              <span className="inventory-shells">
                🔴 {s.red_shells} &nbsp; 🟢 {s.green_shells} &nbsp; 🔵 {s.blue_shells} &nbsp; 🍄 {s.mushrooms}
              </span>
            </div>
          ))}
        </div>
      </div>
    </main>
  )
}
