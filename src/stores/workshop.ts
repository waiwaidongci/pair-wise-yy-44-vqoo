import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { ElMessage } from 'element-plus'
import {
  bumpCueOnServer,
  fetchCueFromServer,
  submitCueToServer,
  syncAllToServer,
} from '../api/collab'

export type Department = '舞台' | '灯光' | '音响' | '道具'
export type Point = { x: number; y: number }

export type Comment = {
  id: string
  author: string
  content: string
  createdAt: string
  resolved: boolean
}

/**
 * 确认依据快照：提示被确认时，其结论所依赖的走位节点、部门与触发时刻。
 * 这些字段一旦变更，依据即失效，提示必须退回待复核。
 */
export type CueBasis = {
  route: Point[]
  entry: Point
  exit: Point
  department: Department
  time: string
  confirmedAt: string
  baselineRevision: number
}

export type Cue = {
  id: string
  act: string
  scene: string
  time: string
  title: string
  department: Department
  owner: string
  duration: number
  entry: Point
  exit: Point
  route: Point[]
  note: string
  status: '草稿' | '待确认' | '已确认'
  comments: Comment[]
  // —— 联动版本字段 ——
  version: number // 乐观并发版本号（以服务器确认为准）
  basis: CueBasis | null // 已确认依据快照；null 表示从未确认
  dirty: boolean // 依据失效，退回待复核
  affectedBy: string[] // 受哪些提示变更影响
  reviewReason: string // 待复核原因
}

export type TimelineEventType =
  | 'confirm'
  | 'review'
  | 'sync'
  | 'conflict'
  | 'failure'
  | 'retry'
  | 'refetch'
  | 'checkpoint'

export type TimelineEvent = {
  id: string
  time: string
  type: TimelineEventType
  cueId?: string
  message: string
  reason?: string
}

export const seedProject = {
  name: '潮汐来信',
  venue: '上海大剧院 · 大剧场',
  rehearsalDate: '2026-10-08',
  company: '远岸剧团',
}

export const seedMovers = [
  { id: 'M-01', alias: '林默', role: '父亲', group: '主要演员', color: '#d96b45' },
  { id: 'M-02', alias: '周予', role: '女儿', group: '主要演员', color: '#2f8d88' },
  { id: 'M-03', alias: '顾川', role: '灯塔守望者', group: '主要演员', color: '#4f6fb0' },
  { id: 'M-04', alias: '群演甲组', role: '旅客', group: '群演', color: '#ba8c2f' },
  { id: 'M-05', alias: '群演乙组', role: '码头工人', group: '群演', color: '#735ca8' },
]

// 触发联动复核的依据字段
const LINK_WINDOW_SECONDS = 180

function timeToSeconds(time: string): number {
  const parts = time.split(':').map(Number)
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
  if (parts.length === 2) return parts[0] * 60 + parts[1]
  return 0
}

function routePointsOf(cue: Cue): Point[] {
  return [cue.entry, ...cue.route, cue.exit]
}

function routeEqual(a: Point[], b: Point[]): boolean {
  if (a.length !== b.length) return false
  return a.every((point, index) => point.x === b[index].x && point.y === b[index].y)
}

/** 判断提示当前值是否已偏离其确认依据 */
function basisChanged(cue: Cue): boolean {
  const basis = cue.basis
  if (!basis) return false
  return (
    cue.department !== basis.department ||
    cue.time !== basis.time ||
    cue.entry.x !== basis.entry.x ||
    cue.entry.y !== basis.entry.y ||
    cue.exit.x !== basis.exit.x ||
    cue.exit.y !== basis.exit.y ||
    !routeEqual(cue.route, basis.route)
  )
}

function makeBasis(cue: Cue, baselineRevision: number): CueBasis {
  return {
    route: structuredClone(cue.route),
    entry: { ...cue.entry },
    exit: { ...cue.exit },
    department: cue.department,
    time: cue.time,
    confirmedAt: new Date().toISOString(),
    baselineRevision,
  }
}

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

