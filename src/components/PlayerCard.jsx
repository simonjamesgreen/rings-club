import { getRankDisplay } from '../lib/scoring'

export default function PlayerCard({ rank, player, totalScore, todayScore, isImmune, shells }) {
  const isQualified = todayScore !== null && todayScore !== undefined && todayScore >= 150

  const hasAnyShells = shells.red > 0 || shells.green > 0 || shells.blue > 0 || shells.mushrooms > 0

  return (
    <div
      className={`player-card rank-${rank}`}
      style={{ '--player-color': player.avatar_color }}
    >
      {/* Rank */}
      <div className="player-rank">{getRankDisplay(rank)}</div>

      {/* Name + badges */}
      <div className="player-identity">
        <span className="player-name" style={{ color: player.avatar_color }}>
          {player.display_name}
        </span>
        <div className="player-badges">
          {isImmune && <span className="badge badge-immune">⚡ Immune</span>}
        </div>
      </div>

      {/* Scores */}
      <div className="player-score-block">
        <div className="score-total">
          {totalScore.toLocaleString()}
          <span className="score-label">pts</span>
        </div>
        <div className={`score-today ${isImmune ? 'immune' : isQualified ? 'qualifying' : ''}`}>
          {todayScore !== null && todayScore !== undefined
            ? `${todayScore}% today`
            : '— no score'}
        </div>
      </div>

      {/* Shell inventory */}
      <div className="player-shells">
        {hasAnyShells ? (
          <div className="shell-row">
            {shells.red > 0      && <span className="shell-count red">🔴 {shells.red}</span>}
            {shells.green > 0    && <span className="shell-count green">🟢 {shells.green}</span>}
            {shells.blue > 0     && <span className="shell-count blue">🔵 {shells.blue}</span>}
            {shells.mushrooms > 0 && <span className="shell-count mush">🍄 {shells.mushrooms}</span>}
          </div>
        ) : (
          <span className="no-shells">—</span>
        )}
      </div>
    </div>
  )
}
