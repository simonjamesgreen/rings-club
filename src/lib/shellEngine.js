import { supabase } from './supabase'
import { calculateScore } from './scoring'

/**
 * RINGS CLUB SHELL ENGINE
 * ------------------------------------------------------------------
 * Shells are fired on a date D. They can only resolve once raw score
 * data for D exists for the relevant players. Resolution happens lazily,
 * triggered every time the leaderboard loads.
 *
 * Resolution order per date (processed oldest date -> newest):
 *  1. Mushrooms apply first: raw * 1.5 = effective raw for that player/date
 *  2. Immunity: effective raw >= 300% => immune for that date
 *  3. Daily leader = highest effective raw that date (red shell auto-target)
 *  4. Red / Green / Blue fires resolve in timestamp order:
 *     - RED: auto-target = daily leader. effect: final = leaderRaw * 0.5
 *     - GREEN: manual target (locked at fire time). effect: final = targetRaw * 0.5
 *     - BLUE: auto-target = season leader going into date D.
 *         Only one Blue can succeed per date (earliest timestamp wins).
 *         effect: target's final = day D's leader's effective raw (pre-shell)
 *         If target == firer: no score change, just marks impacted (self-protect)
 *  - A shell "returns" (refunds to owner's inventory) if:
 *      - target is immune, OR
 *      - target is already impacted that date, OR
 *      - (blue only) another blue already succeeded that date
 */

