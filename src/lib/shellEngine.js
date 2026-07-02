import { supabase } from './supabase'
import { calculateScore } from './scoring'

/**
 * RINGS CLUB SHELL ENGINE v3
 * ------------------------------------------------------------------
 * ONE POWERUP INTERACTION PER PLAYER PER DAY.
 *
 * All events (mushroom, cloud, red/green/blue shells) are processed
 * in a single timestamp-ordered queue. Whichever powerup touches a
 * player first (self-targeted or incoming) claims them for that day.
 * Any subsequent powerup targeting the same player is returned.
 *
 * Pre-determined before the queue runs:
 *   leaderPid       = player with highest RAW score today (red shell target)
 *   leaderRawScore  = their raw score (blue shell effect value)
 *   immune          = players whose raw score >= 300% (immune to incoming shells)
 *
 * Queue rules (timestamp order):
 *   use_mushroom   → self: if already impacted → return; else → raw * 1.5, impacted
 *   use_cloud      → self: if already impacted → return; else → MAX(100, movePct), impacted
 *   fire_red_shell → target = leaderPid (by raw score): if immune/impacted/self → return; else → ×0.75 (25% off)
 *   fire_green_shell → target = manual: if immune/impacted → return; else → ×0.75 (25% off)
 *   fire_blue_shell → self-boost: firer gets day top raw score (if they meet exercise/stand)
 *       only one blue per day; first timestamp wins, others returned
 */

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
  const inRange = d => {
    if (league.start_date && d < league.start_date) return false
    if (league.end_date   && d > league.end_date)   return false
    return true
  }
  const rangedScores = (scores || []).filter(s => inRange(s.date))
  const rangedEvents = (events || []).filter(e => inRange(e.date))

  // Build raw score lookups
  const rawScores  = {}   // [date][pid] = score with zeroing (exercise/stand)
  const rawMovePct = {}   // [date][pid] = (move_cal / move_goal) * 100, no zeroing
  rangedScores.forEach(s => {
    const moveGoal = memberByPlayer[s.player_id]?.move_goal || 500
    rawScores[s.date]  = rawScores[s.date]  || {}
    rawMovePct[s.date] = rawMovePct[s.date] || {}
    rawScores[s.date][s.player_id]  = calculateScore(s.move_calories, moveGoal, s.exercise_minutes, s.stand_hours)
    rawMovePct[s.date][s.player_id] = Math.round((s.move_calories / moveGoal) * 100)
  })

  // Lookup for exercise/stand data (needed for blue shell requirement check)
  const scoreDetails = {}
  rangedScores.forEach(s => {
    scoreDetails[s.date] = scoreDetails[s.date] || {}
    scoreDetails[s.date][s.player_id] = { exercise_minutes: s.exercise_minutes, stand_hours: s.stand_hours }
  })

  const allDates = Object.keys(rawScores).sort()

  // Cumulative totals (for blue shell season leader calculation)
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
  const RANK_POINTS     = [5, 4, 3, 2, 1]  // index 0 = 1st place
  const dailyPointsByDate = {}

  for (const date of allDates) {
    const dayRaw     = rawScores[date]
    const dayMovePct = rawMovePct[date] || {}
    finalScores[date] = {}

    const playerIdsToday = Object.keys(dayRaw)

    // ── Pre-determine leaders ───────────────────────────────────────
    // Daily leader = highest RAW score (for red shell + blue shell effect)
    let leaderPid = null, leaderRaw = -Infinity
    for (const pid of playerIdsToday) {
      if (dayRaw[pid] > leaderRaw) { leaderRaw = dayRaw[pid]; leaderPid = pid }
    }
    const leaderRawScore = leaderPid ? dayRaw[leaderPid] : 0

    // Immunity: raw score >= 300% (incoming shells bounce, self-powerups still usable)
    const immune = new Set(playerIdsToday.filter(pid => dayRaw[pid] >= 300))

    // ── Effective raw starts equal to raw ──────────────────────────
    const effectiveRaw = { ...dayRaw }

    // ── Single timestamp-ordered queue ─────────────────────────────
    const dayEvents = (eventsByDate[date] || [])
      .filter(e => e.status === 'pending')
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))

    const impacted = new Set()   // one interaction per player per day
    let blueSucceededToday = false

    for (const ev of dayEvents) {
      const actor = ev.actor_player_id

      // ── Mushroom (self-targeted) ──────────────────────────────────
      if (ev.event_type === 'use_mushroom') {
        if (!(actor in dayRaw)) continue    // score not entered yet
        if (impacted.has(actor)) {
          queueRefund(actor, 'mushrooms')
          dbUpdates.push({ id: ev.id, status: 'returned', target_player_id: actor, final_score_applied: null })
        } else {
          effectiveRaw[actor] = dayRaw[actor] * 1.5
          impacted.add(actor)
          dbUpdates.push({ id: ev.id, status: 'applied', target_player_id: actor, final_score_applied: effectiveRaw[actor] })
        }
      }

      // ── Cloud (self-targeted) ─────────────────────────────────────
      else if (ev.event_type === 'use_cloud') {
        if (!(actor in dayRaw)) continue
        if (impacted.has(actor)) {
          queueRefund(actor, 'clouds')
          dbUpdates.push({ id: ev.id, status: 'returned', target_player_id: actor, final_score_applied: null })
        } else {
          effectiveRaw[actor] = Math.max(100, dayMovePct[actor] || 0)
          impacted.add(actor)
          dbUpdates.push({ id: ev.id, status: 'applied', target_player_id: actor, final_score_applied: effectiveRaw[actor] })
        }
      }

      // ── Red Shell (auto-target: daily leader) ─────────────────────
      else if (ev.event_type === 'fire_red_shell') {
        if (!leaderPid || !(leaderPid in dayRaw)) continue  // can't resolve yet
        if (leaderRaw <= 0) continue  // no valid positive-scoring leader
        const shouldReturn = leaderPid === actor            // can't hit yourself
          || immune.has(leaderPid)
          || impacted.has(leaderPid)
        if (shouldReturn) {
          queueRefund(actor, 'red_shells')
          dbUpdates.push({ id: ev.id, status: 'returned', target_player_id: leaderPid, final_score_applied: null })
        } else {
          effectiveRaw[leaderPid] = effectiveRaw[leaderPid] * 0.75
          finalScores[date][leaderPid] = effectiveRaw[leaderPid]
          impacted.add(leaderPid)
          dbUpdates.push({ id: ev.id, status: 'applied', target_player_id: leaderPid, final_score_applied: effectiveRaw[leaderPid] })
        }
      }

      // ── Green Shell (manual target) ───────────────────────────────
      else if (ev.event_type === 'fire_green_shell') {
        const target = ev.target_player_id
        if (!target || !(target in dayRaw)) continue
        const shouldReturn = immune.has(target) || impacted.has(target)
        if (shouldReturn) {
          queueRefund(actor, 'green_shells')
          dbUpdates.push({ id: ev.id, status: 'returned', target_player_id: target, final_score_applied: null })
        } else {
          effectiveRaw[target] = effectiveRaw[target] * 0.75
          finalScores[date][target] = effectiveRaw[target]
          impacted.add(target)
          dbUpdates.push({ id: ev.id, status: 'applied', target_player_id: target, final_score_applied: effectiveRaw[target] })
        }
      }

      // ── Blue Shell (self-boost: copy the day's top score) ──────────
      // The FIRER gets the highest raw score of the day as their own.
      // The top scorer is completely unaffected.
      // Firer still needs to meet their own exercise/stand requirements.
      // Only one blue shell benefits per day — first timestamp wins.
      else if (ev.event_type === 'fire_blue_shell') {
        if (blueSucceededToday) {
          queueRefund(actor, 'blue_shells')
          dbUpdates.push({ id: ev.id, status: 'returned', target_player_id: null, final_score_applied: null })
          continue
        }
        if (!(actor in dayRaw)) continue  // actor hasn't submitted scores yet

        if (impacted.has(actor)) {
          // Already used their daily interaction
          queueRefund(actor, 'blue_shells')
          dbUpdates.push({ id: ev.id, status: 'returned', target_player_id: actor, final_score_applied: null })
          continue
        }

        blueSucceededToday = true
        impacted.add(actor)

        // Check firer meets their own exercise/stand requirements
        const details = scoreDetails[date]?.[actor]
        const meetsReqs = details && details.exercise_minutes >= 30 && details.stand_hours >= 12

        if (meetsReqs && leaderPid) {
          // Give firer the day's top raw score (top scorer unaffected)
          effectiveRaw[actor] = leaderRawScore
          finalScores[date][actor] = leaderRawScore
          dbUpdates.push({ id: ev.id, status: 'applied', target_player_id: actor, final_score_applied: leaderRawScore })
        } else {
          // Requirements not met — shell consumed, score stays as 0
          dbUpdates.push({ id: ev.id, status: 'applied', target_player_id: actor, final_score_applied: 0 })
        }
      }
    }

    // ── Fill final scores for all players ──────────────────────────
    for (const pid of playerIdsToday) {
      if (!(pid in finalScores[date])) finalScores[date][pid] = effectiveRaw[pid]
      cumulativeTotal[pid] = (cumulativeTotal[pid] || 0) + finalScores[date][pid]
    }

    // ── Award daily points (5-4-3-2-1 by rank, only for score > 0) ──
    const scoredToday = playerIdsToday
      .map(pid => ({ pid, score: finalScores[date][pid] }))
      .filter(p => p.score > 0)
      .sort((a, b) => b.score - a.score)

    dailyPointsByDate[date] = {}
    let rankIdx = 0
    for (let i = 0; i < scoredToday.length; i++) {
      if (i > 0 && scoredToday[i].score < scoredToday[i - 1].score) rankIdx = i
      dailyPointsByDate[date][scoredToday[i].pid] =
        RANK_POINTS[Math.min(rankIdx, RANK_POINTS.length - 1)]
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
    let totalPoints = 0
    for (const date of allDates) {
      totalPoints += dailyPointsByDate[date]?.[m.player_id] || 0
    }
    return {
      ...m,
      totalScore:  totalPoints,
      todayScore:  finalScores[today]?.[m.player_id] != null
        ? Math.round(finalScores[today][m.player_id]) : null,
      todayPoints: dailyPointsByDate[today]?.[m.player_id] ?? null,
      todayImmune: (rawScores[today]?.[m.player_id] || 0) >= 300,
    }
  })
  standings.sort((a, b) => b.totalScore - a.totalScore)

  // ── Team standings ────────────────────────────────────────────────
  const { data: teamsData } = await supabase
    .from('teams')
    .select('*, team_members(player_id, players(id, display_name, avatar_color))')
    .eq('league_id', leagueId)

  const teamStandings = (teamsData || []).map(team => {
    const memberIds     = (team.team_members || []).map(m => m.player_id)
    const memberPlayers = (team.team_members || []).map(m => m.players)
    // Team uses same points system — average of members' daily points
    let teamTotal = 0
    for (const date of allDates) {
      const dayPts = memberIds
        .map(pid => dailyPointsByDate[date]?.[pid] || 0)
        .filter(p => p > 0)
      if (dayPts.length) teamTotal += dayPts.reduce((a, b) => a + b, 0) / dayPts.length
    }
    const todayMemberPts = memberIds.map(pid => dailyPointsByDate[today]?.[pid] || 0)
    const todayScored = todayMemberPts.filter(p => p > 0)
    const todayScore = todayScored.length
      ? Math.round(todayScored.reduce((a, b) => a + b, 0) / todayScored.length)
      : null
    return { id: team.id, name: team.name, avatar_color: team.avatar_color, memberPlayers, totalScore: Math.round(teamTotal), todayScore }
  })
  teamStandings.sort((a, b) => b.totalScore - a.totalScore)

  return { league, standings, teamStandings, refunded: Object.keys(refunds).length > 0 }
}

