// ─────────────────────────────────────────────────────────────────
// DATA ACCESS LAYER
// All DB operations live here. Components never import Supabase.
// To migrate to Django later: replace internals, keep the interface.
// ─────────────────────────────────────────────────────────────────
import { supabase } from './supabase'

const handle = async (promise) => {
  const { data, error } = await promise
  if (error) throw error
  return data
}

export const api = {

  auth: {
    // Added phone and name parameters, passed into options.data
    signUp: (email, password, phone, name) =>
      handle(supabase.auth.signUp({ 
        email, 
        password,
        options: {
          data: {
            phone: phone,
            name: name
          }
        }
      })),
    signIn: (email, password) =>
      handle(supabase.auth.signInWithPassword({ email, password })),
    signOut: () =>
      handle(supabase.auth.signOut()),
    getSession: () =>
      supabase.auth.getSession(),
    onAuthChange: (cb) =>
      supabase.auth.onAuthStateChange(cb),
  },

  messages: {
    getAll:  (userId) =>
      handle(supabase.from('messages').select('*').eq('user_id', userId).order('created_at')),
    create:  (userId, msg) =>
      handle(supabase.from('messages').insert({ user_id: userId, ...msg }).select().single()),
    clearAll:(userId) =>
      handle(supabase.from('messages').delete().eq('user_id', userId)),
  },

  tasks: {
    getAll:  (userId) =>
      handle(supabase.from('tasks').select('*').eq('user_id', userId).order('created_at')),
    create:  (userId, task) =>
      handle(supabase.from('tasks').insert({ user_id: userId, ...task }).select().single()),
    update:  (id, updates) =>
      handle(supabase.from('tasks').update(updates).eq('id', id)),
    delete:  (id) =>
      handle(supabase.from('tasks').delete().eq('id', id)),
  },

  notes: {
    getAll:  (userId) =>
      handle(supabase.from('notes').select('*').eq('user_id', userId).order('created_at')),
    create:  (userId, note) =>
      handle(supabase.from('notes').insert({ user_id: userId, ...note }).select().single()),
    delete:  (id) =>
      handle(supabase.from('notes').delete().eq('id', id)),
  },

  journal: {
    getAll:  (userId) =>
      handle(supabase.from('journal_entries').select('*').eq('user_id', userId).order('created_at')),
    create:  (userId, entry) =>
      handle(supabase.from('journal_entries').insert({ user_id: userId, ...entry }).select().single()),
    delete:  (id) =>
      handle(supabase.from('journal_entries').delete().eq('id', id)),
  },

  profile: {
    getAll:  (userId) =>
      handle(supabase.from('profile_traits').select('*').eq('user_id', userId).order('created_at')),
    upsert:  (userId, trait, value) =>
      handle(
        supabase.from('profile_traits')
          .upsert({ user_id: userId, trait, value }, { onConflict: 'user_id,trait' })
          .select().single()
      ),
    delete:  (id) =>
      handle(supabase.from('profile_traits').delete().eq('id', id)),
  },
}