const SHELL_COLUMN = {
  fire_red_shell:   'red_shells',
  fire_green_shell: 'green_shells',
  fire_blue_shell:  'blue_shells',
  use_mushroom:     'mushrooms',
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

  // Filter to league date range (start_date to end_date inclusive)
  const inRange = (date) => {
    if (league.start_date && date < league.start_date) return false
    if (league.end_date   && date > league.end_date)   return false
    return true
  }
  const rangedScores = (scores || []).filter(s => inRange(s.date))
  const rangedEvents = (events || []).filter(e => inRange(e.date))

  // Raw score lookup: rawScores[date][player_id] = number | undefined
  const rawScores = {}
  rangedScores.forEach(s => {
    const moveGoal = memberByPlayer[s.player_id]?.move_goal || 500
    const raw = calculateScore(s.move_calories, moveGoal, s.exercise_minutes, s.stand_hours)
    rawScores[s.date] = rawScores[s.date] || {}
    rawScores[s.date][s.player_id] = raw
  })

  const allDates = Object.keys(rawScores).sort() // chronological

  // finalScores[date][player_id] = number
  const finalScores = {}
  // seasonTotalGoingIntoDate[date] = { player_id: cumulativeTotalBeforeThisDate }
  const cumulativeTotal = {}
  members.forEach(m => { cumulativeTotal[m.player_id] = 0 })

  const eventsByDate = {}
  rangedEvents.forEach(e => {
    eventsByDate[e.date] = eventsByDate[e.date] || []
    eventsByDate[e.date].push(e)
  })

  const dbUpdates = []   // events to update {id, status, target_player_id, final_score_applied}
  const refunds = {}     // player_id -> { red_shells: n, green_shells: n, blue_shells: n, mushrooms: n }

  function queueRefund(playerId, shellCol) {
    refunds[playerId] = refunds[playerId] || {}
    refunds[playerId][shellCol] = (refunds[playerId][shellCol] || 0) + 1
  }

  for (const date of allDates) {
    const dayRaw = rawScores[date] // { player_id: raw }
    const dayEvents = (eventsByDate[date] || []).filter(e => e.status === 'pending')
    finalScores[date] = {}

    // Only consider players who actually have a raw score recorded for this date
    const playerIdsToday = Object.keys(dayRaw)

    // Step 1: Mushrooms (self-target, apply first)
    const effectiveRaw = { ...dayRaw }
    const mushroomEvents = dayEvents.filter(e => e.event_type === 'use_mushroom')
    for (const ev of mushroomEvents) {
      if (!(ev.actor_player_id in dayRaw)) continue // can't resolve yet, no score for that player/date
      effectiveRaw[ev.actor_player_id] = dayRaw[ev.actor_player_id] * 1.5
      dbUpdates.push({
        id: ev.id, status: 'applied',
        target_player_id: ev.actor_player_id,
        final_score_applied: effectiveRaw[ev.actor_player_id],
      })
    }

    // Step 2: immunity set (>=300% effective raw)
    const immune = new Set(
      playerIdsToday.filter(pid => effectiveRaw[pid] >= 300)
    )

    // Step 3: daily leader (highest effective raw today)
    let leaderPid = null, leaderScore = -Infinity
    for (const pid of playerIdsToday) {
      if (effectiveRaw[pid] > leaderScore) { leaderScore = effectiveRaw[pid]; leaderPid = pid }
    }

    // Step 4: process red/green/blue in timestamp order
    const impacted = new Set()
    let blueSucceededToday = false

    const shellEvents = dayEvents
      .filter(e => ['fire_red_shell', 'fire_green_shell', 'fire_blue_shell'].includes(e.event_type))
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))

    for (const ev of shellEvents) {
      if (ev.event_type === 'fire_red_shell') {
        if (!leaderPid || !(leaderPid in dayRaw)) continue // can't resolve yet
        if (immune.has(leaderPid) || impacted.has(leaderPid)) {
          queueRefund(ev.actor_player_id, 'red_shells')
          dbUpdates.push({ id: ev.id, status: 'returned', target_player_id: leaderPid, final_score_applied: null })
          continue
        }
        const final = effectiveRaw[leaderPid] * 0.5
        finalScores[date][leaderPid] = final
        impacted.add(leaderPid)
        dbUpdates.push({ id: ev.id, status: 'applied', target_player_id: leaderPid, final_score_applied: final })
      }

      else if (ev.event_type === 'fire_green_shell') {
        const targetPid = ev.target_player_id
        if (!targetPid || !(targetPid in dayRaw)) continue // can't resolve yet
        if (immune.has(targetPid) || impacted.has(targetPid)) {
          queueRefund(ev.actor_player_id, 'green_shells')
          dbUpdates.push({ id: ev.id, status: 'returned', target_player_id: targetPid, final_score_applied: null })
          continue
        }
        const final = effectiveRaw[targetPid] * 0.5
        finalScores[date][targetPid] = final
        impacted.add(targetPid)
        dbUpdates.push({ id: ev.id, status: 'applied', target_player_id: targetPid, final_score_applied: final })
      }

      else if (ev.event_type === 'fire_blue_shell') {
        if (blueSucceededToday) {
          queueRefund(ev.actor_player_id, 'blue_shells')
          dbUpdates.push({ id: ev.id, status: 'returned', target_player_id: null, final_score_applied: null })
          continue
        }
        if (!leaderPid || !(leaderPid in dayRaw)) continue // can't resolve yet (need day's leader)

        // Season leader going into this date
        let seasonLeaderPid = null, seasonLeaderTotal = -Infinity
        for (const pid of Object.keys(cumulativeTotal)) {
          if (cumulativeTotal[pid] > seasonLeaderTotal) { seasonLeaderTotal = cumulativeTotal[pid]; seasonLeaderPid = pid }
        }
        const targetPid = seasonLeaderPid

        if (!targetPid || immune.has(targetPid) || impacted.has(targetPid)) {
          queueRefund(ev.actor_player_id, 'blue_shells')
          dbUpdates.push({ id: ev.id, status: 'returned', target_player_id: targetPid, final_score_applied: null })
          continue
        }

        blueSucceededToday = true
        impacted.add(targetPid)

        if (targetPid === ev.actor_player_id) {
          // self-protect: no score change, just impacted/protected
          dbUpdates.push({ id: ev.id, status: 'applied', target_player_id: targetPid, final_score_applied: null })
        } else {
          const final = effectiveRaw[leaderPid] // day winner's raw, before powerups
          finalScores[date][targetPid] = final
          dbUpdates.push({ id: ev.id, status: 'applied', target_player_id: targetPid, final_score_applied: final })
        }
      }
    }

    // Fill in final scores for anyone not hit: effective raw (post-mushroom only)
    for (const pid of playerIdsToday) {
      if (!(pid in finalScores[date])) {
        finalScores[date][pid] = effectiveRaw[pid]
      }
      cumulativeTotal[pid] = (cumulativeTotal[pid] || 0) + finalScores[date][pid]
    }
  }

  // Persist resolutions
  for (const upd of dbUpdates) {
    await supabase.from('powerup_events').update({
      status: upd.status,
      target_player_id: upd.target_player_id,
      final_score_applied: upd.final_score_applied,
    }).eq('id', upd.id)
  }

  // Persist refunds
  for (const [playerId, cols] of Object.entries(refunds)) {
    const member = memberByPlayer[playerId]
    if (!member) continue
    const patch = {}
    for (const [col, n] of Object.entries(cols)) {
      patch[col] = (member[col] || 0) + n
    }
    await supabase.from('league_members').update(patch).eq('id', member.id)
  }

  // Build standings
  const today = new Date().toISOString().split('T')[0]
  const standings = members.map(m => {
    let total = 0
    for (const date of allDates) {
      total += finalScores[date]?.[m.player_id] || 0
    }
    return {
      ...m,
      totalScore: Math.round(total),
      todayScore: finalScores[today]?.[m.player_id] != null ? Math.round(finalScores[today][m.player_id]) : null,
      todayImmune: rawScores[today]?.[m.player_id] != null && (rawScores[today][m.player_id] * 1.5) >= 300,
    }
  })

  standings.sort((a, b) => b.totalScore - a.totalScore)

  // ── Team standings ──────────────────────────────────
  const { data: teamsData } = await supabase
    .from('teams')
    .select('*, team_members(player_id, players(id, display_name, avatar_color))')
    .eq('league_id', leagueId)

  const teamStandings = (teamsData || []).map(team => {
    const memberIds = (team.team_members || []).map(m => m.player_id)
    const memberPlayers = (team.team_members || []).map(m => m.players)

    // Sum of daily team averages
    let teamTotal = 0
    for (const date of allDates) {
      const dayScores = memberIds
        .filter(pid => finalScores[date]?.[pid] !== undefined)
        .map(pid => finalScores[date][pid])
      if (dayScores.length > 0) {
        teamTotal += dayScores.reduce((a, b) => a + b, 0) / dayScores.length
      }
    }

    // Today's team average
    const todayMemberScores = memberIds
      .filter(pid => finalScores[today]?.[pid] !== undefined)
      .map(pid => finalScores[today][pid])
    const todayScore = todayMemberScores.length > 0
      ? Math.round(todayMemberScores.reduce((a, b) => a + b, 0) / todayMemberScores.length)
      : null

    return {
      id: team.id,
      name: team.name,
      avatar_color: team.avatar_color,
      memberPlayers,
      totalScore: Math.round(teamTotal),
      todayScore,
    }
  })

  teamStandings.sort((a, b) => b.totalScore - a.totalScore)

  return { league, standings, teamStandings, refunded: Object.keys(refunds).length > 0 }
}

