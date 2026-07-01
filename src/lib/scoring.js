/**
 * Core Rings Club scoring rules
 * score = (move_calories / move_goal) * 100
 * Zeroed if exercise < 30 min OR stand < 12 hrs
 */
export function calculateScore(moveCalories, moveGoal, exerciseMinutes, standHours) {
  if (exerciseMinutes < 30 || standHours < 12) return 0
  return Math.round((moveCalories / moveGoal) * 100)
}

/** ≥150% move qualifies for a shell */
export function qualifiesForShell(score) {
  return score >= 200
}

/** ≥90 exercise min qualifies for a mushroom */
export function qualifiesForMushroom(exerciseMinutes) {
  return exerciseMinutes >= 90
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
