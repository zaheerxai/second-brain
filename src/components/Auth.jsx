import { useState } from 'react'
import { Brain, Mail, Lock, Loader2, AlertCircle, Eye, EyeOff, User, Phone } from 'lucide-react' // Added User & Phone icons
import { api } from '../services/api'

export default function Auth({ onAuth }) {
  const [mode, setMode]       = useState('signin')   // 'signin' | 'signup'
  const [email, setEmail]     = useState('')
  const [password, setPass]   = useState('')
  const [name, setName]       = useState('')         // NEW: Name state
  const [phone, setPhone]     = useState('')         // NEW: Phone state
  const [showPass, setShow]   = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')
  const [info, setInfo]       = useState('')

  const submit = async (e) => {
    e.preventDefault()
    
    // Updated validation to require name and phone during signup
    if (!email || !password) return
    if (mode === 'signup' && (!name || !phone)) {
      setError('Please fill in all fields.')
      return
    }
    
    setError(''); setInfo(''); setLoading(true)

    try {
      if (mode === 'signup') {
        // NEW: Passing phone and name to your updated api.js function
        await api.auth.signUp(email, password, phone, name)
        setInfo('Check your email for a confirmation link, then sign in.')
        setMode('signin')
      } else {
        const result = await api.auth.signIn(email, password)
        onAuth(result.user ?? result.session?.user)
      }
    } catch (err) {
      setError(err.message || 'Something went wrong.')
    } finally {
      setLoading(false)
    }
  }

  const field = (icon, type, val, set, placeholder, rightSlot) => (
    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
      <span style={{ position: 'absolute', left: 13, color: '#2a3a50', display: 'flex' }}>{icon}</span>
      <input
        type={type} value={val} onChange={e => set(e.target.value)}
        placeholder={placeholder} autoComplete="off"
        style={{
          width: '100%', background: 'rgba(13,17,27,0.8)',
          border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10,
          padding: '11px 40px 11px 38px', color: '#c9d1e0', fontSize: 13.5, outline: 'none',
        }}
        onFocus={e  => e.target.style.borderColor = 'rgba(34,211,238,0.35)'}
        onBlur={e   => e.target.style.borderColor = 'rgba(255,255,255,0.08)'}
      />
      {rightSlot && (
        <button type="button" onClick={() => setShow(s => !s)}
          style={{ position: 'absolute', right: 12, background: 'none', border: 'none', cursor: 'pointer', color: '#2a3a50', display: 'flex' }}>
          {rightSlot}
        </button>
      )}
    </div>
  )

  // Disable logic updated to account for the new fields
  const isSubmitDisabled = loading || !email || !password || (mode === 'signup' && (!name || !phone));

  return (
    <div style={{
      minHeight: '100vh', background: '#080a0f', display: 'flex', alignItems: 'center',
      justifyContent: 'center', fontFamily: "-apple-system,'Inter',sans-serif", padding: 20, position: 'relative',
    }}>
      {/* Grid bg */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        backgroundImage: 'linear-gradient(rgba(238,242,255,0.028) 1px,transparent 1px),linear-gradient(90deg,rgba(238,242,255,0.028) 1px,transparent 1px)',
        backgroundSize: '44px 44px',
        maskImage: 'linear-gradient(to bottom,black,transparent 90%)',
        WebkitMaskImage: 'linear-gradient(to bottom,black,transparent 90%)',
      }} />

      <div style={{
        width: '100%', maxWidth: 400, position: 'relative',
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.07)',
        backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
        borderRadius: 16, padding: 32,
      }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{
            width: 52, height: 52, borderRadius: 14, margin: '0 auto 14px',
            background: 'linear-gradient(135deg,rgba(124,58,237,0.4),rgba(79,70,229,0.4))',
            border: '1px solid rgba(124,58,237,0.35)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', 
            fontSize: 24,
          }}>
            {/* Replace the 🧠 emoji with the Brain component */}
            <Brain size={28} color="#a78bfa" /> 
          </div>
          <div style={{ fontFamily: 'monospace', fontSize: 10, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(167,139,250,0.6)', marginBottom: 4 }}>Second Brain</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#e2e8f0', letterSpacing: -0.5 }}>
            {mode === 'signin' ? 'Welcome back' : 'Create account'}
          </div>
          <div style={{ fontSize: 12, color: '#2a3a50', marginTop: 4 }}>
            {mode === 'signin' ? 'Sign in to your personal AI' : 'Start building your Second Brain'}
          </div>
        </div>

        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          
          {/* NEW: Conditional Fields for Signup */}
          {mode === 'signup' && (
            <>
              {field(<User size={14}/>, 'text', name, setName, 'Full Name')}
              {field(<Phone size={14}/>, 'tel', phone, setPhone, 'WhatsApp No. (e.g. 923...)')}
            </>
          )}

          {field(<Mail size={14}/>, 'email',    email,    setEmail, 'Email address')}
          {field(<Lock size={14}/>, showPass ? 'text' : 'password', password, setPass,  'Password',
            showPass ? <EyeOff size={14}/> : <Eye size={14}/>
          )}

          {error && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '10px 12px', background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.2)', borderRadius: 8, fontSize: 12, color: '#fca5a5' }}>
              <AlertCircle size={13} style={{ flexShrink: 0, marginTop: 1 }}/>
              {error}
            </div>
          )}
          {info && (
            <div style={{ padding: '10px 12px', background: 'rgba(52,211,153,0.08)', border: '1px solid rgba(52,211,153,0.2)', borderRadius: 8, fontSize: 12, color: '#6ee7b7' }}>
              {info}
            </div>
          )}

          <button type="submit" disabled={isSubmitDisabled}
            style={{
              marginTop: 4, padding: '12px', borderRadius: 10, fontSize: 13.5, fontWeight: 600, cursor: 'pointer',
              background: isSubmitDisabled ? 'rgba(255,255,255,0.04)' : 'linear-gradient(135deg,rgba(52,211,153,0.85),rgba(16,185,129,0.85))',
              border: isSubmitDisabled ? '1px solid rgba(255,255,255,0.07)' : '1px solid rgba(52,211,153,0.4)',
              color: isSubmitDisabled ? '#2a3a50' : '#001a10',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, transition: 'all .2s',
            }}>
            {loading ? <><Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }}/> Processing…</> : mode === 'signin' ? 'Sign In' : 'Create Account'}
          </button>
        </form>

        {/* Toggle */}
        <div style={{ marginTop: 20, textAlign: 'center', fontSize: 12, color: '#2a3a50' }}>
          {mode === 'signin' ? "Don't have an account? " : 'Already have an account? '}
          <button onClick={() => { setMode(m => m === 'signin' ? 'signup' : 'signin'); setError(''); setInfo(''); }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(34,211,238,0.7)', fontFamily: 'monospace', fontSize: 11 }}>
            {mode === 'signin' ? 'Sign up' : 'Sign in'}
          </button>
        </div>

        <style>{`@keyframes spin{to{transform:rotate(360deg)}} input::placeholder{color:#2a3040} *{box-sizing:border-box}`}</style>
      </div>
    </div>
  )
}