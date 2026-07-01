import { supabase } from './supabase'
import { calculateScore } from './scoring'

/**
 * RINGS CLUB SHELL ENGINE v2
 * ------------------------------------------------------------------
 * Resolution order per date (chronological, oldest first):
 *
 *  1. Mushrooms      — raw * 1.5 (applied before cloud)
 *  2. Clouds         — MAX(100, movePct) * (1.5 if mushroom active)
 *                      + timestamp-based shell protection
 *  3. Immunity       — effectiveRaw >= 300 => immune to all shells
 *  4. Daily leader   — highest effectiveRaw = red shell auto-target
 *  5. Shells (timestamp order):
 *     RED   → daily leader. effectiveRaw * 0.5
 *     GREEN → manual target. effectiveRaw * 0.5
 *     BLUE  → season leader going into date D (earliest only).
 *             effect = day leader's effectiveRaw assigned to target
 *             self-fire = no score change, just protects via impacted
 *
 *  A shell is RETURNED to its owner if:
 *    - target is immune (effectiveRaw >= 300), OR
 *    - target is already impacted that date, OR
 *    - target fired a cloud BEFORE this shell's timestamp, OR
 *    - (blue) another blue already succeeded today
 */

const SHELL_COL = {
  fire_red_shell:   'red_shells',
  fire_green_shell: 'green_shells',
  fire_blue_shell:  'blue_shells',
}

