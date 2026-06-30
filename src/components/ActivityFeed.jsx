import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const SHELL_LABEL = {
  fire_red_shell:   '🔴 Red Shell',
  fire_green_shell: '🟢 Green Shell',
  fire_blue_shell:  '🔵 Blue Shell',
  use_mushroom:     '🍄 Mushroom',
}

export default function ActivityFeed({ leagueId, standings }) {
  const [events, setEvents] = useState([])

  useEffect(() => { load() }, [leagueId])

  async function load() {
    const { data } = await supabase
      .from('powerup_events')
      .select('*')
      .eq('league_id', leagueId)
      .order('created_at', { ascending: false })
      .limit(15)
    setEvents(data || [])
  }

  const nameOf = (pid) => standings.find(s => s.player_id === pid)?.player?.display_name || '?'
  const colorOf = (pid) => standings.find(s => s.player_id === pid)?.player?.avatar_color || '#888'

  if (!events.length) return null

  return (
    <div className="activity-feed">
      <p className="admin-card-title">Recent Activity</p>
      {events.map(ev => {
        const time = new Date(ev.created_at).toLocaleString('en-GB', {
          day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
        })
        const label = SHELL_LABEL[ev.event_type] || ev.event_type

        let desc
        if (ev.status === 'pending') {
          desc = <>fired by <b style={{ color: colorOf(ev.actor_player_id) }}>{nameOf(ev.actor_player_id)}</b> · awaiting resolution</>
        } else if (ev.status === 'returned') {
          desc = <>fired by <b style={{ color: colorOf(ev.actor_player_id) }}>{nameOf(ev.actor_player_id)}</b> · returned (no effect)</>
        } else if (ev.event_type === 'use_mushroom') {
          desc = <>used by <b style={{ color: colorOf(ev.actor_player_id) }}>{nameOf(ev.actor_player_id)}</b> · +50% that day</>
        } else {
          desc = <>fired by <b style={{ color: colorOf(ev.actor_player_id) }}>{nameOf(ev.actor_player_id)}</b> → hit <b style={{ color: colorOf(ev.target_player_id) }}>{nameOf(ev.target_player_id)}</b></>
        }

        return (
          <div key={ev.id} className="activity-row">
            <span className="activity-label">{label}</span>
            <span className="activity-desc">{desc}</span>
            <span className="activity-time">{time}</span>
          </div>
        )
      })}
    </div>
  )
}
