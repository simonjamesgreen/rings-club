import { useState, useEffect } from 'react'

const RANK_MEDAL = { 1: '🥇', 2: '🥈', 3: '🥉' }

export default function DailyLeaderboard({ dailyBreakdown, league }) {
  const dates = Object.keys(dailyBreakdown || {}).sort()
  const latestDate = dates[dates.length - 1]
  const [selectedDate, setSelectedDate] = useState(latestDate)

  // Keep selection pinned to latest date when new data arrives, unless user picked an earlier one manually
  useEffect(() => {
    if (!selectedDate && latestDate) setSelectedDate(latestDate)
  }, [latestDate])

  if (!dates.length) {
    return (
      <div className="empty-state" style={{ marginTop: '1rem' }}>
        <div className="empty-state-icon">📅</div>
        <h2>No days completed yet</h2>
        <p>Once scores are entered for a day, it'll show up here.</p>
      </div>
    )
  }

  const rows = dailyBreakdown[selectedDate] || []
  const displayDate = new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long',
  })

  const minDate = dates[0]
  const maxDate = dates[dates.length - 1]

  return (
    <div>
      <div className="daily-date-picker">
        <input
          type="date"
          className="date-input"
          value={selectedDate}
          min={minDate}
          max={maxDate}
          onChange={e => setSelectedDate(e.target.value)}
        />
        {selectedDate !== latestDate && (
          <button className="daily-latest-btn" onClick={() => setSelectedDate(latestDate)}>
            Jump to latest
          </button>
        )}
      </div>

      <p className="daily-date-label">{displayDate}</p>

      <div className="standings-list">
        {rows.map((row, i) => (
          <div key={row.player_id} className="daily-card" style={{ '--player-color': row.player.avatar_color }}>
            <div className="daily-rank">{RANK_MEDAL[i + 1] ?? i + 1}</div>

            <div className="daily-identity">
              <span className="player-name" style={{ color: row.player.avatar_color }}>
                {row.player.display_name}
              </span>
              {row.lateStatus === 'late_forgiven' && (
                <span className="late-tag late-forgiven">🕐 Late (pass used)</span>
              )}
              {row.lateStatus === 'late_penalized' && (
                <span className="late-tag late-penalized">🕐 Late → 0</span>
              )}
              {row.lateStatus === 'missed_forgiven' && (
                <span className="late-tag late-forgiven">❌ Missed (pass used)</span>
              )}
              {row.lateStatus === 'missed_penalized' && (
                <span className="late-tag late-penalized">❌ Missed → 0</span>
              )}
              {row.rawScore !== row.finalScore && row.lateStatus !== 'late_penalized' && row.lateStatus !== 'missed_penalized' && (
                <span className="daily-shell-note">
                  raw {row.rawScore}% → {row.finalScore}% after shells
                </span>
              )}
            </div>

            <div className="daily-score-block">
              <div className="score-total">
                {row.finalScore}<span className="score-label">%</span>
              </div>
              <div className="daily-points">+{row.points} pts</div>
            </div>
          </div>
        ))}

        {!rows.length && (
          <div className="empty-state">
            <div className="empty-state-icon">🌙</div>
            <h2>No scores that day</h2>
          </div>
        )}
      </div>
    </div>
  )
}