export async function resolveAndGetStandings(leagueId) {
  const [{ data: league }, { data: members }, { data: scores }, { data: events }] = await Promise.all([
    supabase.from('leagues').select('*').eq('id', leagueId).single(),
    supabase.from('league_members').select('*, player:players(*)').eq('league_id', leagueId),
    supabase.from('daily_scores').select('*').eq('league_id', leagueId),
    supabase.from('powerup_events').select('*').eq('league_id', leagueId).order('created_at', { ascending: true }),
  ])

  const memberByPlayer = {}
  members.forEach(m => { memberByPlayer[m.player_id] = m })

  // Filter to league date range
  const inRange = (date) => {
    if (league.start_date && date < league.start_date) return false
    if (league.end_date   && date > league.end_date)   return false
    return true
  }
  const rangedScores = (scores  || []).filter(s => inRange(s.date))
  const rangedEvents = (events  || []).filter(e => inRange(e.date))

  // Raw scores (with zeroing) AND move-only % (for cloud calculation)
  const rawScores  = {}  // [date][pid] = calculated score (0 if exercise/stand fail)
  const rawMovePct = {}  // [date][pid] = (move_cal / move_goal) * 100 — no zeroing
  rangedScores.forEach(s => {
    const moveGoal = memberByPlayer[s.player_id]?.move_goal || 500
    rawScores[s.date]  = rawScores[s.date]  || {}
    rawMovePct[s.date] = rawMovePct[s.date] || {}
    rawScores[s.date][s.player_id]  = calculateScore(s.move_calories, moveGoal, s.exercise_minutes, s.stand_hours)
    rawMovePct[s.date][s.player_id] = Math.round((s.move_calories / moveGoal) * 100)
  })

  const allDates = Object.keys(rawScores).sort()

  const cumulativeTotal = {}
  members.forEach(m => { cumulativeTotal[m.player_id] = 0 })

  const eventsByDate = {}
  rangedEvents.forEach(e => {
    eventsByDate[e.date] = eventsByDate[e.date] || []
    eventsByDate[e.date].push(e)
  })

  const dbUpdates = []
  const refunds   = {}
  const finalScores = {}

  function queueRefund(pid, col) {
    refunds[pid] = refunds[pid] || {}
    refunds[pid][col] = (refunds[pid][col] || 0) + 1
  }

  const today = new Date().toISOString().split('T')[0]

  for (const date of allDates) {
    const dayRaw    = rawScores[date]
    const dayMovePct = rawMovePct[date] || {}
    const dayEvents = (eventsByDate[date] || []).filter(e => e.status === 'pending')
    finalScores[date] = {}

    const playerIdsToday = Object.keys(dayRaw)

    // ── Step 1: Mushrooms ─────────────────────────────────────────
    const effectiveRaw = { ...dayRaw }
    const mushroomEvents = dayEvents.filter(e => e.event_type === 'use_mushroom')
    const mushroomPlayers = new Set()
    for (const ev of mushroomEvents) {
      if (!(ev.actor_player_id in dayRaw)) continue
      effectiveRaw[ev.actor_player_id] = dayRaw[ev.actor_player_id] * 1.5
      mushroomPlayers.add(ev.actor_player_id)
      dbUpdates.push({ id: ev.id, status: 'applied', target_player_id: ev.actor_player_id, final_score_applied: effectiveRaw[ev.actor_player_id] })
    }

    // ── Step 2: Clouds ────────────────────────────────────────────
    // Score effect: MAX(100, movePct) — bypasses exercise/stand zeroing
    // Protection: timestamp-based shield against later shells
    const cloudTimestamps = {} // pid -> Date object
    const cloudEvents = dayEvents
      .filter(e => e.event_type === 'use_cloud')
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))

    for (const ev of cloudEvents) {
      const pid = ev.actor_player_id
      if (!(pid in dayRaw)) continue
      cloudTimestamps[pid] = new Date(ev.created_at)

      // Cloud overrides zeroing: MAX(100, movePct)
      // If mushroom also active, cloud bypasses zero then mushroom applies
      const movePct = dayMovePct[pid] || 0
      const base = Math.max(100, movePct)
      effectiveRaw[pid] = mushroomPlayers.has(pid) ? base * 1.5 : base

      dbUpdates.push({ id: ev.id, status: 'applied', target_player_id: pid, final_score_applied: effectiveRaw[pid] })
    }

    // ── Step 3: Immunity ──────────────────────────────────────────
    const immune = new Set(playerIdsToday.filter(pid => effectiveRaw[pid] >= 300))

    // ── Step 4: Daily leader ──────────────────────────────────────
    let leaderPid = null, leaderScore = -Infinity
    for (const pid of playerIdsToday) {
      if (effectiveRaw[pid] > leaderScore) { leaderScore = effectiveRaw[pid]; leaderPid = pid }
    }

    // ── Step 5: Shells (timestamp order) ─────────────────────────
    const impacted = new Set()
    let blueSucceededToday = false

    const shellEvents = dayEvents
      .filter(e => ['fire_red_shell', 'fire_green_shell', 'fire_blue_shell'].includes(e.event_type))
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))

    for (const ev of shellEvents) {
      const shellTime = new Date(ev.created_at)
      const shellCol  = SHELL_COL[ev.event_type]

      // ── Resolve target ──
      let targetPid = null

      if (ev.event_type === 'fire_red_shell') {
        if (!leaderPid || !(leaderPid in dayRaw)) continue
        targetPid = leaderPid

      } else if (ev.event_type === 'fire_green_shell') {
        if (!ev.target_player_id || !(ev.target_player_id in dayRaw)) continue
        targetPid = ev.target_player_id

      } else if (ev.event_type === 'fire_blue_shell') {
        if (blueSucceededToday) {
          queueRefund(ev.actor_player_id, 'blue_shells')
          dbUpdates.push({ id: ev.id, status: 'returned', target_player_id: null, final_score_applied: null })
          continue
        }
        if (!leaderPid || !(leaderPid in dayRaw)) continue
        let slPid = null, slTotal = -Infinity
        for (const pid of Object.keys(cumulativeTotal)) {
          if (cumulativeTotal[pid] > slTotal) { slTotal = cumulativeTotal[pid]; slPid = pid }
        }
        targetPid = slPid
      }

      if (!targetPid) continue

      // ── Cloud protection check ──
      const cloudTime     = cloudTimestamps[targetPid]
      const cloudProtects = cloudTime && cloudTime < shellTime

      // ── Return conditions ──
      if (immune.has(targetPid) || impacted.has(targetPid) || cloudProtects) {
        queueRefund(ev.actor_player_id, shellCol)
        dbUpdates.push({ id: ev.id, status: 'returned', target_player_id: targetPid, final_score_applied: null })
        continue
      }

      // ── Apply shell ──
      impacted.add(targetPid)

      if (ev.event_type === 'fire_blue_shell') {
        blueSucceededToday = true
        if (targetPid === ev.actor_player_id) {
          // Self-protect: marks impacted, no score change
          dbUpdates.push({ id: ev.id, status: 'applied', target_player_id: targetPid, final_score_applied: null })
        } else {
          const final = effectiveRaw[leaderPid]
          finalScores[date][targetPid] = final
          dbUpdates.push({ id: ev.id, status: 'applied', target_player_id: targetPid, final_score_applied: final })
        }
      } else {
        const final = effectiveRaw[targetPid] * 0.5
        finalScores[date][targetPid] = final
        dbUpdates.push({ id: ev.id, status: 'applied', target_player_id: targetPid, final_score_applied: final })
      }
    }

    // ── Fill final scores ─────────────────────────────────────────
    for (const pid of playerIdsToday) {
      if (!(pid in finalScores[date])) finalScores[date][pid] = effectiveRaw[pid]
      cumulativeTotal[pid] = (cumulativeTotal[pid] || 0) + finalScores[date][pid]
    }
  }

  // ── Persist resolutions ───────────────────────────────────────────
  for (const upd of dbUpdates) {
    await supabase.from('powerup_events').update({
      status:              upd.status,
      target_player_id:    upd.target_player_id,
      final_score_applied: upd.final_score_applied,
    }).eq('id', upd.id)
  }

  // ── Persist refunds ───────────────────────────────────────────────
  for (const [playerId, cols] of Object.entries(refunds)) {
    const member = memberByPlayer[playerId]
    if (!member) continue
    const patch = {}
    for (const [col, n] of Object.entries(cols)) {
      patch[col] = (member[col] || 0) + n
    }
    await supabase.from('league_members').update(patch).eq('id', member.id)
  }

  // ── Individual standings ──────────────────────────────────────────
  const standings = members.map(m => {
    let total = 0
    for (const date of allDates) {
      total += finalScores[date]?.[m.player_id] || 0
    }
    return {
      ...m,
      totalScore:  Math.round(total),
      todayScore:  finalScores[today]?.[m.player_id] != null ? Math.round(finalScores[today][m.player_id]) : null,
      todayImmune: rawScores[today]?.[m.player_id] != null && effectiveRawForToday(m.player_id, today, rawScores, rawMovePct, memberByPlayer) >= 300,
    }
  })
  standings.sort((a, b) => b.totalScore - a.totalScore)

  // ── Team standings ────────────────────────────────────────────────
  const { data: teamsData } = await supabase
    .from('teams')
    .select('*, team_members(player_id, players(id, display_name, avatar_color))')
    .eq('league_id', leagueId)

  const teamStandings = (teamsData || []).map(team => {
    const memberIds    = (team.team_members || []).map(m => m.player_id)
    const memberPlayers = (team.team_members || []).map(m => m.players)

    let teamTotal = 0
    for (const date of allDates) {
      const dayScores = memberIds
        .filter(pid => finalScores[date]?.[pid] !== undefined)
        .map(pid => finalScores[date][pid])
      if (dayScores.length > 0) {
        teamTotal += dayScores.reduce((a, b) => a + b, 0) / dayScores.length
      }
    }

    const todayMemberScores = memberIds
      .filter(pid => finalScores[today]?.[pid] !== undefined)
      .map(pid => finalScores[today][pid])
    const todayScore = todayMemberScores.length > 0
      ? Math.round(todayMemberScores.reduce((a, b) => a + b, 0) / todayMemberScores.length)
      : null

    return { id: team.id, name: team.name, avatar_color: team.avatar_color, memberPlayers, totalScore: Math.round(teamTotal), todayScore }
  })
  teamStandings.sort((a, b) => b.totalScore - a.totalScore)

  return { league, standings, teamStandings, refunded: Object.keys(refunds).length > 0 }
}

