import { useState, useEffect } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { calculateScore, qualifiesForShell, qualifiesForMushroom, hasImmunity } from '../lib/scoring'
import { resolveAndGetStandings, fireShell } from '../lib/shellEngine'
import ActivityFeed from '../components/ActivityFeed'

export default function Admin() {
  const { user } = useAuth()

  const [league,       setLeague]       = useState(null)
  const [me,           setMe]           = useState(null)
  const [standings,    setStandings]    = useState([])
  const [date,         setDate]         = useState(new Date().toISOString().split('T')[0])
  const [inputs,       setInputs]       = useState({ move_calories: '', exercise_minutes: '', stand_hours: '' })
  const [saving,       setSaving]       = useState(false)
  const [saveMsg,      setSaveMsg]      = useState(null)
  const [earnedShells, setEarnedShells] = useState([])
  const [firing,       setFiring]       = useState(null)
  const [fireMsg,      setFireMsg]      = useState(null)
  const [greenTarget,  setGreenTarget]  = useState('')
  const [loading,      setLoading]      = useState(true)
  const [error,        setError]        = useState(null)

  useEffect(() => { if (user) loadAll() }, [user])
  useEffect(() => { if (me && league) loadExisting() }, [date, me?.player_id])

  async function loadAll() {
    try {
      const { data: l, error: le } = await supabase
        .from('leagues').select('*').eq('status', 'active').single()
      if (le) throw le
      setLeague(l)

      const { standings } = await resolveAndGetStandings(l.id)
      setStandings(standings)

      const myRow = standings.find(s => s.player?.email === user.email)
      if (!myRow) throw new Error(`No player found for ${user.email} — ask Simon to check your account is linked.`)
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
    setEarnedShells([])
  }

  async function refreshStandings() {
    const { standings } = await resolveAndGetStandings(league.id)
    setStandings(standings)
    const myRow = standings.find(s => s.player?.email === user.email)
    if (myRow) setMe(myRow)
  }

  async function awardShellsIfEarned(score, exerciseMinutes) {
    const { data: existingEarns } = await supabase
      .from('powerup_events')
      .select('event_type')
      .eq('league_id', league.id)
      .eq('actor_player_id', me.player_id)
      .eq('date', date)
      .in('event_type', ['earn_red_shell', 'earn_green_shell', 'earn_blue_shell', 'earn_mushroom'])

    const alreadyEarnedShell = existingEarns?.some(e =>
      ['earn_red_shell', 'earn_green_shell', 'earn_blue_shell'].includes(e.event_type))
    const alreadyEarnedMushroom = existingEarns?.some(e => e.event_type === 'earn_mushroom')

    const earned = []
    const patch = {}

    if (qualifiesForShell(score) && !alreadyEarnedShell) {
      const types = ['red', 'green', 'blue']
      const type = types[Math.floor(Math.random() * 3)]
      const col = `${type}_shells`
      patch[col] = (me[col] || 0) + 1
      await supabase.from('powerup_events').insert({
        league_id: league.id, date,
        actor_player_id: me.player_id,
        event_type: `earn_${type}_shell`,
        quantity: 1, status: 'applied',
        notes: `Earned for ${score}% score`,
      })
      earned.push(type === 'red' ? '🔴 Red Shell' : type === 'green' ? '🟢 Green Shell' : '🔵 Blue Shell')
    }

    if (qualifiesForMushroom(exerciseMinutes) && !alreadyEarnedMushroom) {
      patch.mushrooms = (me.mushrooms || 0) + 1
      await supabase.from('powerup_events').insert({
        league_id: league.id, date,
        actor_player_id: me.player_id,
        event_type: 'earn_mushroom',
        quantity: 1, status: 'applied',
        notes: `Earned for ${exerciseMinutes} min exercise`,
      })
      earned.push('🍄 Mushroom')
    }

    if (Object.keys(patch).length > 0) {
      await supabase.from('league_members').update(patch).eq('id', me.id)
    }

    return earned
  }

  async function save() {
    setSaving(true)
    setSaveMsg(null)
    setEarnedShells([])
    try {
      const mc = parseInt(inputs.move_calories)    || 0
      const em = parseInt(inputs.exercise_minutes) || 0
      const sh = parseInt(inputs.stand_hours)      || 0

      const { error: ue } = await supabase.from('daily_scores').upsert({
        league_id: league.id, player_id: me.player_id, date,
        move_calories: mc, exercise_minutes: em, stand_hours: sh,
      }, { onConflict: 'league_id,player_id,date' })
      if (ue) throw ue

      const score = calculateScore(mc, me.move_goal, em, sh)
      const earned = await awardShellsIfEarned(score, em)

      setSaveMsg('success')
      setEarnedShells(earned)
      await refreshStandings()
    } catch (err) {
      setSaveMsg('error:' + err.message)
    } finally {
      setSaving(false)
    }
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
      setFireMsg('success')
      setGreenTarget('')
      await refreshStandings()
    } catch (err) {
      setFireMsg('error:' + err.message)
    } finally {
      setFiring(null)
    }
  }

  if (!user)   return <Navigate to="/login" />
  if (loading) return <div className="loading-state">Loading…</div>
  if (error)   return <main className="admin-page"><div className="alert alert-error" style={{ marginTop: '2rem' }}>{error}</div></main>

  const mc    = parseInt(inputs.move_calories)    || 0
  const em    = parseInt(inputs.exercise_minutes) || 0
  const sh    = parseInt(inputs.stand_hours)      || 0
  const score = calculateScore(mc, me.move_goal, em, sh)
  const isImmune    = hasImmunity(score)
  const isQualified = qualifiesForShell(score)
  const earnsShroom = qualifiesForMushroom(em)

  const otherPlayers = standings.filter(s => s.player_id !== me.player_id)

  const shellDefs = [
    { key: 'red',      icon: '🔴', label: 'Red Shell',   sub: 'Halves today\'s leader',        count: me.red_shells   },
    { key: 'green',    icon: '🟢', label: 'Green Shell', sub: 'Halves your chosen target',      count: me.green_shells },
    { key: 'blue',     icon: '🔵', label: 'Blue Shell',  sub: 'Punishes the season leader',     count: me.blue_shells  },
    { key: 'mushroom', icon: '🍄', label: 'Mushroom',    sub: '+50% to your score today',       count: me.mushrooms    },
  ]

  return (
    <main className="admin-page">
      <div className="admin-heading">
        <h1 style={{ color: me.player.avatar_color }}>
          {me.player.display_name}
        </h1>
        <p>{league?.name} · My Day</p>
      </div>

      {/* SCORE ENTRY */}
      <div className="admin-card">
        <p className="admin-card-title">Enter Your Score · <span style={{ color: "var(--text-muted)", fontWeight: 600 }}>Goal: {me.move_goal} cal</span></p>

        <div className="date-row">
          <label htmlFor="score-date">Date</label>
          <input id="score-date" type="date" className="date-input"
            value={date} onChange={e => setDate(e.target.value)} />
        </div>

        <div className="score-entry-vertical">
          <div className="score-entry-field">
            <label className="score-entry-label">Move Calories</label>
            <input type="number" min="0" max="9999" className="score-entry-input"
              value={inputs.move_calories}
              onChange={e => setInputs(p => ({ ...p, move_calories: e.target.value }))}
              placeholder="0" inputMode="numeric" />
          </div>
          <div className="score-entry-field">
            <label className="score-entry-label">Exercise Minutes</label>
            <input type="number" min="0" max="180" className="score-entry-input"
              value={inputs.exercise_minutes}
              onChange={e => setInputs(p => ({ ...p, exercise_minutes: e.target.value }))}
              placeholder="0" inputMode="numeric" />
          </div>
          <div className="score-entry-field">
            <label className="score-entry-label">Stand Hours</label>
            <input type="number" min="0" max="24" className="score-entry-input"
              value={inputs.stand_hours}
              onChange={e => setInputs(p => ({ ...p, stand_hours: e.target.value }))}
              placeholder="0" inputMode="numeric" />
          </div>
        </div>

        {score > 0 && (
          <div className={`score-preview-big ${isImmune ? 'immune' : isQualified ? 'qualifying' : ''}`}>
            <span className="score-preview-num">{score}%</span>
            <span className="score-preview-tags">
              {isImmune    && <span className="tag tag-immune">⚡ Immune</span>}
              {isQualified && !isImmune && <span className="tag tag-shell">🐚 Shell earned</span>}
              {earnsShroom && <span className="tag tag-shroom">🍄 Mushroom earned</span>}
            </span>
          </div>
        )}

        {earnedShells.length > 0 && (
          <div className="earn-banner">
            🎉 You earned: {earnedShells.join(' + ')}
          </div>
        )}

        {saveMsg === 'success' && earnedShells.length === 0 && (
          <div className="alert alert-success" style={{ marginTop: '1rem' }}>Score saved ✓</div>
        )}
        {saveMsg?.startsWith('error:') && (
          <div className="alert alert-error" style={{ marginTop: '1rem' }}>{saveMsg.slice(6)}</div>
        )}

        <button className="save-btn" onClick={save} disabled={saving}>
          {saving ? 'Saving…' : 'Save Score'}
        </button>
      </div>

      {/* SHELL INVENTORY + FIRE */}
      <div className="admin-card">
        <p className="admin-card-title">Your Power-Ups</p>

        {fireMsg === 'success' && (
          <div className="alert alert-success">Fired! Resolves when today's scores are in.</div>
        )}
        {fireMsg?.startsWith('error:') && (
          <div className="alert alert-error">{fireMsg.slice(6)}</div>
        )}

        <div className="shell-fire-grid">
          {shellDefs.map(s => (
            <div key={s.key} className={`shell-fire-card ${s.count < 1 ? 'shell-empty' : ''}`}>
              <div className="shell-fire-top">
                <span className="shell-fire-label">{s.icon} {s.label}</span>
                <span className={`shell-fire-count ${s.count > 0 ? 'has-shells' : ''}`}>{s.count}</span>
              </div>
              <p className="shell-fire-sub">{s.sub}</p>

              {s.key === 'green' && s.count > 0 && (
                <select className="shell-target-select" value={greenTarget}
                  onChange={e => setGreenTarget(e.target.value)}>
                  <option value="">Choose target…</option>
                  {otherPlayers.map(p => (
                    <option key={p.player_id} value={p.player_id}>{p.player.display_name}</option>
                  ))}
                </select>
              )}

              <button className="shell-fire-btn" disabled={s.count < 1 || firing === s.key}
                onClick={() => handleFire(s.key)}>
                {firing === s.key ? 'Firing…' : s.count < 1 ? 'None' : 'Fire'}
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
              <span className="inventory-name" style={{ color: s.player.avatar_color }}>
                {s.player.display_name}
              </span>
              <div className="inventory-shells">
                <span className={s.red_shells   > 0 ? 'inv-shell inv-red'   : 'inv-shell inv-zero'}>🔴 {s.red_shells}</span>
                <span className={s.green_shells > 0 ? 'inv-shell inv-green' : 'inv-shell inv-zero'}>🟢 {s.green_shells}</span>
                <span className={s.blue_shells  > 0 ? 'inv-shell inv-blue'  : 'inv-shell inv-zero'}>🔵 {s.blue_shells}</span>
                <span className={s.mushrooms    > 0 ? 'inv-shell inv-mush'  : 'inv-shell inv-zero'}>🍄 {s.mushrooms}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <ActivityFeed leagueId={league.id} standings={standings} />
    </main>
  )
}
