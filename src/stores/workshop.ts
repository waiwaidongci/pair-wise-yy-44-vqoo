import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import axios from 'axios'

export type Department = '舞台' | '灯光' | '音响' | '道具'
export type Point = { x: number; y: number }
export type CueStatus = '草稿' | '待确认' | '待复核' | '已确认'
export type SyncState = 'synced' | 'dirty' | 'conflict'

export type Comment = {
  id: string
  author: string
  content: string
  createdAt: string
  resolved: boolean
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
  status: CueStatus
  /** 服务端版本号，先到先得的比对依据 */
  version: number
  /** 确认依据：该节点被确认时所在的版本号 */
  confirmedAt: string | null
  /** 被联动退回待复核的原因 */
  invalidatedReason: string | null
  /** synced=已写入 dirty=本地未写入 conflict=提交被拒待取版 */
  syncState: SyncState
  comments: Comment[]
}

export type TimelineEvent = {
  id: string
  at: string
  revision: string
  type: '变更' | '失效' | '确认' | '同步' | '同步失败' | '冲突' | '重试' | '打印' | '基线'
  message: string
  cueId?: string
}

export type Checkpoint = {
  revision: number
  cueId: string
  at: string
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

const seedBase = [
  {
    id: 'C-01',
    act: '第一幕',
    scene: '启航前夜',
    time: '00:04:20',
    title: '林默从左侧门入场',
    department: '舞台' as Department,
    owner: '林默 / 周予',
    duration: 95,
    entry: { x: 10, y: 70 },
    exit: { x: 64, y: 38 },
    route: [{ x: 10, y: 70 }, { x: 35, y: 60 }, { x: 64, y: 38 }],
    note: '灯位切换后 2 秒入场，停在码头箱前。',
    status: '已确认' as CueStatus,
    confirmedAt: 'R11',
    comments: [
      { id: 'c1', author: '王灯控', content: '面光需要延长 4 秒，保证转身动作可见。', createdAt: '2026-09-27 14:20', resolved: false },
    ],
  },
  {
    id: 'C-02',
    act: '第一幕',
    scene: '启航前夜',
    time: '00:06:10',
    title: '信件道具交接',
    department: '道具' as Department,
    owner: '周予 / 道具组',
    duration: 40,
    entry: { x: 28, y: 30 },
    exit: { x: 55, y: 47 },
    route: [{ x: 28, y: 30 }, { x: 44, y: 40 }, { x: 55, y: 47 }],
    note: '使用 B 版信封，背台侧完成交接。',
    status: '待确认' as CueStatus,
    confirmedAt: null,
    comments: [],
  },
  {
    id: 'C-03',
    act: '第二幕',
    scene: '风暴',
    time: '00:21:35',
    title: '升降台上升 / 码头位移',
    department: '舞台' as Department,
    owner: '舞台机械',
    duration: 120,
    entry: { x: 72, y: 82 },
    exit: { x: 42, y: 50 },
    route: [{ x: 72, y: 82 }, { x: 60, y: 70 }, { x: 42, y: 50 }],
    note: '先确认演员离开危险半径，再启动升降台。',
    status: '草稿' as CueStatus,
    confirmedAt: null,
    comments: [],
  },
  {
    id: 'C-04',
    act: '第二幕',
    scene: '风暴',
    time: '00:23:05',
    title: '爆闪与低频重音',
    department: '灯光' as Department,
    owner: '王灯控 / 声场',
    duration: 18,
    entry: { x: 50, y: 12 },
    exit: { x: 50, y: 12 },
    route: [{ x: 50, y: 12 }],
    note: '与机械动作互锁，机械未到位禁止触发。',
    status: '待确认' as CueStatus,
    confirmedAt: null,
    comments: [],
  },
  {
    id: 'C-05',
    act: '第三幕',
    scene: '守望',
    time: '00:37:42',
    title: '三人灯塔调度',
    department: '舞台' as Department,
    owner: '主要演员组',
    duration: 70,
    entry: { x: 18, y: 82 },
    exit: { x: 82, y: 18 },
    route: [{ x: 18, y: 82 }, { x: 45, y: 66 }, { x: 68, y: 35 }, { x: 82, y: 18 }],
    note: '群演保持第二条对角线，不遮挡主视线。',
    status: '草稿' as CueStatus,
    confirmedAt: null,
    comments: [],
  },
  {
    id: 'C-06',
    act: '第三幕',
    scene: '守望',
    time: '00:39:10',
    title: '救生艇推入',
    department: '道具' as Department,
    owner: '道具组 / 群演乙组',
    duration: 50,
    entry: { x: 88, y: 64 },
    exit: { x: 70, y: 44 },
    route: [{ x: 88, y: 64 }, { x: 80, y: 54 }, { x: 70, y: 44 }],
    note: '与演员横穿路线冲突，需调整优先权。',
    status: '待确认' as CueStatus,
    confirmedAt: null,
    comments: [],
  },
]

export const seedCues: Cue[] = seedBase.map((cue) => ({
  ...cue,
  version: 1,
  invalidatedReason: null,
  syncState: 'synced' as SyncState,
}))

function toSeconds(time: string) {
  const [h = 0, m = 0, s = 0] = time.split(':').map((part) => Number(part))
  return h * 3600 + m * 60 + s
}

/**
 * 联动规则：同幕同场，且执行部门相同或触发时间窗重叠的提示，
 * 视为受本次路线 / 部门 / 触发时刻变更影响。
 */
export function isAffectedBy(changed: Cue, other: Cue) {
  if (other.id === changed.id) return false
  if (other.act !== changed.act || other.scene !== changed.scene) return false
  if (other.department === changed.department) return true
  const changedStart = toSeconds(changed.time)
  const changedEnd = changedStart + changed.duration
  const otherStart = toSeconds(other.time)
  const otherEnd = otherStart + other.duration
  return changedStart < otherEnd && otherStart < changedEnd
}

const STORAGE_KEY = 'stage-scheduler-draft-v2'

type Persisted = {
  cues?: Cue[]
  revision?: number
  timeline?: TimelineEvent[]
  checkpoint?: Checkpoint | null
}

export const useWorkshopStore = defineStore('workshop', () => {
  const saved = localStorage.getItem(STORAGE_KEY)
  const restored = saved ? (JSON.parse(saved) as Persisted) : null
  const cues = ref<Cue[]>(restored?.cues?.length ? restored.cues : structuredClone(seedCues))
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
  const timeline = ref<TimelineEvent[]>(restored?.timeline ?? [])
  const checkpoint = ref<Checkpoint | null>(restored?.checkpoint ?? null)
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
  /** 联动退回、尚未复核完的提示 */
  const pendingReview = computed(() => cues.value.filter((cue) => cue.status === '待复核'))
  /** 复核没完不能打印下一场 */
  const canPrint = computed(() => pendingReview.value.length === 0)
  const dirtyCount = computed(() => cues.value.filter((cue) => cue.syncState === 'dirty').length)
  const conflictCount = computed(() => cues.value.filter((cue) => cue.syncState === 'conflict').length)
  const checkpointLabel = computed(() =>
    checkpoint.value ? `R${checkpoint.value.revision} · ${checkpoint.value.cueId}` : '初始基线',
  )

  watch(
    [cues, rev, isOffline, timeline, checkpoint],
    () => {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ cues: cues.value, revision: rev.value, timeline: timeline.value, checkpoint: checkpoint.value }),
      )
      lastSaved.value = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
    },
    { deep: true },
  )

  function logEvent(type: TimelineEvent['type'], message: string, cueId?: string) {
    timeline.value.unshift({
      id: `ev-${Date.now()}-${timeline.value.length}`,
      at: new Date().toLocaleString('zh-CN', { hour12: false }),
      revision: revision.value,
      type,
      message,
      cueId,
    })
    if (timeline.value.length > 80) timeline.value.length = 80
  }

  function snapshot() {
    undoStack.value.push(structuredClone(cues.value))
    if (undoStack.value.length > 20) undoStack.value.shift()
    redoStack.value = []
  }

  const STRUCTURAL_KEYS: Array<'route' | 'department' | 'time'> = ['route', 'department', 'time']

  function updateCue(patch: Partial<Cue>, id = selectedId.value) {
    if (locked.value) return
    const index = cues.value.findIndex((cue) => cue.id === id)
    if (index < 0) return
    snapshot()
    const before = cues.value[index]
    const structural = STRUCTURAL_KEYS.some(
      (key) => key in patch && JSON.stringify(patch[key]) !== JSON.stringify(before[key]),
    )
    const next: Cue = { ...before, ...patch, syncState: 'dirty' }
    cues.value[index] = next
    rev.value += 1
    if (!structural) return

    logEvent('变更', `${next.id}「${next.title}」的路线节点 / 部门 / 触发时刻已更新`, next.id)
    // 本节点已确认内容被修改，自己先退回待复核
    if (next.status === '已确认') {
      next.status = '待复核'
      next.invalidatedReason = '本节点已确认内容被修改'
      logEvent('失效', `${next.id} 已确认内容被修改，退回待复核（原依据 ${next.confirmedAt ?? '无'} 保留）`, next.id)
    }
    // 联动：受影响的已确认节点退回待复核，未受影响的保留原依据不动
    for (const other of cues.value) {
      if (other.status !== '已确认' || !isAffectedBy(next, other)) continue
      other.status = '待复核'
      other.invalidatedReason = `受 ${next.id}「${next.title}」变更影响`
      other.syncState = 'dirty'
      logEvent('失效', `${other.id} 受 ${next.id} 变更影响，退回待复核（原依据 ${other.confirmedAt ?? '无'} 保留）`, other.id)
    }
  }

  /** 复核 / 确认通过：记录新的确认依据 */
  function confirmCue(id = selectedId.value) {
    if (locked.value) return
    const cue = cues.value.find((item) => item.id === id)
    if (!cue) return
    snapshot()
    rev.value += 1
    cue.status = '已确认'
    cue.confirmedAt = revision.value
    cue.invalidatedReason = null
    cue.syncState = 'dirty'
    logEvent('确认', `${cue.id} 复核通过，确认依据 ${cue.confirmedAt}`, cue.id)
  }

  /**
   * 单条写入，先到先得：服务端版本号与 baseVersion 不一致时拒收，
   * 本地现场保留，等待重新取版。
   */
  async function syncCue(id: string): Promise<'ok' | 'conflict' | 'error'> {
    const cue = cues.value.find((item) => item.id === id)
    if (!cue) return 'error'
    if (isOffline.value) {
      logEvent('同步失败', `${cue.id} 写入失败：当前离线，已停留在断点 ${checkpointLabel.value}，恢复后可重试`, cue.id)
      return 'error'
    }
    try {
      const { data } = await axios.put<Cue>(`/api/cues/${cue.id}`, {
        cue: JSON.parse(JSON.stringify(cue)),
        baseVersion: cue.version,
      })
      cue.version = data.version
      cue.syncState = 'synced'
      checkpoint.value = {
        revision: rev.value,
        cueId: cue.id,
        at: new Date().toLocaleString('zh-CN', { hour12: false }),
      }
      logEvent('同步', `${cue.id} 已写入服务端 v${data.version}，确认点推进到 ${checkpointLabel.value}`, cue.id)
      return 'ok'
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 409) {
        const serverVersion = (error.response.data as { version?: number } | undefined)?.version
        cue.syncState = 'conflict'
        logEvent('冲突', `${cue.id} 提交被拒：协作端已先到 v${serverVersion ?? '?'}，本地现场保留，请重新取版`, cue.id)
        return 'conflict'
      }
      const reason = axios.isAxiosError(error)
        ? error.response?.status
          ? `服务端返回 ${error.response.status}`
          : '网络异常'
        : '未知错误'
      logEvent('同步失败', `${cue.id} 写入失败：${reason}，将从断点 ${checkpointLabel.value} 重试`, cue.id)
      return 'error'
    }
  }

  /** 从最后一个确认点继续写入；遇失败即停，剩余条目留在队列里等下次重试 */
  async function syncAll(isRetry = false) {
    if (syncing.value) return
    syncing.value = true
    try {
      const pending = cues.value.filter((cue) => cue.syncState === 'dirty')
      if (isRetry && pending.length) {
        logEvent('重试', `从断点 ${checkpointLabel.value} 重试 ${pending.length} 条未写入提示`)
      }
      for (const cue of pending) {
        const result = await syncCue(cue.id)
        if (result !== 'ok') break
      }
    } finally {
      syncing.value = false
    }
  }

  /** 重新取版：拉取服务端先到版本，本地冲突修改让位 */
  async function refreshCue(id: string) {
    const { data } = await axios.get<Cue>(`/api/cues/${id}`)
    const index = cues.value.findIndex((item) => item.id === id)
    if (index < 0) return
    cues.value[index] = { ...data, syncState: 'synced' }
    rev.value += 1
    logEvent('同步', `${id} 已重新取版 v${data.version}，本地冲突修改已让位`, id)
  }

  function logPrint() {
    logEvent('打印', `执行清单 ${revision.value} 已生成（${cues.value.length} 个节点，断点 ${checkpointLabel.value}）`)
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
    const cue: Cue = {
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
      version: 0,
      confirmedAt: null,
      invalidatedReason: null,
      syncState: 'dirty',
      comments: [],
    }
    cues.value.push(cue)
    selectedId.value = cue.id
    rev.value += 1
  }

  function undo() {
    const previous = undoStack.value.pop()
    if (!previous) return
    redoStack.value.push(structuredClone(cues.value))
    cues.value = previous
    rev.value += 1
  }

  function redo() {
    const next = redoStack.value.pop()
    if (!next) return
    undoStack.value.push(structuredClone(cues.value))
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
    cue.syncState = 'dirty'
    rev.value += 1
  }

  function toggleComment(commentId: string) {
    const comment = selectedCue.value?.comments.find((item) => item.id === commentId)
    if (comment) comment.resolved = !comment.resolved
  }

  function lockBaseline() {
    locked.value = true
    rev.value += 1
    cues.value.forEach((cue) => {
      cue.status = '已确认'
      cue.confirmedAt = revision.value
      cue.invalidatedReason = null
    })
    logEvent('基线', `演出基线 ${revision.value} 已锁定，${cues.value.length} 个节点的确认依据已保留`)
  }

  function unlockBaseline() {
    locked.value = false
    rev.value += 1
    logEvent('基线', `基线 ${revision.value} 已解锁，进入修订`)
  }

  function toggleOffline() {
    isOffline.value = !isOffline.value
  }

  return {
    cues,
    selectedId,
    selectedCue,
    filteredCues,
    conflicts,
    pendingReview,
    canPrint,
    dirtyCount,
    conflictCount,
    checkpoint,
    checkpointLabel,
    timeline,
    syncing,
    zoom,
    actFilter,
    departmentFilter,
    revision,
    lastSaved,
    isOffline,
    locked,
    canUndo: computed(() => undoStack.value.length > 0),
    canRedo: computed(() => redoStack.value.length > 0),
    updateCue,
    confirmCue,
    syncCue,
    syncAll,
    refreshCue,
    logPrint,
    addWaypoint,
    addCue,
    undo,
    redo,
    addComment,
    toggleComment,
    lockBaseline,
    unlockBaseline,
    toggleOffline,
  }
})
