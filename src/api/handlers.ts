import { http, HttpResponse } from 'msw'
import { seedCues, seedMovers, seedProject, type Cue } from '../stores/workshop'

function withCueDefaults(cue: Partial<Cue>): Cue {
  return {
    id: cue.id ?? '',
    act: cue.act ?? '第一幕',
    scene: cue.scene ?? '新场景',
    time: cue.time ?? '00:00:00',
    title: cue.title ?? '新执行提示',
    department: cue.department ?? '舞台',
    owner: cue.owner ?? '待指派',
    duration: cue.duration ?? 30,
    entry: cue.entry ?? { x: 10, y: 50 },
    exit: cue.exit ?? { x: 90, y: 50 },
    route: cue.route ?? [{ x: 10, y: 50 }, { x: 90, y: 50 }],
    note: cue.note ?? '',
    status: cue.status ?? '草稿',
    comments: cue.comments ?? [],
    version: cue.version ?? 1,
    basis: cue.basis ?? null,
    dirty: cue.dirty ?? false,
    affectedBy: cue.affectedBy ?? [],
    reviewReason: cue.reviewReason ?? '',
  }
}

let cues: Cue[] = structuredClone(seedCues).map(withCueDefaults)
let serverRevision = 12

export const handlers = [
  http.get('/api/project', () => HttpResponse.json(seedProject)),

  http.get('/api/cues', () =>
    HttpResponse.json(
      cues.map((cue) => ({
        ...cue,
        conflict: cue.id === 'C-06' ? '此提示与道具运输时间重叠 4 分钟' : '',
      })),
    ),
  ),

  http.get('/api/cues/:id', ({ params }) => {
    const cue = cues.find((item) => item.id === params.id)
    if (!cue) return new HttpResponse(null, { status: 404 })
    return HttpResponse.json(cue)
  }),

  http.post('/api/cues/:id/submit', async ({ params, request }) => {
    const body = (await request.json()) as { cue: Cue; expectedVersion: number }
    const serverCue = cues.find((item) => item.id === params.id)
    if (!serverCue) return new HttpResponse(null, { status: 404 })
    // 乐观并发：只收先到版本，后到版本返回 409，由客户端保留现场并提示重新取版
    if (serverCue.version !== body.expectedVersion) {
      return HttpResponse.json(
        { conflict: true, currentVersion: serverCue.version, serverCue },
        { status: 409 },
      )
    }
    const updated = withCueDefaults({ ...body.cue, version: serverCue.version + 1 })
    cues = cues.map((item) => (item.id === params.id ? updated : item))
    return HttpResponse.json({ cue: updated })
  }),

  http.post('/api/cues/:id/bump', ({ params }) => {
    const serverCue = cues.find((item) => item.id === params.id)
    if (!serverCue) return new HttpResponse(null, { status: 404 })
    serverCue.version += 1
    serverCue.title = `${serverCue.title}（协作者更新）`
    return HttpResponse.json({ cue: serverCue })
  }),

  http.post('/api/cues/:id/comments', async ({ params, request }) => {
    const body = (await request.json()) as { author: string; content: string }
    const cue = cues.find((item) => item.id === params.id)
    if (!cue) return new HttpResponse(null, { status: 404 })
    cue.comments.push({
      id: `comment-${Date.now()}`,
      author: body.author,
      content: body.content,
      createdAt: new Date().toISOString(),
      resolved: false,
    })
    return HttpResponse.json(cue, { status: 201 })
  }),

  http.post('/api/sync', async ({ request }) => {
    const body = (await request.json()) as { cues: Cue[]; baseRevision: number }
    cues = body.cues.map(withCueDefaults)
    serverRevision += 1
    return HttpResponse.json({ revision: serverRevision, syncedAt: new Date().toISOString() })
  }),
]

export { seedMovers }
