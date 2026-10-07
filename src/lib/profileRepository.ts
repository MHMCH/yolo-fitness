import type { Profile } from '../types/database'
import { supabase } from './supabase'

function client() {
  if (!supabase) throw new Error('Supabase is not configured.')
  return supabase
}

export async function loadProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await client().from('profiles').select('*').eq('user_id', userId).maybeSingle()
  if (error) throw error
  return data
}

export async function saveProfile(userId: string, patch: { display_name?: string | null; last_year_count?: number | null }): Promise<Profile> {
  const { data, error } = await client().from('profiles').update(patch).eq('user_id', userId).select('*').single()
  if (error) throw error
  return data
}