// Helper: approximate effective raw for a player on a given date (for todayImmune display)
function effectiveRawForToday(pid, today, rawScores, rawMovePct, memberByPlayer) {
  const raw = rawScores[today]?.[pid]
  if (raw == null) return 0
  return raw // simplified — mushroom/cloud effects are computed in full resolution only
}

/** Fire a shell. Decrements inventory immediately, logs event with timestamp. */
export async function fireShell(leagueId, memberId, actorPlayerId, shellType, targetPlayerId = null) {
  const eventTypeMap = {
    red:      'fire_red_shell',
    green:    'fire_green_shell',
    blue:     'fire_blue_shell',
    mushroom: 'use_mushroom',
    cloud:    'use_cloud',
  }
  const colMap = {
    red: 'red_shells', green: 'green_shells', blue: 'blue_shells', mushroom: 'mushrooms', cloud: 'clouds',
  }

  const { data: member, error: me } = await supabase
    .from('league_members').select('*').eq('id', memberId).single()
  if (me) throw me

  const col = colMap[shellType]
  if (!member[col] || member[col] < 1) throw new Error(`No ${shellType}s left to fire`)

  const today = new Date().toISOString().split('T')[0]

  const { error: ue } = await supabase
    .from('league_members')
    .update({ [col]: member[col] - 1 })
    .eq('id', memberId)
  if (ue) throw ue

  const { error: ie } = await supabase.from('powerup_events').insert({
    league_id:       leagueId,
    date:            today,
    actor_player_id: actorPlayerId,
    event_type:      eventTypeMap[shellType],
    target_player_id: shellType === 'green' ? targetPlayerId : null,
    quantity:        1,
    status:          'pending',
  })
  if (ie) throw ie
}
