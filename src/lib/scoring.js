/**
 * Core Rings Club scoring rules
 * score = (move_calories / move_goal) * 100
 * Zeroed if exercise < 30 min OR stand < 10 hrs
 */
export function calculateScore(moveCalories, moveGoal, exerciseMinutes, standHours) {
  if (exerciseMinutes < 30 || standHours < 10) return 0
  return Math.round((moveCalories / moveGoal) * 100)
}

/**
 * The Move goal that applied to a given exercise date for a league member.
 * member.goal_history = [{ until: 'YYYY-MM-DD', goal: N }] holds earlier goals
 * (valid up to and including `until`); later dates use member.move_goal.
 * This lets a target change take effect from a chosen date without
 * re-scoring earlier days.
 */
export function goalFor(member, date) {
  if (!member) return 500
  const history = Array.isArray(member.goal_history) ? member.goal_history : []
  const sorted = [...history].sort((a, b) => (a.until < b.until ? -1 : 1))
  for (const h of sorted) {
    if (date <= h.until) return h.goal
  }
  return member.move_goal || 500
}

/** ≥125% move qualifies for a shell */
export function qualifiesForShell(score) {
  return score >= 125
}

/** ≥300% = immune to shells */
export function hasImmunity(score) {
  return score >= 300
}

export function getRankDisplay(rank) {
  if (rank === 1) return '🥇'
  if (rank === 2) return '🥈'
  if (rank === 3) return '🥉'
  return `${rank}`
}
