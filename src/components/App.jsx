import { callLLM } from '../services/llm'
import { useState, useEffect, useRef } from 'react'
import { MessageCircle, CheckSquare, BookOpen, FileText, Brain, Send,
         CheckCircle2, Loader2, ChevronUp, ChevronDown, Trash2, LogOut } from 'lucide-react'
import { api } from '../services/api'
import Auth from './Auth'

// ─────────────────────────────────────────────────────────────────
// AI SYSTEM PROMPT
// ─────────────────────────────────────────────────────────────────
const buildPrompt = (profile, tasks, notes, journal) => `
You are a deeply personal AI assistant embedded in the user's private Second Brain app.

## User Profile & Learned Traits
${profile.length ? profile.map(t => `- ${t.trait}: ${t.value}`).join('\n') : 'Still learning.'}

## Active Tasks
${tasks.filter(t=>!t.completed).sort((a,b)=>b.priority-a.priority).slice(0,10)
  .map(t=>`- [P${t.priority}] id:${t.id} — ${t.title}`).join('\n') || 'None.'}

## Recent Notes
${notes.slice(-4).map(n=>`- "${n.title}": ${n.content.slice(0,100)}`).join('\n') || 'None.'}

## Recent Journal
${journal.slice(-3).map(j=>`- ${j.entry_date}: ${j.content.slice(0,120)}`).join('\n') || 'None.'}

## Behavior Rules
- Be warm, personal, direct — like a trusted assistant who knows them
- Extract tasks naturally from conversation — don't ask, just create
- Detect feelings/reflections and create journal entries
- "make a note about X" → create_note
- Learn priority feedback: "this should be higher" → update_task_priority
- Build profile silently from behavioral cues

## STRICT RESPONSE FORMAT — pure JSON only, no markdown, no fences:
{
  "message": "your conversational reply",
  "actions": [
    { "type": "create_task",           "title": "...", "priority": 1-5, "reason": "..." },
    { "type": "create_note",           "title": "...", "content": "...", "tags": ["..."] },
    { "type": "create_journal",        "title": "...", "content": "..." },
    { "type": "update_profile",        "trait": "...", "value": "..." },
    { "type": "update_task_priority",  "taskId": "exact-uuid", "newPriority": 1-5, "reason": "..." },
    { "type": "complete_task",         "taskId": "exact-uuid" }
  ]
}
Priority scale: 1=low 2=low-med 3=medium 4=high 5=urgent
`

// ─────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────
const priorityMeta = p => [null,
  { label:'Low',     color:'#6b7280', bg:'rgba(107,114,128,0.12)', border:'rgba(107,114,128,0.25)' },
  { label:'Low-Med', color:'#22d3ee', bg:'rgba(34,211,238,0.10)',  border:'rgba(34,211,238,0.25)'  },
  { label:'Medium',  color:'#a78bfa', bg:'rgba(167,139,250,0.10)', border:'rgba(167,139,250,0.25)' },
  { label:'High',    color:'#fb923c', bg:'rgba(251,146,60,0.10)',  border:'rgba(251,146,60,0.25)'  },
  { label:'Urgent',  color:'#f87171', bg:'rgba(248,113,113,0.10)', border:'rgba(248,113,113,0.25)' },
][p] || { label:'Medium', color:'#a78bfa', bg:'rgba(167,139,250,0.10)', border:'rgba(167,139,250,0.25)' }

const actionChip = a => {
  if (a.type==='create_task')          return { icon:'✦', label: a.title?.slice(0,20)||'Task',   color:'#34d399' }
  if (a.type==='create_note')          return { icon:'◈', label: a.title?.slice(0,20)||'Note',   color:'#a78bfa' }
  if (a.type==='create_journal')       return { icon:'◉', label: 'Journal entry',                color:'#22d3ee' }
  if (a.type==='update_profile')       return { icon:'◎', label: a.trait,                        color:'#fb923c' }
  if (a.type==='update_task_priority') return { icon:'↕', label: 'Priority updated',             color:'#facc15' }
  if (a.type==='complete_task')        return { icon:'✓', label: 'Task done',                    color:'#34d399' }
  return { icon:'·', label: a.type, color:'#6b7280' }
}

const STARTERS = [
  'I need to finish my project by Friday',
  'Make a note about my morning routine idea',
  "I'm feeling overwhelmed with work lately",
]

