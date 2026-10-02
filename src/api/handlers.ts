import { http, HttpResponse } from 'msw'
import { seedCues, seedMovers, seedProject, type Cue } from '../stores/workshop'

let cues = structuredClone(seedCues)

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
  // 先到先得：baseVersion 与服务端版本一致才接收，否则 409 拒收
  http.put('/api/cues/:id', async ({ params, request }) => {
    const body = (await request.json()) as { cue: Cue; baseVersion: number }
    const index = cues.findIndex((item) => item.id === params.id)
    if (index < 0) {
      if (body.baseVersion !== 0) {
        return HttpResponse.json({ message: '版本冲突：该提示在服务端不存在', version: 0 }, { status: 409 })
      }
      const created = { ...body.cue, version: 1 }
      cues.push(created)
      return HttpResponse.json(created, { status: 201 })
    }
    const server = cues[index]
    if (body.baseVersion !== server.version) {
      return HttpResponse.json(
        { message: '版本冲突：先到版本已收录', version: server.version, cue: server },
        { status: 409 },
      )
    }
    const saved = { ...body.cue, version: server.version + 1 }
    cues[index] = saved
    return HttpResponse.json(saved)
  }),
  // 演示用：模拟协作端先提交同一提示
  http.post('/api/cues/:id/remote-edit', ({ params }) => {
    const cue = cues.find((item) => item.id === params.id)
    if (!cue) return new HttpResponse(null, { status: 404 })
    cue.note = `${cue.note}（协作端修订）`
    cue.version += 1
    return HttpResponse.json(cue)
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
    const body = (await request.json()) as { cues: typeof cues }
    cues = structuredClone(body.cues)
    return HttpResponse.json({ syncedAt: new Date().toISOString(), revision: Date.now() })
  }),
]

export { seedMovers }
