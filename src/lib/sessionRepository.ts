import type { Summary, TrainingSession } from '../types/database'
import { supabase } from './supabase'

export type InsertRequest = { id: string; trained_on?: string }
export interface SessionRepository {
  summary(): Promise<Summary>
  history(offset: number): Promise<TrainingSession[]>
  find(id: string): Promise<TrainingSession | null>
  insert(request: InsertRequest): Promise<void>
  remove(id: string): Promise<void>
}

function client() {
  if (!supabase) throw new Error('Supabase is not configured.')
  return supabase
}

export const sessionRepository: SessionRepository = {
  async summary() {
    const { data, error } = await client().rpc('training_summary')
    if (error) throw error
    if (!data?.[0]) throw new Error('Training summary unavailable.')
    return data[0]
  },
  async history(offset) {
    const { data, error } = await client().from('training_sessions').select('*')
      .order('trained_on', { ascending: false }).order('created_at', { ascending: false })
      .order('id', { ascending: false }).range(offset, offset + 19)
    if (error) throw error
    return data
  },
  async find(id) {
    const { data, error } = await client().from('training_sessions').select('*').eq('id', id).maybeSingle()
    if (error) throw error
    return data
  },
  async insert(request) {
    const { error } = await client().from('training_sessions').insert(request)
    if (error) throw error
  },
  async remove(id) {
    const { error } = await client().from('training_sessions').delete().eq('id', id).select('id')
    if (error) throw error
  },
}

export async function commitSession(repository: SessionRepository, request: InsertRequest): Promise<void> {
  if (await repository.find(request.id)) return
  try {
    await repository.insert(request)
  } catch (error) {
    if (await repository.find(request.id)) return
    throw error
  }
}