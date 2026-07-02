import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { resolveAndGetStandings, fireShell } from '../lib/shellEngine'
import { calculateScore, qualifiesForShell, hasImmunity } from '../lib/scoring'
import { useAuth } from '../lib/auth'
import PlayerCard from '../components/PlayerCard'
import TeamCard from '../components/TeamCard'
import ActivityFeed from '../components/ActivityFeed'

export default function Home() {
  const { user } = useAuth()

  // Shared
  const [league,    setLeague]    = useState(null)
  const [standings, setStandings] = useState([])
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState(null)

  const [teamStandings, setTeamStandings] = useState([])
  const [activeTab,     setActiveTab]     = useState('individual') // 'individual' | 'teams'

  // My Day
  const [me,           setMe]           = useState(null)
  const [date,         setDate]         = useState(new Date().toISOString().split('T')[0])
  const [inputs,       setInputs]       = useState({ move_calories: '', exercise_minutes: '', stand_hours: '' })
  const [saving,       setSaving]       = useState(false)
  const [saveMsg,      setSaveMsg]      = useState(null)
  const [earnedShells, setEarnedShells] = useState([])
  const [firing,       setFiring]       = useState(null)
  const [fireMsg,      setFireMsg]      = useState(null)
  const [greenTarget,  setGreenTarget]  = useState('')

  useEffect(() => { load() }, [user])
  useEffect(() => { if (me && league) loadExisting() }, [date, me?.player_id])

  async function load() {
    try {
      setLoading(true)
      const { data: l, error: le } = await supabase
        .from('leagues').select('*').eq('status', 'active').single()
      if (le) throw le

      const { league: lg, standings: st, teamStandings: ts } = await resolveAndGetStandings(l.id)
      setLeague(lg)
      setStandings(st)
      setTeamStandings(ts || [])

      if (user) {
        const myRow = st.find(s => s.player?.email === user.email)
        setMe(myRow || null)
      } else {
        setMe(null)
      }
    } catch (err) {
      console.error(err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function loadExisting() {
    const { data } = await supabase
      .from('daily_scores').select('*')
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

  async function refreshAll() {
    const { standings: st, teamStandings: ts } = await resolveAndGetStandings(league.id)
    setStandings(st)
    setTeamStandings(ts || [])
    if (user) {
      const myRow = st.find(s => s.player?.email === user.email)
      setMe(myRow || null)
    }
  }

  async function awardShellsIfEarned(score) {
    // Threshold: 150% (qualifiesForShell)
    if (!qualifiesForShell(score)) return []

    // Only award once per day
    const { data: existingEarns } = await supabase
      .from('powerup_events').select('event_type')
      .eq('league_id', league.id)
      .eq('actor_player_id', me.player_id)
      .eq('date', date)
      .in('event_type', ['earn_red_shell', 'earn_green_shell', 'earn_blue_shell', 'earn_mushroom'])

    const alreadyEarned = existingEarns?.some(e =>
      ['earn_red_shell', 'earn_green_shell', 'earn_blue_shell', 'earn_mushroom'].includes(e.event_type))
    if (alreadyEarned) return []

    // Cycle-based earning: track which of the 4 types earned this cycle
    const ALL_TYPES = ['red', 'green', 'blue', 'mushroom']
    const earnedThisCycle = me.shells_earned_this_cycle || []
    const activeCycle = earnedThisCycle.length >= 4 ? [] : earnedThisCycle

    // Pick randomly from types not yet earned this cycle
    const available = ALL_TYPES.filter(t => !activeCycle.includes(t))
    const type = available[Math.floor(Math.random() * available.length)]

    const col       = type === 'mushroom' ? 'mushrooms' : `${type}_shells`
    const eventType = type === 'mushroom' ? 'earn_mushroom' : `earn_${type}_shell`
    const newCycle  = [...activeCycle, type]
    const cycleComplete = newCycle.length >= 4

    await supabase.from('league_members').update({
      [col]: (me[col] || 0) + 1,
      shells_earned_this_cycle: cycleComplete ? [] : newCycle,
    }).eq('id', me.id)

    await supabase.from('powerup_events').insert({
      league_id: league.id, date, actor_player_id: me.player_id,
      event_type: eventType, quantity: 1, status: 'applied',
      notes: `Cycle [${newCycle.join(',')}]${cycleComplete ? ' → reset' : ''}`,
    })

    const labels = { red: '🔴 Red Shell', green: '🟢 Green Shell', blue: '🔵 Blue Shell', mushroom: '🍄 Mushroom' }
    return [labels[type]]
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
      const earned = await awardShellsIfEarned(score)
      setSaveMsg('success')
      setEarnedShells(earned)
      await refreshAll()
    } catch (err) {
      setSaveMsg('error:' + err.message)
    } finally {
      setSaving(false)
    }
  }

  function getBSTHour() {
    return parseInt(new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/London',
      hour: 'numeric',
      hour12: false,
    }).format(new Date()))
  }

  async function handleFire(shellType) {
    const bstHour = getBSTHour()
    if (bstHour < 7 || bstHour >= 23) {
      setFireMsg('error:Shells can only be fired between 7:00am and 11:00pm BST')
      return
    }
    if (shellType === 'green' && !greenTarget) {
      setFireMsg('error:Pick a target first')
      return
    }
    setFiring(shellType)
    setFireMsg(null)
    try {
      await fireShell(league.id, me.id, me.player_id, shellType, shellType === 'green' ? greenTarget : null)
      setFireMsg('success')
      setGreenTarget('')
      await refreshAll()
    } catch (err) {
      setFireMsg('error:' + err.message)
    } finally {
      setFiring(null)
    }
  }

  // ── Render ──────────────────────────────────
  if (loading) return <div className="loading-state">Loading…</div>
  if (error)   return <div className="loading-state">Error: {error}</div>
  if (!league) return (
    <div className="empty-state">
      <div className="empty-state-icon">🏁</div>
      <h2>No active league</h2>
      <p>Ask Simon to set one up.</p>
    </div>
  )

  const fmt = (d) => new Date(d).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric'
  })
  const startDate = fmt(league.start_date)
  const endDate   = league.end_date ? fmt(league.end_date) : null

  // My Day computed
  const mc    = parseInt(inputs.move_calories)    || 0
  const em    = parseInt(inputs.exercise_minutes) || 0
  const sh    = parseInt(inputs.stand_hours)      || 0
  const score = me ? calculateScore(mc, me.move_goal, em, sh) : 0
  const isImmune    = hasImmunity(score)
  const isQualified = qualifiesForShell(score)
  const others      = me ? standings.filter(s => s.player_id !== me.player_id) : []
  const shellDefs   = me ? [
    { key: 'cloud',    icon: '☁️', label: 'Cloud',       sub: 'Day off: 100% floor + shell shield (lands tomorrow)', count: me.clouds },
    { key: 'red',      icon: '🔴', label: 'Red Shell',   sub: 'Halves today\'s leader — lands tomorrow', count: me.red_shells   },
    { key: 'green',    icon: '🟢', label: 'Green Shell', sub: 'Pick a target — lands tomorrow',       count: me.green_shells },
    { key: 'blue',     icon: '🔵', label: 'Blue Shell',  sub: 'Copy the day\'s top score as your own — lands tomorrow', count: me.blue_shells  },
    { key: 'mushroom', icon: '🍄', label: 'Mushroom',    sub: '+50% to your score — lands tomorrow', count: me.mushrooms    },
  ] : []

  return (
    <div className="home-page">

      {/* ── LEFT: LEADERBOARD ── */}
      <section className="home-left">
        <header className="leaderboard-header">
          <h1 className="leaderboard-title">{league.name}</h1>
          <p className="leaderboard-meta">
            {endDate ? `${startDate} – ${endDate}` : `Started ${startDate}`}
          </p>
        </header>

        {/* Tab switcher */}
        <div className="tab-bar">
          <button
            className={`tab-btn ${activeTab === 'individual' ? 'active' : ''}`}
            onClick={() => setActiveTab('individual')}
          >
            Individual
          </button>
          <button
            className={`tab-btn ${activeTab === 'teams' ? 'active' : ''}`}
            onClick={() => setActiveTab('teams')}
          >
            Teams
          </button>
        </div>

        {activeTab === 'individual' ? (
          <div className="standings-list">
            {standings.map((row, i) => (
              <PlayerCard
                key={row.player_id}
                rank={i + 1}
                player={row.player}
                totalScore={row.totalScore}
                todayScore={row.todayScore}
                isImmune={row.todayImmune}
                isMe={!!user && row.player?.email === user.email}
                todayPoints={row.todayPoints}
              shells={{ red: row.red_shells, green: row.green_shells, blue: row.blue_shells, mushrooms: row.mushrooms, clouds: row.clouds }}
              />
            ))}
            {!standings.some(s => s.totalScore > 0) && (
              <div className="empty-state" style={{ marginTop: '1.5rem' }}>
                <div className="empty-state-icon">🎮</div>
                <h2>Race not started</h2>
                <p>{user ? 'Enter your first score on the right.' : 'Sign in to enter scores.'}</p>
              </div>
            )}
          </div>
        ) : (
          <div className="standings-list">
            {teamStandings.map((team, i) => (
              <TeamCard key={team.id} rank={i + 1} team={team} />
            ))}
            {!teamStandings.some(t => t.totalScore > 0) && (
              <div className="empty-state" style={{ marginTop: '1.5rem' }}>
                <div className="empty-state-icon">🏆</div>
                <h2>No team scores yet</h2>
                <p>Enter individual scores to see the team standings.</p>
              </div>
            )}
          </div>
        )}
        <ActivityFeed leagueId={league.id} standings={standings} />
      </section>

      {/* ── RIGHT: MY DAY ── */}
      <section className="home-right">
        {!user ? (
          <div className="signin-prompt">
            <p>Sign in to enter your score and fire shells</p>
            <Link to="/login" className="nav-btn" style={{ display: 'inline-block', marginTop: '0.75rem' }}>
              Sign in
            </Link>
          </div>
        ) : !me ? (
          <div className="signin-prompt">
            <p>Your account isn't linked to a player yet — ask Simon to check.</p>
          </div>
        ) : (
          <>
            <div className="myday-header">
              <h2 className="myday-title" style={{ color: me.player.avatar_color }}>
                {me.player.display_name}'s Day
              </h2>
              <span className="myday-goal">Goal: {me.move_goal} cal</span>
            </div>

            {/* Score entry */}
            <div className="admin-card">
              <div className="date-row">
                <label>Date</label>
                <input type="date" className="date-input" value={date}
                  onChange={e => setDate(e.target.value)} />
              </div>

              <div className="score-entry-vertical">
                <div className="score-entry-field">
                  <label className="score-entry-label">Move Cal</label>
                  <input type="number" min="0" max="9999" className="score-entry-input"
                    value={inputs.move_calories}
                    onChange={e => setInputs(p => ({ ...p, move_calories: e.target.value }))}
                    placeholder="0" inputMode="numeric" />
                </div>
                <div className="score-entry-field">
                  <label className="score-entry-label">Exercise Min</label>
                  <input type="number" min="0" max="180" className="score-entry-input"
                    value={inputs.exercise_minutes}
                    onChange={e => setInputs(p => ({ ...p, exercise_minutes: e.target.value }))}
                    placeholder="0" inputMode="numeric" />
                </div>
                <div className="score-entry-field">
                  <label className="score-entry-label">Stand Hrs</label>
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
                    {isQualified && !isImmune && <span className="tag tag-shell">🐚 Shell earned (150%+)</span>}
                    {earnsShroom && <span className="tag tag-shroom">🍄 Mushroom earned</span>}
                  </span>
                </div>
              )}

              {earnedShells.length > 0 && (
                <div className="earn-banner">🎉 You earned: {earnedShells.join(' + ')}</div>
              )}
              {saveMsg === 'success' && earnedShells.length === 0 && (
                <div className="alert alert-success" style={{ marginTop: '0.75rem' }}>Score saved ✓</div>
              )}
              {saveMsg?.startsWith('error:') && (
                <div className="alert alert-error" style={{ marginTop: '0.75rem' }}>{saveMsg.slice(6)}</div>
              )}

              <button className="save-btn" onClick={save} disabled={saving}>
                {saving ? 'Saving…' : 'Save Score'}
              </button>
            </div>

            {/* Power-ups — always show so inventory is visible */}
            <div className="admin-card">
              <p className="admin-card-title">Power-Ups</p>

              {fireMsg === 'success' && (
                <div className="alert alert-success" style={{ marginBottom: '0.75rem' }}>
                  Fired! It lands tomorrow when scores for today are entered.
                </div>
              )}
              {fireMsg?.startsWith('error:') && (
                <div className="alert alert-error" style={{ marginBottom: '0.75rem' }}>{fireMsg.slice(6)}</div>
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
                        {others.map(p => (
                          <option key={p.player_id} value={p.player_id}>{p.player.display_name}</option>
                        ))}
                      </select>
                    )}
                    <button className="shell-fire-btn"
                      disabled={s.count < 1 || firing === s.key}
                      onClick={() => handleFire(s.key)}>
                      {firing === s.key ? 'Firing…' : s.count < 1 ? 'None' : 'Fire'}
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Everyone's inventory */}
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
                      <span className={s.clouds       > 0 ? 'inv-shell inv-cloud' : 'inv-shell inv-zero'}>☁️ {s.clouds}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

          </>
        )}
      </section>
    </div>
  )
}