export const seedCues: Cue[] = [
  {
    id: 'C-01',
    act: '第一幕',
    scene: '启航前夜',
    time: '00:04:20',
    title: '林默从左侧门入场',
    department: '舞台',
    owner: '林默 / 周予',
    duration: 95,
    entry: { x: 10, y: 70 },
    exit: { x: 64, y: 38 },
    route: [{ x: 10, y: 70 }, { x: 35, y: 60 }, { x: 64, y: 38 }],
    note: '灯位切换后 2 秒入场，停在码头箱前。',
    status: '已确认',
    comments: [
      { id: 'c1', author: '王灯控', content: '面光需要延长 4 秒，保证转身动作可见。', createdAt: '2026-09-27 14:20', resolved: false },
    ],
    version: 1,
    basis: {
      route: [{ x: 10, y: 70 }, { x: 35, y: 60 }, { x: 64, y: 38 }],
      entry: { x: 10, y: 70 },
      exit: { x: 64, y: 38 },
      department: '舞台',
      time: '00:04:20',
      confirmedAt: '2026-09-27T14:20:00.000Z',
      baselineRevision: 12,
    },
    dirty: false,
    affectedBy: [],
    reviewReason: '',
  },
  {
    id: 'C-02',
    act: '第一幕',
    scene: '启航前夜',
    time: '00:06:10',
    title: '信件道具交接',
    department: '道具',
    owner: '周予 / 道具组',
    duration: 40,
    entry: { x: 28, y: 30 },
    exit: { x: 55, y: 47 },
    route: [{ x: 28, y: 30 }, { x: 44, y: 40 }, { x: 55, y: 47 }],
    note: '使用 B 版信封，背台侧完成交接。',
    status: '待确认',
    comments: [],
    version: 1,
    basis: null,
    dirty: false,
    affectedBy: [],
    reviewReason: '',
  },
  {
    id: 'C-03',
    act: '第二幕',
    scene: '风暴',
    time: '00:21:35',
    title: '升降台上升 / 码头位移',
    department: '舞台',
    owner: '舞台机械',
    duration: 120,
    entry: { x: 72, y: 82 },
    exit: { x: 42, y: 50 },
    route: [{ x: 72, y: 82 }, { x: 60, y: 70 }, { x: 42, y: 50 }],
    note: '先确认演员离开危险半径，再启动升降台。',
    status: '草稿',
    comments: [],
    version: 1,
    basis: null,
    dirty: false,
    affectedBy: [],
    reviewReason: '',
  },
  {
    id: 'C-04',
    act: '第二幕',
    scene: '风暴',
    time: '00:23:05',
    title: '爆闪与低频重音',
    department: '灯光',
    owner: '王灯控 / 声场',
    duration: 18,
    entry: { x: 50, y: 12 },
    exit: { x: 50, y: 12 },
    route: [{ x: 50, y: 12 }],
    note: '与机械动作互锁，机械未到位禁止触发。',
    status: '待确认',
    comments: [],
    version: 1,
    basis: null,
    dirty: false,
    affectedBy: [],
    reviewReason: '',
  },
  {
    id: 'C-05',
    act: '第三幕',
    scene: '守望',
    time: '00:37:42',
    title: '三人灯塔调度',
    department: '舞台',
    owner: '主要演员组',
    duration: 70,
    entry: { x: 18, y: 82 },
    exit: { x: 82, y: 18 },
    route: [{ x: 18, y: 82 }, { x: 45, y: 66 }, { x: 68, y: 35 }, { x: 82, y: 18 }],
    note: '群演保持第二条对角线，不遮挡主视线。',
    status: '草稿',
    comments: [],
    version: 1,
    basis: null,
    dirty: false,
    affectedBy: [],
    reviewReason: '',
  },
  {
    id: 'C-06',
    act: '第三幕',
    scene: '守望',
    time: '00:39:10',
    title: '救生艇推入',
    department: '道具',
    owner: '道具组 / 群演乙组',
    duration: 50,
    entry: { x: 88, y: 64 },
    exit: { x: 70, y: 44 },
    route: [{ x: 88, y: 64 }, { x: 80, y: 54 }, { x: 70, y: 44 }],
    note: '与演员横穿路线冲突，需调整优先权。',
    status: '待确认',
    comments: [],
    version: 1,
    basis: null,
    dirty: false,
    affectedBy: [],
    reviewReason: '',
  },
]

const DRAFT_KEY = 'stage-scheduler-draft-v2'
const TIMELINE_KEY = 'stage-scheduler-timeline-v1'

