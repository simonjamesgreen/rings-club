export default function Rules() {
  return (
    <main className="rules-page">

      <header className="rules-header">
        <h1 className="rules-title">📖 Rules</h1>
        <p className="rules-subtitle">Season 1 · 4–18 July 2026</p>
      </header>

      {/* OVERVIEW */}
      <section className="rules-section">
        <h2 className="rules-section-title">Overview</h2>
        <p className="rules-text">
          A two-week Apple Watch fitness competition. Score daily by hitting your Move ring,
          then spend power-ups to protect yourself or sabotage your opponents.
          Both individual and team standings run simultaneously.
        </p>
      </section>

      {/* COMPETITION DATES */}
      <section className="rules-section">
        <h2 className="rules-section-title">Dates</h2>
        <div className="rules-table">
          <div className="rules-row">
            <span className="rules-row-label">Exercise period</span>
            <span className="rules-row-value">4 July – 18 July 2026</span>
          </div>
          <div className="rules-row">
            <span className="rules-row-label">Score submission</span>
            <span className="rules-row-value">5 July – 19 July 2026 (enter the previous day's data)</span>
          </div>
          <div className="rules-row">
            <span className="rules-row-label">Shell firing window</span>
            <span className="rules-row-value">7:00am – 11:00pm BST, any competition day</span>
          </div>
        </div>
      </section>

      {/* SCORING */}
      <section className="rules-section">
        <h2 className="rules-section-title">Daily Scoring</h2>
        <div className="rules-formula">
          Score = (Move Calories ÷ Move Goal) × 100%
        </div>
        <div className="rules-table" style={{ marginTop: '1rem' }}>
          <div className="rules-row">
            <span className="rules-row-label">Zero condition</span>
            <span className="rules-row-value">Score is 0 if exercise &lt; 30 min OR stand hours &lt; 12</span>
          </div>
          <div className="rules-row">
            <span className="rules-row-label">Immunity</span>
            <span className="rules-row-value">Score ≥ 300% → no incoming shells can hit you that day</span>
          </div>
        </div>
      </section>

      {/* SHELL EARNING */}
      <section className="rules-section">
        <h2 className="rules-section-title">Earning Shells</h2>
        <p className="rules-text">Hit <strong>150%+</strong> on your daily score and you automatically earn one shell when you submit.</p>
        <p className="rules-text" style={{ marginTop: '0.75rem' }}>
          Shells are earned in a <strong>guaranteed random cycle</strong> across all four types
          (🔴 🟢 🔵 🍄). You'll never get the same type twice until you've collected all four —
          then the cycle resets and starts again in a new random order.
        </p>
        <div className="rules-note" style={{ marginTop: '0.75rem' }}>
          ☁️ Clouds are different — everyone starts with 2 and they cannot be earned. Once used, they're gone.
        </div>
      </section>

      {/* POWER-UPS */}
      <section className="rules-section">
        <h2 className="rules-section-title">Power-Ups</h2>
        <div className="powerup-cards">

          <div className="powerup-card" style={{ '--pu-color': '#ff4444' }}>
            <div className="powerup-card-header">
              <span className="powerup-icon">🔴</span>
              <span className="powerup-name">Red Shell</span>
            </div>
            <div className="powerup-detail">
              <span className="powerup-detail-label">Target</span>
              <span>Whoever scored highest today (daily leader, not overall)</span>
            </div>
            <div className="powerup-detail">
              <span className="powerup-detail-label">Effect</span>
              <span>Halves their daily score</span>
            </div>
            <div className="powerup-detail">
              <span className="powerup-detail-label">If blocked</span>
              <span>Shell returned to you</span>
            </div>
            <div className="powerup-detail">
              <span className="powerup-detail-label">Note</span>
              <span>Can't target yourself even if you're the daily leader</span>
            </div>
          </div>

          <div className="powerup-card" style={{ '--pu-color': '#43d692' }}>
            <div className="powerup-card-header">
              <span className="powerup-icon">🟢</span>
              <span className="powerup-name">Green Shell</span>
            </div>
            <div className="powerup-detail">
              <span className="powerup-detail-label">Target</span>
              <span>You choose</span>
            </div>
            <div className="powerup-detail">
              <span className="powerup-detail-label">Effect</span>
              <span>Halves their daily score</span>
            </div>
            <div className="powerup-detail">
              <span className="powerup-detail-label">If blocked</span>
              <span>Shell returned to you</span>
            </div>
          </div>

          <div className="powerup-card" style={{ '--pu-color': '#4a86e8' }}>
            <div className="powerup-card-header">
              <span className="powerup-icon">🔵</span>
              <span className="powerup-name">Blue Shell</span>
            </div>
            <div className="powerup-detail">
              <span className="powerup-detail-label">Target</span>
              <span>Yourself — this is a self-boost, not an attack</span>
            </div>
            <div className="powerup-detail">
              <span className="powerup-detail-label">Effect</span>
              <span>
                Your score for that day becomes the same as whoever posted the highest score.
                The top scorer is completely unaffected — they keep their score.
                You just get a copy of it.
              </span>
            </div>
            <div className="powerup-detail">
              <span className="powerup-detail-label">Condition</span>
              <span>You must still hit your own exercise (30+ min) AND stand (12+ hrs) targets. If you don't, you get 0 and the shell is consumed.</span>
            </div>
            <div className="powerup-detail">
              <span className="powerup-detail-label">One per day</span>
              <span>Only the earliest timestamp succeeds — if multiple people fire one, only the first benefits. Others get their shell back.</span>
            </div>
            <div className="powerup-detail">
              <span className="powerup-detail-label">Interaction rule</span>
              <span>Firing a blue shell uses your one daily powerup interaction slot</span>
            </div>
          </div>

          <div className="powerup-card" style={{ '--pu-color': '#ff8c00' }}>
            <div className="powerup-card-header">
              <span className="powerup-icon">🍄</span>
              <span className="powerup-name">Mushroom</span>
            </div>
            <div className="powerup-detail">
              <span className="powerup-detail-label">Target</span>
              <span>Yourself</span>
            </div>
            <div className="powerup-detail">
              <span className="powerup-detail-label">Effect</span>
              <span>Your score × 1.5 for that day</span>
            </div>
            <div className="powerup-detail">
              <span className="powerup-detail-label">Use any day</span>
              <span>Can be saved and used on any day you choose</span>
            </div>
          </div>

          <div className="powerup-card powerup-card-wide" style={{ '--pu-color': '#c0c0c0' }}>
            <div className="powerup-card-header">
              <span className="powerup-icon">☁️</span>
              <span className="powerup-name">Cloud</span>
              <span className="powerup-badge">Everyone starts with 2</span>
            </div>
            <div className="powerup-detail">
              <span className="powerup-detail-label">Target</span>
              <span>Yourself</span>
            </div>
            <div className="powerup-detail">
              <span className="powerup-detail-label">Effect</span>
              <span>Your day-off card. Overrides the exercise/stand zero condition — your score is at least 100% regardless. If your actual move % is higher, you get the higher number.</span>
            </div>
            <div className="powerup-detail">
              <span className="powerup-detail-label">Protection</span>
              <span>If you fire your Cloud <em>before</em> someone fires a shell at you (by timestamp), their shell bounces back to them</span>
            </div>
            <div className="powerup-detail">
              <span className="powerup-detail-label">Supply</span>
              <span>Cannot be earned — 2 per player for the whole season. Use them wisely.</span>
            </div>
          </div>

        </div>
      </section>

      {/* THE GOLDEN RULE */}
      <section className="rules-section">
        <h2 className="rules-section-title">⚡ The Golden Rule</h2>
        <div className="golden-rule-box">
          <p className="golden-rule-text">
            Each player can only be affected by <strong>one powerup per day</strong> —
            whether it's something they use on themselves or a shell fired at them.
            Whichever happens first by exact timestamp (down to the millisecond) takes the slot.
            Everything else is returned to its owner.
          </p>
        </div>
        <div className="rules-examples">
          <p className="rules-examples-title">Examples</p>
          <div className="rules-example">
            <span className="example-icon ok">✓</span>
            <span>You fire Cloud at 07:00 — you're protected for the day. Someone fires a Red Shell at you at 07:05 — it bounces back.</span>
          </div>
          <div className="rules-example">
            <span className="example-icon ok">✓</span>
            <span>You fire Cloud at 07:00 — you try to use Mushroom at 07:05 — Mushroom is returned. You already used your slot.</span>
          </div>
          <div className="rules-example">
            <span className="example-icon no">✗</span>
            <span>Someone fires a Red Shell at you at 07:00 — it lands. You fire Cloud at 07:10 — Cloud returned. The shell was first.</span>
          </div>
        </div>
      </section>

      {/* HOW SHELLS WORK TIMING */}
      <section className="rules-section">
        <h2 className="rules-section-title">Timing</h2>
        <div className="rules-table">
          <div className="rules-row">
            <span className="rules-row-label">When shells fire</span>
            <span className="rules-row-value">Any day, 7:00am – 11:00pm BST</span>
          </div>
          <div className="rules-row">
            <span className="rules-row-label">When shells land</span>
            <span className="rules-row-value">The next day, when scores for the fired day are submitted</span>
          </div>
          <div className="rules-row">
            <span className="rules-row-label">Tie-breaking</span>
            <span className="rules-row-value">Millisecond precision — visible in the Shell Activity feed</span>
          </div>
          <div className="rules-row">
            <span className="rules-row-label">Example</span>
            <span className="rules-row-value">Fire on 4 July → resolves when 4 July scores are entered on 5 July</span>
          </div>
        </div>
      </section>

      {/* TEAMS */}
      <section className="rules-section">
        <h2 className="rules-section-title">Team Scoring</h2>
        <div className="rules-teams">
          <div className="rules-team" style={{ '--team-color': '#b694e8' }}>
            <span className="rules-team-name">Wiggy &amp; Zee</span>
          </div>
          <div className="rules-team" style={{ '--team-color': '#2da2bb' }}>
            <span className="rules-team-name">Simon &amp; Matt</span>
          </div>
          <div className="rules-team" style={{ '--team-color': '#ffd700' }}>
            <span className="rules-team-name">Moo</span>
          </div>
        </div>
        <p className="rules-text" style={{ marginTop: '1rem' }}>
          Team daily score = average of each team member's individual daily score (after all powerup effects).
          Team total = sum of all daily team scores across the competition.
        </p>
        <p className="rules-text" style={{ marginTop: '0.5rem' }}>
          If one team member hasn't submitted yet, the team score uses whoever has.
          It updates automatically as scores come in.
        </p>
      </section>

    </main>
  )
}
