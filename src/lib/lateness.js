/**
 * LATE SUBMISSION LOGIC
 * ------------------------------------------------------------------
 * Deadline: 10:00 London time on the day AFTER the exercise date.
 *   e.g. exercise on 14 Aug → deadline is 10:00 BST on 15 Aug.
 *
 * Every player gets ONE free late pass for the entire season. The
 * first time they're late (or miss a day entirely), it's forgiven —
 * their actual score still counts. Every late/missed day after that
 * is scored as a hard 0, regardless of what they actually did.
 *
 * "Late" is judged by the FIRST time a score was saved for that date
 * (created_at), not the most recent edit — so correcting a typo
 * later doesn't retroactively make an on-time submission look late.
 */

/** Returns the UTC offset (in minutes) for Europe/London at a given instant. Handles BST/GMT automatically. */
function londonOffsetMinutes(utcDate) {
  const dtf = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London', hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
  const parts = dtf.formatToParts(utcDate)
  const map = {}
  parts.forEach(p => { map[p.type] = p.value })
  const localAsUTC = Date.UTC(+map.year, +map.month - 1, +map.day, +map.hour, +map.minute, +map.second)
  return (localAsUTC - utcDate.getTime()) / 60000
}

/** Returns a UTC Date representing 10:00 London-local-time on the given YYYY-MM-DD date string. */
function londonTenAM(dateStr) {
  const guess = new Date(`${dateStr}T10:00:00Z`)
  const offsetMin = londonOffsetMinutes(guess)
  return new Date(guess.getTime() - offsetMin * 60000)
}

function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().split('T')[0]
}

/** The deadline instant (UTC Date) for a given exercise date. */
export function deadlineFor(exerciseDateStr) {
  return londonTenAM(addDays(exerciseDateStr, 1))
}

/**
 * Given a league's date range, all daily_scores rows, and "now",
 * determine every player's late/missed incidents in chronological
 * order and apply the one-free-pass rule.
 *
 * Returns: { [date]: { [player_id]: 'ontime' | 'late_forgiven' | 'late_penalized' | 'missed_forgiven' | 'missed_penalized' } }
 * and: { [player_id]: boolean } — whether their free pass has been used.
 */
export function computeLateStatus(league, memberPlayerIds, scoresByDatePlayer, now = new Date()) {
  const lateStatus = {}      // [date][pid] = status string
  const passUsed = {}        // [pid] = boolean
  memberPlayerIds.forEach(pid => { passUsed[pid] = false })

  // Build the full list of calendar dates in the league window
  const dates = []
  let d = league.start_date
  while (d <= league.end_date) {
    dates.push(d)
    d = addDays(d, 1)
  }

  for (const date of dates) {
    const deadline = deadlineFor(date)
    if (now < deadline) continue  // not due yet — skip entirely, no judgement possible

    lateStatus[date] = lateStatus[date] || {}

    for (const pid of memberPlayerIds) {
      const row = scoresByDatePlayer[date]?.[pid]

      if (!row) {
        // Never submitted, and the deadline has passed
        if (!passUsed[pid]) {
          passUsed[pid] = true
          lateStatus[date][pid] = 'missed_forgiven'
        } else {
          lateStatus[date][pid] = 'missed_penalized'
        }
        continue
      }

      const submittedAt = new Date(row.created_at)
      if (submittedAt <= deadline) {
        lateStatus[date][pid] = 'ontime'
      } else {
        if (!passUsed[pid]) {
          passUsed[pid] = true
          lateStatus[date][pid] = 'late_forgiven'
        } else {
          lateStatus[date][pid] = 'late_penalized'
        }
      }
    }
  }

  return { lateStatus, passUsed }
}