function loadTimeline(): TimelineEvent[] {
  try {
    const raw = localStorage.getItem(TIMELINE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as TimelineEvent[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export const useWorkshopStore = defineStore('workshop', () => {
  const saved = localStorage.getItem(DRAFT_KEY)
  const restored = saved ? (JSON.parse(saved) as { cues?: Partial<Cue>[]; revision?: number }) : null
  const cues = ref<Cue[]>(
    restored?.cues?.length ? restored.cues.map(withCueDefaults) : structuredClone(seedCues),
  )
  const selectedId = ref('C-01')
  const zoom = ref(100)
  const actFilter = ref('全部')
  const departmentFilter = ref('全部')
  const rev = ref(restored?.revision ?? 12)
  const revision = computed(() => `R${rev.value}`)
  const lastSaved = ref('刚刚自动保存')
  const isOffline = ref(false)
  const locked = ref(false)
  const undoStack = ref<Cue[][]>([])
  const redoStack = ref<Cue[][]>([])

  // —— 联动版本 / 协同状态 ——
  const timeline = ref<TimelineEvent[]>(loadTimeline())
  const checkpoint = ref<{ cues: Cue[]; revision: number; at: string } | null>(null)
  const conflictState = ref<{ cueId: string; serverCue: Cue } | null>(null)
  const syncing = ref(false)

  const selectedCue = computed(() => cues.value.find((cue) => cue.id === selectedId.value) ?? cues.value[0])
  const filteredCues = computed(() =>
    cues.value.filter(
      (cue) =>
        (actFilter.value === '全部' || cue.act === actFilter.value) &&
        (departmentFilter.value === '全部' || cue.department === departmentFilter.value),
    ),
  )
  const conflicts = computed(() =>
    cues.value.filter((cue, index) =>
      cues.value.some((other, otherIndex) => otherIndex !== index && other.time === cue.time && other.scene === cue.scene),
    ),
  )

  /** 待复核（依据失效）的提示数 —— 打印闸门依据 */
  const pendingReviewCount = computed(() => cues.value.filter((cue) => cue.dirty).length)
  /** 复核没完不能打印下一场：存在待复核提示时禁止打印 */
  const canPrint = computed(() => !cues.value.some((cue) => cue.dirty))
  const blockingScenes = computed(() => [...new Set(cues.value.filter((cue) => cue.dirty).map((cue) => cue.scene))])
  const lastCheckpoint = computed(() => (checkpoint.value ? `R${checkpoint.value.revision}` : '—'))

  watch(
    [cues, rev, isOffline],
    () => {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ cues: cues.value, revision: rev.value }))
      lastSaved.value = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
    },
    { deep: true },
  )

  function persistTimeline() {
    localStorage.setItem(TIMELINE_KEY, JSON.stringify(timeline.value))
  }

  function recordTimeline(event: Omit<TimelineEvent, 'id' | 'time'>) {
    timeline.value.unshift({
      id: `tl-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      time: new Date().toISOString(),
      ...event,
    })
    if (timeline.value.length > 100) timeline.value.length = 100
    persistTimeline()
  }

  function snapshotCues(): Cue[] {
    return structuredClone(cues.value)
  }

  function snapshot() {
    undoStack.value.push(snapshotCues())
    if (undoStack.value.length > 20) undoStack.value.shift()
    redoStack.value = []
  }

  /**
   * 联动关系：同场景且触发时刻相差在窗口内，或共用任一路线节点。
   * 用于在一个提示变更时找出需要连带复核的提示。
   */
  function linkedCues(cueId: string): string[] {
    const cue = cues.value.find((item) => item.id === cueId)
    if (!cue) return []
    const cuePoints = routePointsOf(cue)
    return cues.value
      .filter((item) => item.id !== cueId)
      .filter((item) => {
        if (item.scene === cue.scene) {
          const delta = Math.abs(timeToSeconds(item.time) - timeToSeconds(cue.time))
          if (delta <= LINK_WINDOW_SECONDS) return true
        }
        const otherPoints = routePointsOf(item)
        return cuePoints.some((point) => otherPoints.some((other) => other.x === point.x && other.y === point.y))
      })
      .map((item) => item.id)
  }

  /** 将提示退回待复核，保留原依据快照以便比对 */
  function revertToReview(cue: Cue, reason: string, causedBy?: string) {
    if (!cue.dirty) {
      cue.status = '待确认'
      cue.dirty = true
      cue.reviewReason = reason
      if (causedBy && !cue.affectedBy.includes(causedBy)) cue.affectedBy.push(causedBy)
      recordTimeline({
        type: 'review',
        cueId: cue.id,
        message: `${cue.id} 退回待复核`,
        reason,
      })
    } else if (causedBy && !cue.affectedBy.includes(causedBy)) {
      cue.affectedBy.push(causedBy)
    }
  }

  function updateCue(patch: Partial<Cue>, addRevision = true) {
    if (locked.value) return
    snapshot()
    const index = cues.value.findIndex((cue) => cue.id === selectedId.value)
    if (index < 0) return
    const target = cues.value[index]
    const hadBasis = target.basis !== null
    Object.assign(target, patch)
    // 依据字段变更 → 依据失效，退回待复核，并联动同场景/共节点的已确认提示
    if (hadBasis && basisChanged(target)) {
      revertToReview(target, '路线节点 / 部门 / 触发时刻变更，原确认依据已失效')
      for (const otherId of linkedCues(target.id)) {
        const other = cues.value.find((item) => item.id === otherId)
        if (other && other.basis !== null && !other.dirty) {
          revertToReview(other, `受 ${target.id} 变更影响（同场景时间相近或共用路线节点）`, target.id)
        }
      }
    }
    if (addRevision) rev.value += 1
  }

  function addWaypoint(point: { x: number; y: number }) {
    const cue = selectedCue.value
    if (!cue) return
    updateCue({ route: [...cue.route, point] })
  }

  function addCue() {
    if (locked.value) return
    snapshot()
    const next = cues.value.length + 1
    const cue = withCueDefaults({
      id: `C-${String(next).padStart(2, '0')}`,
      act: '第一幕',
      scene: '新场景',
      time: '00:00:00',
      title: '新执行提示',
      department: '舞台',
      owner: '待指派',
      duration: 30,
      entry: { x: 10, y: 50 },
      exit: { x: 90, y: 50 },
      route: [{ x: 10, y: 50 }, { x: 90, y: 50 }],
      note: '',
      status: '草稿',
      comments: [],
    })
    cues.value.push(cue)
    selectedId.value = cue.id
    rev.value += 1
  }

  function undo() {
    const previous = undoStack.value.pop()
    if (!previous) return
    redoStack.value.push(snapshotCues())
    cues.value = previous
    rev.value += 1
  }

  function redo() {
    const next = redoStack.value.pop()
    if (!next) return
    undoStack.value.push(snapshotCues())
    cues.value = next
    rev.value += 1
  }

  function addComment(content: string, author = '当前用户') {
    const cue = selectedCue.value
    if (!cue) return
    snapshot()
    cue.comments.push({
      id: `local-${Date.now()}`,
      author,
      content,
      createdAt: new Date().toLocaleString('zh-CN'),
      resolved: false,
    })
    rev.value += 1
  }

  function toggleComment(commentId: string) {
    const comment = selectedCue.value?.comments.find((item) => item.id === commentId)
    if (comment) comment.resolved = !comment.resolved
  }

  /** 确认 / 重新确认：以当前值重建依据快照，并入基线 */
  function confirmCue(id: string) {
    const cue = cues.value.find((item) => item.id === id)
    if (!cue) return
    snapshot()
    cue.status = '已确认'
    cue.dirty = false
    cue.basis = makeBasis(cue, rev.value)
    cue.affectedBy = []
    cue.reviewReason = ''
    rev.value += 1
    recordTimeline({
      type: 'confirm',
      cueId: id,
      message: `${id} 已确认并并入基线`,
      reason: '依据快照已更新',
    })
  }

  function lockBaseline() {
    locked.value = true
    for (const cue of cues.value) {
      cue.status = '已确认'
      cue.dirty = false
      cue.affectedBy = []
      cue.reviewReason = ''
      if (!cue.basis) cue.basis = makeBasis(cue, rev.value)
    }
    rev.value += 1
    recordTimeline({ type: 'checkpoint', message: '演出基线已锁定', reason: `版本 ${revision.value}` })
  }

  function unlockBaseline() {
    locked.value = false
    rev.value += 1
  }

  function toggleOffline() {
    isOffline.value = !isOffline.value
  }

  // —— 协同写入：乐观并发（先到先收） ——

  /** 提交单个提示：服务器版本不一致时返回 409，本地保留现场并提示重新取版 */
  async function submitCue(id: string) {
    const cue = cues.value.find((item) => item.id === id)
    if (!cue) return
    if (isOffline.value) {
      recordTimeline({
        type: 'failure',
        cueId: id,
        message: `提交 ${id} 未发出`,
        reason: '离线模式，网络不可用',
      })
      ElMessage.warning('离线模式：已保留本地草稿，恢复在线后可重试')
      return
    }
    const result = await submitCueToServer(cue, cue.version)
    if (result.ok) {
      cue.version = result.cue.version
      recordTimeline({
        type: 'sync',
        cueId: id,
        message: `已提交 ${id}`,
        reason: `服务器版本 v${result.cue.version}`,
      })
      checkpoint.value = { cues: snapshotCues(), revision: rev.value, at: new Date().toISOString() }
      ElMessage.success(`已提交 ${id}`)
    } else if (result.conflict) {
      conflictState.value = { cueId: id, serverCue: result.serverCue }
      recordTimeline({
        type: 'conflict',
        cueId: id,
        message: `提交 ${id} 被拒绝`,
        reason: `服务器已更新到 v${result.currentVersion}，请重新取版`,
      })
      ElMessage.warning('版本冲突：服务器已有更新版本，请重新取版')
    }
  }

  /** 重新取版：用服务器最新版本覆盖本地，并保留现场提示 */
  async function refetchCue(id: string) {
    const serverCue = await fetchCueFromServer(id)
    const index = cues.value.findIndex((cue) => cue.id === id)
    if (index >= 0) cues.value[index] = withCueDefaults(serverCue)
    conflictState.value = null
    recordTimeline({
      type: 'refetch',
      cueId: id,
      message: `已重新取版 ${id}`,
      reason: `当前版本 v${serverCue.version}`,
    })
    ElMessage.success('已取服务器最新版本')
  }

  /** 演示用：模拟协作者抢先提交，推高服务器版本 */
  async function simulateCollaboratorBump(id: string) {
    const serverCue = await bumpCueOnServer(id)
    recordTimeline({
      type: 'sync',
      cueId: id,
      message: `协作者更新了 ${id}`,
      reason: `服务器版本升至 v${serverCue.version}`,
    })
    ElMessage.info('已模拟协作者提交，本地再次提交将触发版本冲突')
  }

  // —— 全量同步：失败后从最后确认点重试，原因留时间线 ——

  async function withRetry(label: string, operation: () => Promise<void>, maxAttempts = 3): Promise<boolean> {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        await operation()
        recordTimeline({ type: 'sync', message: `${label}成功`, reason: `第 ${attempt} 次尝试` })
        return true
      } catch (error) {
        const reason = error instanceof Error ? error.message : '未知错误'
        recordTimeline({
          type: 'failure',
          message: `${label}失败（第 ${attempt} 次）`,
          reason,
        })
        if (attempt < maxAttempts) await new Promise((resolve) => setTimeout(resolve, 600 * attempt))
      }
    }
    return false
  }

  async function syncAll() {
    if (syncing.value) return
    syncing.value = true
    const ok = await withRetry('全量同步', async () => {
      if (isOffline.value) throw new Error('离线模式，网络不可用')
      await syncAllToServer(cues.value, rev.value)
    })
    syncing.value = false
    if (ok) {
      checkpoint.value = { cues: snapshotCues(), revision: rev.value, at: new Date().toISOString() }
      ElMessage.success(`已同步 ${revision.value}`)
    } else {
      recordTimeline({
        type: 'retry',
        message: '已从最后确认点重试',
        reason: `确认点 ${lastCheckpoint.value}，本地草稿已保留`,
      })
      ElMessage.error('同步失败，已从确认点重试仍未成功，本地草稿已保留')
    }
  }

  function retrySync() {
    void syncAll()
  }

  return {
    cues,
    selectedId,
    selectedCue,
    filteredCues,
    conflicts,
    zoom,
    actFilter,
    departmentFilter,
    revision,
    lastSaved,
    isOffline,
    locked,
    canUndo: computed(() => undoStack.value.length > 0),
    canRedo: computed(() => redoStack.value.length > 0),
    // 联动版本 / 协同
    timeline,
    checkpoint,
    conflictState,
    syncing,
    pendingReviewCount,
    canPrint,
    blockingScenes,
    lastCheckpoint,
    linkedCues,
    basisChanged,
    updateCue,
    addWaypoint,
    addCue,
    undo,
    redo,
    addComment,
    toggleComment,
    confirmCue,
    lockBaseline,
    unlockBaseline,
    toggleOffline,
    submitCue,
    refetchCue,
    simulateCollaboratorBump,
    syncAll,
    retrySync,
  }
})
