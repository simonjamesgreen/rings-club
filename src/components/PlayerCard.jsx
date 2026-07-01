import { getRankDisplay } from '../lib/scoring'

export default function PlayerCard({ rank, player, totalScore, todayScore, isImmune, isMe, shells }) {
  const isQualified = todayScore !== null && todayScore !== undefined && todayScore >= 150
  const hasAnyShells = shells.red > 0 || shells.green > 0 || shells.blue > 0 || shells.mushrooms > 0 || shells.clouds > 0

  return (
    <div
      className={`player-card rank-${rank} ${isMe ? 'is-me' : ''}`}
      style={{ '--player-color': player.avatar_color }}
    >
      <div className="player-rank">{getRankDisplay(rank)}</div>

      <div className="player-identity">
        <span className="player-name" style={{ color: player.avatar_color }}>
          {player.display_name}
          {isMe && <span className="you-tag">you</span>}
        </span>
        <div className="player-badges">
          {isImmune && <span className="badge badge-immune">⚡ Immune</span>}
        </div>
      </div>

      <div className="player-score-block">
        <div className="score-total">
          {totalScore.toLocaleString()}
          <span className="score-label">pts</span>
        </div>
        <div className={`score-today ${isImmune ? 'immune' : isQualified ? 'qualifying' : ''}`}>
          {todayScore !== null && todayScore !== undefined ? `${todayScore}% today` : '— no score'}
        </div>
      </div>

      <div className="player-shells">
        {hasAnyShells ? (
          <div className="shell-row">
            {shells.red       > 0 && <span className="shell-count red">🔴 {shells.red}</span>}
            {shells.green     > 0 && <span className="shell-count green">🟢 {shells.green}</span>}
            {shells.blue      > 0 && <span className="shell-count blue">🔵 {shells.blue}</span>}
            {shells.mushrooms > 0 && <span className="shell-count mush">🍄 {shells.mushrooms}</span>}
            {shells.clouds     > 0 && <span className="shell-count cloud">☁️ {shells.clouds}</span>}
          </div>
        ) : (
          <span className="no-shells">—</span>
        )}
      </div>
    </div>
  )
}