/** Fire a shell — decrements inventory immediately, logs with timestamp. */
export async function fireShell(leagueId, memberId, actorPlayerId, shellType, targetPlayerId = null) {
  const eventTypeMap = {
    red: 'fire_red_shell', green: 'fire_green_shell', blue: 'fire_blue_shell',
    mushroom: 'use_mushroom', cloud: 'use_cloud',
  }
  const colMap = {
    red: 'red_shells', green: 'green_shells', blue: 'blue_shells',
    mushroom: 'mushrooms', cloud: 'clouds',
  }

  const { data: member, error: me } = await supabase
    .from('league_members').select('*').eq('id', memberId).single()
  if (me) throw me

  const col = colMap[shellType]
  if (!member[col] || member[col] < 1) throw new Error(`No ${shellType}s left to fire`)

  const today = new Date().toISOString().split('T')[0]

  const { error: ue } = await supabase
    .from('league_members').update({ [col]: member[col] - 1 }).eq('id', memberId)
  if (ue) throw ue

  const { error: ie } = await supabase.from('powerup_events').insert({
    league_id:        leagueId,
    date:             today,
    actor_player_id:  actorPlayerId,
    event_type:       eventTypeMap[shellType],
    target_player_id: shellType === 'green' ? targetPlayerId : null,
    quantity:         1,
    status:           'pending',
  })
  if (ie) throw ie
}