/** Fire a shell. Decrements inventory immediately, logs event with timestamp. */
export async function fireShell(leagueId, memberId, actorPlayerId, shellType, targetPlayerId = null) {
  const eventTypeMap = {
    red: 'fire_red_shell',
    green: 'fire_green_shell',
    blue: 'fire_blue_shell',
    mushroom: 'use_mushroom',
  }
  const colMap = {
    red: 'red_shells', green: 'green_shells', blue: 'blue_shells', mushroom: 'mushrooms',
  }

  const { data: member, error: me } = await supabase
    .from('league_members').select('*').eq('id', memberId).single()
  if (me) throw me

  const col = colMap[shellType]
  if (!member[col] || member[col] < 1) throw new Error('No shells of that type to fire')

  const today = new Date().toISOString().split('T')[0]

  const { error: ue } = await supabase
    .from('league_members')
    .update({ [col]: member[col] - 1 })
    .eq('id', memberId)
  if (ue) throw ue

  const { error: ie } = await supabase.from('powerup_events').insert({
    league_id: leagueId,
    date: today,
    actor_player_id: actorPlayerId,
    event_type: eventTypeMap[shellType],
    target_player_id: shellType === 'green' ? targetPlayerId : null,
    quantity: 1,
    status: 'pending',
  })
  if (ie) throw ie
}
