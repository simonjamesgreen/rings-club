const RANK_MEDAL = { 1: '🥇', 2: '🥈', 3: '🥉' }

export default function TeamCard({ rank, team }) {
  return (
    <div
      className="team-card"
      style={{ '--team-color': team.avatar_color }}
    >
      <div className="team-rank">
        {RANK_MEDAL[rank] ?? rank}
      </div>

      <div className="team-identity">
        <span className="team-name" style={{ color: team.avatar_color }}>
          {team.name}
        </span>
        <div className="team-members">
          {team.memberPlayers.map((p, i) => (
            <span
              key={p.id}
              className="team-member-chip"
              style={{ color: p.avatar_color }}
            >
              {p.display_name}{i < team.memberPlayers.length - 1 ? ' ·' : ''}
            </span>
          ))}
        </div>
      </div>

      <div className="player-score-block">
        <div className="score-total">
          {team.totalScore.toLocaleString()}
          <span className="score-label">pts</span>
        </div>
        <div className="score-today">
          {team.todayScore !== null ? `${team.todayScore}% today` : '— no score'}
        </div>
      </div>
    </div>
  )
}
