import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const SHELL_ICON = {
  fire_red_shell:   '🔴',
  fire_green_shell: '🟢',
  fire_blue_shell:  '🔵',
  use_mushroom:     '🍄',
  earn_red_shell:   '🔴',
  earn_green_shell: '🟢',
  earn_blue_shell:  '🔵',
  earn_mushroom:    '🍄',
  earn_cloud:       '☁️',
  use_cloud:        '☁️',
}

const SHELL_NAME = {
  fire_red_shell:   'Red Shell',
  fire_green_shell: 'Green Shell',
  fire_blue_shell:  'Blue Shell',
  use_mushroom:     'Mushroom',
  earn_red_shell:   'Red Shell',
  earn_green_shell: 'Green Shell',
  earn_blue_shell:  'Blue Shell',
  earn_mushroom:    'Mushroom',
  earn_cloud:       'Cloud',
  use_cloud:        'Cloud',
}

function formatBST(isoString) {
  const d = new Date(isoString)

  // Time in Europe/London (handles BST/GMT automatically)
  const timeParts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    hour:     '2-digit',
    minute:   '2-digit',
    second:   '2-digit',
    hour12:   false,
  }).formatToParts(d)

  const h   = timeParts.find(p => p.type === 'hour').value
  const min = timeParts.find(p => p.type === 'minute').value
  const s   = timeParts.find(p => p.type === 'second').value
  const ms  = String(d.getMilliseconds()).padStart(3, '0')

  // Date portion
  const datePart = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    day:   'numeric',
    month: 'short',
  }).format(d)

  return { time: `${h}:${min}:${s}.${ms}`, date: datePart }
}

export default function ActivityFeed({ leagueId, standings }) {
  const [events, setEvents] = useState([])

  useEffect(() => { load() }, [leagueId])

  async function load() {
    const { data } = await supabase
      .from('powerup_events')
      .select('*')
      .eq('league_id', leagueId)
      .in('event_type', ['fire_red_shell', 'fire_green_shell', 'fire_blue_shell', 'use_mushroom', 'use_cloud'])
      .order('created_at', { ascending: false })
      .limit(20)
    setEvents(data || [])
  }

  const nameOf  = pid => standings.find(s => s.player_id === pid)?.player?.display_name ?? '?'
  const colorOf = pid => standings.find(s => s.player_id === pid)?.player?.avatar_color  ?? '#888'

  if (!events.length) return (
    <div className="activity-feed">
      <p className="admin-card-title">Shell Activity</p>
      <p className="activity-empty">No shells fired yet — the race is clean.</p>
    </div>
  )

  return (
    <div className="activity-feed">
      <p className="admin-card-title">Shell Activity · BST</p>

      {events.map(ev => {
        const icon  = SHELL_ICON[ev.event_type] ?? '💥'
        const name  = SHELL_NAME[ev.event_type] ?? ev.event_type
        const { time, date } = formatBST(ev.created_at)
        const isFire = ev.event_type.startsWith('fire_')

        let statusBadge
        if (ev.status === 'pending')  statusBadge = <span className="status-badge pending">⏳ Lands tomorrow</span>
        if (ev.status === 'applied')  statusBadge = <span className="status-badge applied">✓ Hit</span>
        if (ev.status === 'returned') statusBadge = <span className="status-badge returned">↩ Returned</span>

        let desc
        if (ev.event_type === 'use_mushroom') {
          desc = (
            <>used by <b style={{ color: colorOf(ev.actor_player_id) }}>{nameOf(ev.actor_player_id)}</b></>
          )
        } else if (ev.event_type === 'fire_green_shell' && ev.target_player_id) {
          desc = (
            <>
              <b style={{ color: colorOf(ev.actor_player_id) }}>{nameOf(ev.actor_player_id)}</b>
              {' → '}
              <b style={{ color: colorOf(ev.target_player_id) }}>{nameOf(ev.target_player_id)}</b>
            </>
          )
        } else if (ev.event_type === 'fire_red_shell') {
          desc = (
            <>
              <b style={{ color: colorOf(ev.actor_player_id) }}>{nameOf(ev.actor_player_id)}</b>
              {' → daily leader'}
            </>
          )
        } else if (ev.event_type === 'fire_blue_shell') {
          desc = (
            <>
              <b style={{ color: colorOf(ev.actor_player_id) }}>{nameOf(ev.actor_player_id)}</b>
              {ev.status === 'applied'
                ? ` copied the day's top score (${ev.final_score_applied != null ? Math.round(ev.final_score_applied) + '%' : '—'})`
                : ' · returned'
              }
            </>
          )
        } else if (ev.event_type === 'use_cloud') {
          desc = (
            <>used by <b style={{ color: colorOf(ev.actor_player_id) }}>{nameOf(ev.actor_player_id)}</b> · 100% floor + shield</>
          )
        } else {
          desc = <b style={{ color: colorOf(ev.actor_player_id) }}>{nameOf(ev.actor_player_id)}</b>
        }

        return (
          <div key={ev.id} className="activity-row-v2">
            <div className="activity-shell">
              <span className="activity-icon">{icon}</span>
              <span className="activity-shell-name">{name}</span>
            </div>
            <div className="activity-detail">
              <span className="activity-desc">{desc}</span>
              {statusBadge}
            </div>
            <div className="activity-timestamp">
              <span className="activity-time-ms">{time}</span>
              <span className="activity-date-small">{date} BST</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}
