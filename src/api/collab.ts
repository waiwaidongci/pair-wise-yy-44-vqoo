import axios from 'axios'
import type { Cue } from '../stores/workshop'

export type SubmitResult =
  | { ok: true; cue: Cue }
  | { ok: false; conflict: true; currentVersion: number; serverCue: Cue }

/**
 * 提交单条提示（乐观并发 / 先到先收）。
 * 服务器以 expectedVersion 作为判断依据：版本不一致返回 409，
 * 客户端保留现场并提示重新取版，不覆盖本地。
 */
export async function submitCueToServer(cue: Cue, expectedVersion: number): Promise<SubmitResult> {
  try {
    const { data } = await axios.post(`/api/cues/${cue.id}/submit`, { cue, expectedVersion })
    return { ok: true, cue: data.cue as Cue }
  } catch (error) {
    const status = (error as { response?: { status?: number } })?.response?.status
    if (status === 409) {
      const data = (error as { response?: { data?: { currentVersion: number; serverCue: Cue } } }).response?.data
      return {
        ok: false,
        conflict: true,
        currentVersion: data?.currentVersion ?? expectedVersion,
        serverCue: data?.serverCue ?? cue,
      }
    }
    throw error
  }
}

/** 重新取版：拉取服务器当前版本 */
export async function fetchCueFromServer(id: string): Promise<Cue> {
  const { data } = await axios.get(`/api/cues/${id}`)
  return data as Cue
}

/** 演示用：模拟另一位协作者抢先提交，推高服务器版本 */
export async function bumpCueOnServer(id: string): Promise<Cue> {
  const { data } = await axios.post(`/api/cues/${id}/bump`)
  return data.cue as Cue
}

/** 全量同步：失败时由调用方从最后确认点重试 */
export async function syncAllToServer(cues: Cue[], baseRevision: number): Promise<{ revision: number; syncedAt: string }> {
  const { data } = await axios.post('/api/sync', { cues, baseRevision })
  return data as { revision: number; syncedAt: string }
}