// ─────────────────────────────────────────────────────────────────
// MAIN APP
// ─────────────────────────────────────────────────────────────────
export default function App() {
  const [user,    setUser]    = useState(null)
  const [loading, setLoading] = useState(true) // initial session check

  // Data state
  const [msgs,    setMsgs]    = useState([])
  const [tasks,   setTasks]   = useState([])
  const [notes,   setNotes]   = useState([])
  const [journal, setJournal] = useState([])
  const [profile, setProfile] = useState([])

  // UI state
  const [tab,       setTab]     = useState('chat')
  const [input,     setInput]   = useState('')
  const [sending,   setSending] = useState(false)
  const [expanded,  setExpanded]= useState({})
  const endRef = useRef(null)

  // ── Auth: restore session on mount ──────────────────────────────
  useEffect(() => {
    api.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null)
      setLoading(false)
    })
    const { data: { subscription } } = api.auth.onAuthChange((_e, session) => {
      setUser(session?.user ?? null)
    })
    return () => subscription.unsubscribe()
  }, [])

  // ── Load all data when user is available ────────────────────────
  useEffect(() => {
    if (!user) return
    const uid = user.id
    Promise.all([
      api.messages.getAll(uid),
      api.tasks.getAll(uid),
      api.notes.getAll(uid),
      api.journal.getAll(uid),
      api.profile.getAll(uid),
    ]).then(([m, t, n, j, p]) => {
      setMsgs(m    || [])
      setTasks(t   || [])
      setNotes(n   || [])
      setJournal(j || [])
      setProfile(p || [])
    }).catch(console.error)
  }, [user])

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [msgs, sending])

  // ── Sign out ─────────────────────────────────────────────────────
  const signOut = async () => {
    await api.auth.signOut()
    setUser(null); setMsgs([]); setTasks([]); setNotes([]); setJournal([]); setProfile([])
  }

  // ── Apply AI actions ─────────────────────────────────────────────
  const applyActions = async (actions, userId) => {
    if (!actions?.length) return
    for (const a of actions) {
      try {
        if (a.type === 'create_task') {
          const t = await api.tasks.create(userId, {
            title: a.title, priority: a.priority || 3,
            reason: a.reason || '', completed: false,
          })
          setTasks(p => [...p, t])

        } else if (a.type === 'create_note') {
          const n = await api.notes.create(userId, {
            title: a.title, content: a.content, tags: a.tags || [],
          })
          setNotes(p => [...p, n])

        } else if (a.type === 'create_journal') {
          const e = await api.journal.create(userId, {
            title: a.title || 'Entry', content: a.content,
            entry_date: new Date().toLocaleDateString('en-US', {
              weekday:'long', year:'numeric', month:'long', day:'numeric'
            }),
          })
          setJournal(p => [...p, e])

        } else if (a.type === 'update_profile') {
          const t = await api.profile.upsert(userId, a.trait, a.value)
          setProfile(p => {
            const i = p.findIndex(x => x.trait === a.trait)
            if (i >= 0) { const u = [...p]; u[i] = t; return u }
            return [...p, t]
          })

        } else if (a.type === 'update_task_priority') {
          await api.tasks.update(a.taskId, { priority: a.newPriority, reason: a.reason || '' })
          setTasks(p => p.map(t => t.id === a.taskId
            ? { ...t, priority: a.newPriority, reason: a.reason || t.reason } : t))

        } else if (a.type === 'complete_task') {
          await api.tasks.update(a.taskId, { completed: true })
          setTasks(p => p.map(t => t.id === a.taskId ? { ...t, completed: true } : t))
        }
      } catch (err) { console.error('Action error:', a.type, err) }
    }
  }

  // ── Send message ─────────────────────────────────────────────────
  const send = async () => {
    if (!input.trim() || sending || !user) return
    const uid   = user.id
    const text  = input.trim()
    setInput(''); setSending(true)

    // Save user message to DB + state
    const userMsg = await api.messages.create(uid, { role: 'user', content: text, actions: [] })
    setMsgs(p => [...p, userMsg])

    try {
      const history = [...msgs, userMsg].slice(-24)
        .map(m => ({ role: m.role, content: m.content }))

      const raw = await callLLM(
        buildPrompt(profile, tasks, notes, journal),
        [...msgs, userMsg].slice(-24).map(m => ({ role: m.role, content: m.content }))
      )

      let parsed
      try {
        parsed = JSON.parse(raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim())
      } catch {
        parsed = { message: raw, actions: [] }
      }

      // Save AI message to DB + state
      const aiMsg = await api.messages.create(uid, {
        role: 'assistant', content: parsed.message, actions: parsed.actions || [],
      })
      setMsgs(p => [...p, aiMsg])
      await applyActions(parsed.actions, uid)

    } catch (err) {
      console.error(err)
      const errMsg = await api.messages.create(uid, {
        role: 'assistant', content: 'Something went wrong. Please try again.', actions: [],
      })
      setMsgs(p => [...p, errMsg])
    }
    setSending(false)
  }

  // ── Task helpers ─────────────────────────────────────────────────
  const completeTask = async (id) => {
    await api.tasks.update(id, { completed: true })
    setTasks(p => p.map(t => t.id === id ? { ...t, completed: true } : t))
  }
  const changePriority = async (id, delta) => {
    const task = tasks.find(t => t.id === id)
    const next = Math.min(5, Math.max(1, task.priority + delta))
    await api.tasks.update(id, { priority: next })
    setTasks(p => p.map(t => t.id === id ? { ...t, priority: next } : t))
  }
  const deleteTask = async (id) => {
    await api.tasks.delete(id)
    setTasks(p => p.filter(t => t.id !== id))
  }
  const deleteNote = async (id) => {
    await api.notes.delete(id)
    setNotes(p => p.filter(n => n.id !== id))
  }
  const deleteJournal = async (id) => {
    await api.journal.delete(id)
    setJournal(p => p.filter(e => e.id !== id))
  }
  const deleteProfileTrait = async (id) => {
    await api.profile.delete(id)
    setProfile(p => p.filter(t => t.id !== id))
  }
  const toggleExp = id => setExpanded(p => ({ ...p, [id]: !p[id] }))

  const activeTasks = tasks.filter(t => !t.completed).sort((a, b) => b.priority - a.priority)
  const doneTasks   = tasks.filter(t => t.completed)

  // ── Styles ───────────────────────────────────────────────────────
  const glass = {
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.07)',
    backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
  }
  const card = {
    background: 'rgba(255,255,255,0.025)',
    border: '1px solid rgba(255,255,255,0.07)',
    borderRadius: 10, padding: '12px 14px', marginBottom: 8,
  }

  const TABS = [
    { id:'chat',    Icon:MessageCircle, label:'Chat' },
    { id:'tasks',   Icon:CheckSquare,   label:'Tasks',   badge:activeTasks.length||null },
    { id:'notes',   Icon:FileText,      label:'Notes',   badge:notes.length||null },
    { id:'journal', Icon:BookOpen,      label:'Journal', badge:null },
    { id:'profile', Icon:Brain,         label:'Profile', badge:profile.length||null },
  ]

  // ── Loading / Auth gates ─────────────────────────────────────────
  if (loading) return (
    <div style={{ minHeight:'100vh', background:'#080a0f', display:'flex', alignItems:'center', justifyContent:'center' }}>
      <Loader2 size={28} color="#34d399" style={{ animation:'spin 1s linear infinite' }}/>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )

  if (!user) return <Auth onAuth={setUser}/>

  // ── Main render ──────────────────────────────────────────────────
  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100vh', background:'#080a0f', color:'#c9d1e0', fontFamily:"-apple-system,'Inter',sans-serif", overflow:'hidden', position:'relative' }}>
      <style>{`
        *{box-sizing:border-box;margin:0;padding:0}
        ::-webkit-scrollbar{width:3px} ::-webkit-scrollbar-thumb{background:#1e2535;border-radius:4px}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes pulse{0%,100%{opacity:.4;transform:scale(.85)}50%{opacity:1;transform:scale(1)}}
        @keyframes fadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
        .msg-in{animation:fadeIn .25s ease forwards}
        input::placeholder{color:#2a3040}
      `}</style>

      {/* Grid background */}
      <div style={{ position:'absolute', inset:0, pointerEvents:'none', backgroundImage:'linear-gradient(rgba(238,242,255,0.028) 1px,transparent 1px),linear-gradient(90deg,rgba(238,242,255,0.028) 1px,transparent 1px)', backgroundSize:'44px 44px', maskImage:'linear-gradient(to bottom,black,transparent 90%)', WebkitMaskImage:'linear-gradient(to bottom,black,transparent 90%)' }}/>

      {/* Header */}
      <header style={{ ...glass, position:'relative', zIndex:10, display:'flex', alignItems:'center', gap:12, padding:'12px 18px', borderLeft:'none', borderRight:'none', borderTop:'none', flexShrink:0 }}>
        <div style={{ width:36, height:36, borderRadius:9, background:'linear-gradient(135deg,rgba(124,58,237,0.5),rgba(79,70,229,0.5))', border:'1px solid rgba(124,58,237,0.4)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:17, flexShrink:0 }}>🧠</div>
        <div>
          <div style={{ fontFamily:'monospace', fontSize:10, letterSpacing:'0.2em', textTransform:'uppercase', color:'rgba(167,139,250,0.7)', marginBottom:1 }}>Second Brain</div>
          <div style={{ fontSize:14, fontWeight:600, color:'#e2e8f0' }}>Personal AI</div>
        </div>
        <div style={{ marginLeft:'auto', display:'flex', gap:12, alignItems:'center' }}>
          <div style={{ display:'flex', alignItems:'center', gap:6, padding:'4px 10px', background:'rgba(52,211,153,0.08)', border:'1px solid rgba(52,211,153,0.2)', borderRadius:20 }}>
            <span style={{ width:6, height:6, borderRadius:'50%', background:'#34d399', boxShadow:'0 0 6px #34d399' }}/>
            <span style={{ fontSize:10, fontFamily:'monospace', color:'#34d399', letterSpacing:'0.05em' }}>
              {user.email?.split('@')[0]}
            </span>
          </div>
          <button onClick={signOut} title="Sign out"
            style={{ background:'none', border:'none', cursor:'pointer', color:'#2a3a50', display:'flex', alignItems:'center', padding:4, borderRadius:8, transition:'color .15s' }}
            onMouseEnter={e => e.currentTarget.style.color='#f87171'}
            onMouseLeave={e => e.currentTarget.style.color='#2a3a50'}>
            <LogOut size={15}/>
          </button>
        </div>
      </header>

      {/* Content */}
      <div style={{ flex:1, overflow:'hidden', display:'flex', flexDirection:'column', position:'relative', zIndex:1 }}>

        {/* ── CHAT ── */}
        {tab === 'chat' && (
          <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }}>
            <div style={{ flex:1, overflowY:'auto', padding:'20px 16px', display:'flex', flexDirection:'column', gap:12 }}>
              {msgs.length === 0 && (
                <div style={{ textAlign:'center', marginTop:48, display:'flex', flexDirection:'column', alignItems:'center' }}>
                  <div style={{ width:64, height:64, borderRadius:16, background:'linear-gradient(135deg,rgba(124,58,237,0.3),rgba(79,70,229,0.3))', border:'1px solid rgba(124,58,237,0.3)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:28, marginBottom:18 }}>🧠</div>
                  <div style={{ fontSize:18, fontWeight:700, color:'#e2e8f0', letterSpacing:-0.5, marginBottom:8 }}>Awaiting first instruction</div>
                  <p style={{ fontSize:13, color:'#3a4a60', lineHeight:1.7, maxWidth:300, marginBottom:24 }}>Tell me what's on your mind. I'll build your tasks, notes, and journal automatically.</p>
                  <div style={{ display:'flex', flexWrap:'wrap', gap:8, justifyContent:'center', maxWidth:400 }}>
                    {STARTERS.map(s => (
                      <button key={s} onClick={() => setInput(s)}
                        style={{ fontSize:12, padding:'7px 14px', borderRadius:20, background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.08)', color:'#8899aa', cursor:'pointer' }}
                        onMouseEnter={e => { e.target.style.borderColor='rgba(34,211,238,0.35)'; e.target.style.color='#e2e8f0' }}
                        onMouseLeave={e => { e.target.style.borderColor='rgba(255,255,255,0.08)'; e.target.style.color='#8899aa' }}
                      >{s}</button>
                    ))}
                  </div>
                </div>
              )}

              {msgs.map(m => (
                <div key={m.id} className="msg-in" style={{ display:'flex', justifyContent:m.role==='user'?'flex-end':'flex-start', gap:10, alignItems:'flex-end' }}>
                  {m.role === 'assistant' && (
                    <div style={{ width:30, height:30, borderRadius:8, background:'linear-gradient(135deg,rgba(124,58,237,0.4),rgba(79,70,229,0.4))', border:'1px solid rgba(124,58,237,0.3)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:14, flexShrink:0 }}>🧠</div>
                  )}
                  <div style={{ maxWidth:'78%', padding:'11px 14px', borderRadius:m.role==='user'?'14px 14px 4px 14px':'14px 14px 14px 4px', background:m.role==='user'?'linear-gradient(135deg,rgba(124,58,237,0.35),rgba(79,70,229,0.35))':'rgba(255,255,255,0.04)', border:m.role==='user'?'1px solid rgba(124,58,237,0.3)':'1px solid rgba(255,255,255,0.07)', fontSize:13.5, lineHeight:1.7, color:m.role==='user'?'#dde8ff':'#b8c4d8' }}>
                    {m.content}
                    {m.actions?.length > 0 && (
                      <div style={{ marginTop:10, paddingTop:10, borderTop:'1px solid rgba(255,255,255,0.06)', display:'flex', flexWrap:'wrap', gap:5 }}>
                        {m.actions.map((a, i) => { const ch = actionChip(a); return (
                          <span key={i} style={{ fontSize:10, padding:'3px 9px', borderRadius:20, background:'rgba(0,0,0,0.25)', border:`1px solid ${ch.color}30`, color:ch.color, fontFamily:'monospace' }}>
                            {ch.icon} {ch.label}
                          </span>
                        )})}
                      </div>
                    )}
                  </div>
                  {m.role === 'user' && (
                    <div style={{ width:30, height:30, borderRadius:8, background:'rgba(34,211,238,0.12)', border:'1px solid rgba(34,211,238,0.25)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontFamily:'monospace', fontWeight:700, flexShrink:0, color:'#22d3ee' }}>
                      {user.email?.[0].toUpperCase()}
                    </div>
                  )}
                </div>
              ))}

              {sending && (
                <div style={{ display:'flex', gap:10, alignItems:'flex-end' }}>
                  <div style={{ width:30, height:30, borderRadius:8, background:'linear-gradient(135deg,rgba(124,58,237,0.4),rgba(79,70,229,0.4))', border:'1px solid rgba(124,58,237,0.3)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:14 }}>🧠</div>
                  <div style={{ padding:'11px 14px', borderRadius:'14px 14px 14px 4px', background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.07)', display:'flex', gap:5, alignItems:'center' }}>
                    {[0,1,2].map(i => <span key={i} style={{ width:6, height:6, borderRadius:'50%', background:'#3a4a70', display:'inline-block', animation:'pulse 1.4s ease infinite', animationDelay:`${i*0.18}s` }}/>)}
                  </div>
                </div>
              )}
              <div ref={endRef}/>
            </div>

            {/* Input bar */}
            <div style={{ ...glass, borderLeft:'none', borderRight:'none', borderBottom:'none', padding:'12px 14px', display:'flex', gap:8, flexShrink:0 }}>
              <input value={input} onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key==='Enter' && !e.shiftKey && send()}
                placeholder="Describe the task, idea, or how you're feeling..."
                style={{ flex:1, background:'rgba(13,17,27,0.8)', border:'1px solid rgba(255,255,255,0.08)', borderRadius:10, padding:'11px 14px', color:'#c9d1e0', fontSize:13.5, outline:'none' }}
                onFocus={e => e.target.style.borderColor='rgba(34,211,238,0.35)'}
                onBlur={e  => e.target.style.borderColor='rgba(255,255,255,0.08)'}
              />
              <button onClick={send} disabled={sending || !input.trim()}
                style={{ width:44, height:44, borderRadius:10, background:input.trim()?'linear-gradient(135deg,rgba(52,211,153,0.8),rgba(16,185,129,0.8))':'rgba(255,255,255,0.04)', border:input.trim()?'1px solid rgba(52,211,153,0.4)':'1px solid rgba(255,255,255,0.07)', color:input.trim()?'#001a10':'#2a3a4a', cursor:input.trim()?'pointer':'default', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                <Send size={15}/>
              </button>
            </div>
          </div>
        )}

        {/* ── TASKS ── */}
        {tab === 'tasks' && (
          <div style={{ flex:1, overflowY:'auto', padding:'18px 16px' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
              <div>
                <div style={{ fontFamily:'monospace', fontSize:10, letterSpacing:'0.2em', textTransform:'uppercase', color:'rgba(52,211,153,0.6)', marginBottom:3 }}>Task Queue</div>
                <div style={{ fontSize:16, fontWeight:700, color:'#e2e8f0' }}>Active Tasks</div>
              </div>
              <span style={{ padding:'4px 12px', borderRadius:20, background:'rgba(52,211,153,0.08)', border:'1px solid rgba(52,211,153,0.2)', fontSize:11, fontFamily:'monospace', color:'#34d399' }}>{activeTasks.length} active</span>
            </div>
            {activeTasks.length === 0 && (
              <div style={{ textAlign:'center', padding:'60px 20px', color:'#2a3a50', fontSize:13 }}>
                <CheckCircle2 size={32} style={{ margin:'0 auto 12px', opacity:.2 }}/>
                No tasks yet — tell your AI what you need to get done.
              </div>
            )}
            {activeTasks.map(t => {
              const pm = priorityMeta(t.priority)
              return (
                <div key={t.id} style={{ ...card, display:'flex', alignItems:'center', gap:12 }}
                  onMouseEnter={e => e.currentTarget.style.borderColor='rgba(255,255,255,0.12)'}
                  onMouseLeave={e => e.currentTarget.style.borderColor='rgba(255,255,255,0.07)'}>
                  <button onClick={() => completeTask(t.id)}
                    style={{ width:20, height:20, borderRadius:6, border:'1.5px solid rgba(255,255,255,0.15)', background:'transparent', cursor:'pointer', flexShrink:0 }}
                    onMouseEnter={e => { e.target.style.borderColor='#34d399'; e.target.style.background='rgba(52,211,153,0.1)' }}
                    onMouseLeave={e => { e.target.style.borderColor='rgba(255,255,255,0.15)'; e.target.style.background='transparent' }}
                  />
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:13.5, color:'#c9d1e0', marginBottom:t.reason?2:0 }}>{t.title}</div>
                    {t.reason && <div style={{ fontSize:11, color:'#3a4a60', lineHeight:1.4 }}>{t.reason}</div>}
                  </div>
                  <span style={{ fontSize:10, padding:'3px 9px', borderRadius:20, background:pm.bg, border:`1px solid ${pm.border}`, color:pm.color, fontFamily:'monospace', whiteSpace:'nowrap', flexShrink:0 }}>{pm.label}</span>
                  <div style={{ display:'flex', flexDirection:'column', gap:1 }}>
                    <button onClick={() => changePriority(t.id,  1)} style={{ background:'none', border:'none', cursor:'pointer', color:'#2a3a50', padding:'1px 3px' }} onMouseEnter={e=>e.target.style.color='#c9d1e0'} onMouseLeave={e=>e.target.style.color='#2a3a50'}><ChevronUp size={13}/></button>
                    <button onClick={() => changePriority(t.id, -1)} style={{ background:'none', border:'none', cursor:'pointer', color:'#2a3a50', padding:'1px 3px' }} onMouseEnter={e=>e.target.style.color='#c9d1e0'} onMouseLeave={e=>e.target.style.color='#2a3a50'}><ChevronDown size={13}/></button>
                  </div>
                </div>
              )
            })}
            {doneTasks.length > 0 && <>
              <div style={{ fontSize:10, fontFamily:'monospace', letterSpacing:'0.18em', textTransform:'uppercase', color:'#1e2a38', margin:'20px 0 10px' }}>Completed</div>
              {doneTasks.map(t => (
                <div key={t.id} style={{ ...card, display:'flex', alignItems:'center', gap:11, opacity:.35 }}>
                  <CheckCircle2 size={16} color="#34d399" style={{ flexShrink:0 }}/>
                  <div style={{ flex:1, fontSize:13, textDecoration:'line-through', color:'#3a4a60' }}>{t.title}</div>
                  <button onClick={() => deleteTask(t.id)} style={{ background:'none', border:'none', cursor:'pointer', color:'#2a3040' }} onMouseEnter={e=>e.target.style.color='#f87171'} onMouseLeave={e=>e.target.style.color='#2a3040'}><Trash2 size={13}/></button>
                </div>
              ))}
            </>}
          </div>
        )}

        {/* ── NOTES ── */}
        {tab === 'notes' && (
          <div style={{ flex:1, overflowY:'auto', padding:'18px 16px' }}>
            <div style={{ marginBottom:16 }}>
              <div style={{ fontFamily:'monospace', fontSize:10, letterSpacing:'0.2em', textTransform:'uppercase', color:'rgba(167,139,250,0.6)', marginBottom:3 }}>Knowledge Base</div>
              <div style={{ fontSize:16, fontWeight:700, color:'#e2e8f0' }}>Notes</div>
            </div>
            {notes.length === 0 && (
              <div style={{ textAlign:'center', padding:'60px 20px', color:'#2a3a50', fontSize:13 }}>
                <FileText size={32} style={{ margin:'0 auto 12px', opacity:.2 }}/>
                Say "make a note about..." in chat.
              </div>
            )}
            {notes.slice().reverse().map(n => (
              <div key={n.id} style={{ ...card }}
                onMouseEnter={e => e.currentTarget.style.borderColor='rgba(255,255,255,0.12)'}
                onMouseLeave={e => e.currentTarget.style.borderColor='rgba(255,255,255,0.07)'}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:8 }}>
                  <div style={{ fontWeight:600, fontSize:13.5, color:'#d4dce8', flex:1, paddingRight:8 }}>{n.title}</div>
                  <button onClick={() => deleteNote(n.id)} style={{ background:'none', border:'none', cursor:'pointer', color:'#2a3040' }} onMouseEnter={e=>e.target.style.color='#f87171'} onMouseLeave={e=>e.target.style.color='#2a3040'}><Trash2 size={13}/></button>
                </div>
                <div style={{ fontSize:12.5, color:'#4a5a70', lineHeight:1.7, ...(expanded[n.id]?{}:{display:'-webkit-box',WebkitLineClamp:3,WebkitBoxOrient:'vertical',overflow:'hidden'}) }}>
                  {n.content}
                </div>
                {n.content.length > 160 && (
                  <button onClick={() => toggleExp(n.id)} style={{ fontSize:11, color:'rgba(167,139,250,0.7)', background:'none', border:'none', cursor:'pointer', padding:'6px 0 0', fontFamily:'monospace' }}>
                    {expanded[n.id] ? '↑ less' : '↓ more'}
                  </button>
                )}
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:8 }}>
                  <div style={{ display:'flex', gap:5, flexWrap:'wrap' }}>
                    {n.tags?.map(tag => <span key={tag} style={{ fontSize:10, padding:'2px 8px', borderRadius:20, background:'rgba(167,139,250,0.08)', border:'1px solid rgba(167,139,250,0.2)', color:'rgba(167,139,250,0.7)', fontFamily:'monospace' }}>#{tag}</span>)}
                  </div>
                  <span style={{ fontSize:10, color:'#1e2a38', fontFamily:'monospace' }}>{new Date(n.created_at).toLocaleDateString()}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── JOURNAL ── */}
        {tab === 'journal' && (
          <div style={{ flex:1, overflowY:'auto', padding:'18px 16px' }}>
            <div style={{ marginBottom:16 }}>
              <div style={{ fontFamily:'monospace', fontSize:10, letterSpacing:'0.2em', textTransform:'uppercase', color:'rgba(34,211,238,0.6)', marginBottom:3 }}>Personal Log</div>
              <div style={{ fontSize:16, fontWeight:700, color:'#e2e8f0' }}>Journal</div>
            </div>
            {journal.length === 0 && (
              <div style={{ textAlign:'center', padding:'60px 20px', color:'#2a3a50', fontSize:13 }}>
                <BookOpen size={32} style={{ margin:'0 auto 12px', opacity:.2 }}/>
                Share your thoughts or feelings in chat.
              </div>
            )}
            {journal.slice().reverse().map(e => (
              <div key={e.id} style={{ ...card, borderLeft:'2px solid rgba(34,211,238,0.25)', borderRadius:'0 10px 10px 0' }}
                onMouseEnter={ev => ev.currentTarget.style.borderLeftColor='rgba(34,211,238,0.5)'}
                onMouseLeave={ev => ev.currentTarget.style.borderLeftColor='rgba(34,211,238,0.25)'}>
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6 }}>
                  <div>
                    <div style={{ fontWeight:600, fontSize:13.5, color:'#d4dce8' }}>{e.title}</div>
                    <div style={{ fontSize:10, fontFamily:'monospace', color:'#2a3a50', marginTop:2 }}>{e.entry_date}</div>
                  </div>
                  <button onClick={() => deleteJournal(e.id)} style={{ background:'none', border:'none', cursor:'pointer', color:'#2a3040' }} onMouseEnter={ev=>ev.target.style.color='#f87171'} onMouseLeave={ev=>ev.target.style.color='#2a3040'}><Trash2 size={13}/></button>
                </div>
                <div style={{ fontSize:12.5, color:'#4a5a70', lineHeight:1.75, ...(expanded[e.id]?{}:{display:'-webkit-box',WebkitLineClamp:4,WebkitBoxOrient:'vertical',overflow:'hidden'}) }}>
                  {e.content}
                </div>
                {e.content.length > 200 && (
                  <button onClick={() => toggleExp(e.id)} style={{ fontSize:11, color:'rgba(34,211,238,0.6)', background:'none', border:'none', cursor:'pointer', padding:'6px 0 0', fontFamily:'monospace' }}>
                    {expanded[e.id] ? '↑ less' : '↓ more'}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {/* ── PROFILE ── */}
        {tab === 'profile' && (
          <div style={{ flex:1, overflowY:'auto', padding:'18px 16px' }}>
            <div style={{ marginBottom:16 }}>
              <div style={{ fontFamily:'monospace', fontSize:10, letterSpacing:'0.2em', textTransform:'uppercase', color:'rgba(251,146,60,0.6)', marginBottom:3 }}>AI Memory</div>
              <div style={{ fontSize:16, fontWeight:700, color:'#e2e8f0' }}>Your Profile</div>
              <div style={{ fontSize:12, color:'#2a3a50', marginTop:2 }}>Built silently from every conversation</div>
            </div>
            {profile.length === 0 && (
              <div style={{ textAlign:'center', padding:'60px 20px', color:'#2a3a50', fontSize:13 }}>
                <Brain size={32} style={{ margin:'0 auto 12px', opacity:.2 }}/>
                Start chatting — your AI builds your profile automatically.
              </div>
            )}
            {profile.map(t => (
              <div key={t.id} style={{ ...card, display:'flex', gap:12, alignItems:'flex-start' }}
                onMouseEnter={e => e.currentTarget.style.borderColor='rgba(255,255,255,0.12)'}
                onMouseLeave={e => e.currentTarget.style.borderColor='rgba(255,255,255,0.07)'}>
                <div style={{ width:6, height:6, borderRadius:'50%', background:'linear-gradient(135deg,#f97316,#a855f7)', marginTop:6, flexShrink:0 }}/>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:10, fontFamily:'monospace', letterSpacing:'0.15em', textTransform:'uppercase', color:'rgba(251,146,60,0.65)', marginBottom:3 }}>{t.trait}</div>
                  <div style={{ fontSize:13, color:'#8899aa', lineHeight:1.55 }}>{t.value}</div>
                </div>
                <button onClick={() => deleteProfileTrait(t.id)} style={{ background:'none', border:'none', cursor:'pointer', color:'#1e2a38' }} onMouseEnter={e=>e.target.style.color='#f87171'} onMouseLeave={e=>e.target.style.color='#1e2a38'}><Trash2 size={13}/></button>
              </div>
            ))}
            {profile.length > 0 && (
              <div style={{ marginTop:12, padding:'12px 14px', background:'rgba(251,146,60,0.05)', border:'1px solid rgba(251,146,60,0.12)', borderRadius:10, fontSize:12, color:'rgba(251,146,60,0.6)', lineHeight:1.65, fontFamily:'monospace' }}>
                ◎ This profile shapes how your AI prioritizes tasks and responds. It deepens with every conversation.
              </div>
            )}
          </div>
        )}
      </div>

      {/* Bottom Nav */}
      <nav style={{ ...glass, borderLeft:'none', borderRight:'none', borderBottom:'none', display:'flex', flexShrink:0, zIndex:10 }}>
        {TABS.map(({ id, Icon, label, badge }) => (
          <button key={id} onClick={() => setTab(id)}
            style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:4, background:'none', border:'none', cursor:'pointer', padding:'9px 0 11px', color:tab===id?'#34d399':'#2a3a50', transition:'color .15s', position:'relative' }}>
            <div style={{ position:'relative' }}>
              <Icon size={19} strokeWidth={tab===id?2:1.5}/>
              {badge > 0 && <div style={{ position:'absolute', top:-5, right:-7, width:15, height:15, borderRadius:'50%', background:'rgba(52,211,153,0.9)', fontSize:8, fontWeight:700, display:'flex', alignItems:'center', justifyContent:'center', color:'#001a10', fontFamily:'monospace' }}>{badge}</div>}
            </div>
            <span style={{ fontSize:9, fontFamily:'monospace', letterSpacing:'0.1em', textTransform:'uppercase', fontWeight:tab===id?700:400 }}>{label}</span>
            {tab===id && <div style={{ position:'absolute', top:0, left:'20%', right:'20%', height:'1.5px', background:'linear-gradient(90deg,transparent,#34d399,transparent)', borderRadius:2 }}/>}
          </button>
        ))}
      </nav>
    </div>
  )
}