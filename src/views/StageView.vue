<script setup lang="ts">
import { computed, ref } from 'vue'
import { ElMessage } from 'element-plus'
import axios from 'axios'
import { useWorkshopStore, type Cue, type CueStatus, type Department } from '../stores/workshop'

const store = useWorkshopStore()
const commentText = ref('')
const showRouteEditor = ref(true)
const departments: Array<'全部' | Department> = ['全部', '舞台', '灯光', '音响', '道具']
const acts = ['全部', '第一幕', '第二幕', '第三幕']

const cue = computed(() => store.selectedCue)
const routePoints = computed(() => cue.value?.route.map((point) => `${point.x},${point.y}`).join(' ') ?? '')
const conflictCues = computed(() => new Set(store.conflicts.map((item) => item.id)))

const statusType = (status: CueStatus) =>
  status === '已确认' ? 'success' : status === '待复核' ? 'danger' : status === '待确认' ? 'warning' : 'info'

function selectCue(item: Cue) {
  store.selectedId = item.id
}

function addWaypoint(event: MouseEvent) {
  if (!showRouteEditor.value || store.locked) return
  const target = event.currentTarget as SVGElement
  const rect = target.getBoundingClientRect()
  const x = Math.round(((event.clientX - rect.left) / rect.width) * 100)
  const y = Math.round(((event.clientY - rect.top) / rect.height) * 100)
  store.addWaypoint({ x, y })
  ElMessage.success('已追加路线节点，受影响提示已退回待复核')
}

async function saveCue() {
  const current = cue.value
  if (!current) return
  const result = await store.syncCue(current.id)
  if (result === 'ok') {
    ElMessage.success(`已同步 ${store.revision} · 服务端 v${current.version}`)
  } else if (result === 'conflict') {
    ElMessage.warning('协作端已先提交该提示，你的现场已保留，请重新取版')
  } else {
    ElMessage.error(`写入失败，已从断点 ${store.checkpointLabel} 保留，可重试`)
  }
}

async function retrySync() {
  await store.syncAll(true)
  if (store.dirtyCount === 0) ElMessage.success('断点重试完成，全部提示已写入')
  else ElMessage.warning(`仍有 ${store.dirtyCount} 条未写入，失败原因已记入时间线`)
}

async function refreshCue() {
  const current = cue.value
  if (!current) return
  await store.refreshCue(current.id)
  ElMessage.success('已重新取版，本地冲突修改已让位')
}

async function simulateRemote() {
  const current = cue.value
  if (!current) return
  await axios.post(`/api/cues/${current.id}/remote-edit`)
  ElMessage.info('协作端已提交同一提示的新版本，再点同步可验证先到先得')
}

function confirmSelected() {
  const current = cue.value
  if (!current) return
  store.confirmCue(current.id)
  ElMessage.success(`${current.id} 复核通过，确认依据 ${current.confirmedAt}`)
}

function submitComment() {
  if (!commentText.value.trim()) return
  store.addComment(commentText.value.trim(), '制作人 · 陈曦')
  commentText.value = ''
  ElMessage.success('留言已加入待办')
}

function updateCue(key: keyof Cue, value: unknown) {
  store.updateCue({ [key]: value } as Partial<Cue>)
}
</script>

<template>
  <section class="page stage-page">
    <div class="page-head">
      <div>
        <p class="eyebrow">STAGING / 走位编排</p>
        <h1>舞台平面与执行提示</h1>
        <p class="muted">选择走位后可直接在平面图追加节点；确认锁定时编辑自动停用。</p>
      </div>
      <div class="actions">
        <el-button :disabled="!store.canUndo || store.locked" @click="store.undo()">撤销</el-button>
        <el-button :disabled="!store.canRedo || store.locked" @click="store.redo()">重做</el-button>
        <el-button v-if="store.dirtyCount > 1" :loading="store.syncing" @click="retrySync">
          断点重试（{{ store.dirtyCount }}）
        </el-button>
        <el-button type="primary" :loading="store.syncing" @click="saveCue">
          {{ store.isOffline ? '保存草稿' : '同步版本' }}
        </el-button>
      </div>
    </div>

    <el-alert
      v-if="store.conflicts.length"
      class="conflict-alert"
      type="warning"
      show-icon
      :closable="false"
      :title="`发现 ${store.conflicts.length} 个同时触发节点`"
      description="系统已高亮冲突提示，请在右侧检查触发时间与部门优先级。"
    />

    <div class="toolbar panel">
      <div class="filter-group">
        <span>幕次</span>
        <el-select v-model="store.actFilter" size="small" style="width: 112px">
          <el-option v-for="act in acts" :key="act" :label="act" :value="act" />
        </el-select>
        <span>部门</span>
        <el-select v-model="store.departmentFilter" size="small" style="width: 112px">
          <el-option v-for="department in departments" :key="department" :label="department" :value="department" />
        </el-select>
      </div>
      <div class="zoom-control">
        <span>缩放 {{ store.zoom }}%</span>
        <el-slider v-model="store.zoom" :min="70" :max="150" :step="5" style="width: 150px" />
      </div>
      <el-switch v-model="showRouteEditor" active-text="路线编辑" />
      <el-button @click="store.addCue" :disabled="store.locked">新增提示</el-button>
      <el-button text type="info" :disabled="store.isOffline" @click="simulateRemote">模拟协作改单</el-button>
      <el-tag :type="store.locked ? 'success' : 'info'" effect="plain">{{ store.locked ? '基线已锁定' : '草稿编辑中' }}</el-tag>
      <el-tag v-if="store.pendingReview.length" type="danger" effect="plain">{{ store.pendingReview.length }} 条待复核</el-tag>
    </div>

    <div class="work-grid">
      <section class="panel stage-panel">
        <div class="panel-head">
          <h3>舞台平面图 · 主视图</h3>
          <span class="muted">点击地面追加路线节点</span>
        </div>
        <div class="stage-scroll">
          <div class="stage-canvas" :style="{ transform: `scale(${store.zoom / 100})` }">
            <div class="stage-label">观众席</div>
            <div class="led-strip">LED 背景幕</div>
            <svg class="stage-svg" viewBox="0 0 100 100" preserveAspectRatio="none" @click="addWaypoint">
              <defs>
                <pattern id="grid" width="5" height="5" patternUnits="userSpaceOnUse">
                  <path d="M 5 0 L 0 0 0 5" fill="none" stroke="#cbd6da" stroke-width="0.15" />
                </pattern>
                <marker id="arrow" markerWidth="5" markerHeight="5" refX="4" refY="2.5" orient="auto">
                  <path d="M0,0 L5,2.5 L0,5 z" fill="#287d7c" />
                </marker>
              </defs>
              <rect width="100" height="100" fill="url(#grid)" />
              <rect x="3" y="2" width="94" height="12" rx="1" class="backstage" />
              <rect x="5" y="88" width="90" height="9" rx="1" class="apron" />
              <line x1="50" y1="14" x2="50" y2="88" class="center-line" />
              <template v-for="item in store.filteredCues" :key="item.id">
                <polyline
                  v-if="item.route.length > 1"
                  :points="item.route.map((point) => `${point.x},${point.y}`).join(' ')"
                  :class="['route', { selected: item.id === store.selectedId, conflict: conflictCues.has(item.id) }]"
                  marker-end="url(#arrow)"
                />
                <g class="cue-point" :class="{ selected: item.id === store.selectedId }" @click.stop="selectCue(item)">
                  <circle :cx="item.entry.x" :cy="item.entry.y" r="2.8" />
                  <text :x="item.entry.x + 3.2" :y="item.entry.y + 1">{{ item.id }}</text>
                </g>
              </template>
              <template v-if="cue">
                <circle v-for="(point, index) in cue.route.slice(1, -1)" :key="index" :cx="point.x" :cy="point.y" r="1.5" class="waypoint" />
                <circle :cx="cue.exit.x" :cy="cue.exit.y" r="2.5" class="exit-point" />
              </template>
            </svg>
            <div class="stage-legend">
              <span><i class="entry" />入场</span>
              <span><i class="way" />路线</span>
              <span><i class="exit" />退场</span>
            </div>
          </div>
        </div>
      </section>

      <aside class="panel editor-panel">
        <div v-if="cue" class="editor">
          <div class="editor-title">
            <div>
              <span>{{ cue.id }} · {{ cue.act }}</span>
              <h3>{{ cue.title }}</h3>
              <small v-if="cue.confirmedAt" class="basis">确认依据 {{ cue.confirmedAt }} · 服务端 v{{ cue.version }}</small>
            </div>
            <el-tag :type="statusType(cue.status)" effect="plain">{{ cue.status }}</el-tag>
          </div>

          <el-alert
            v-if="cue.syncState === 'conflict'"
            class="sync-alert"
            type="error"
            show-icon
            :closable="false"
            title="提交被拒：协作端已先到新版本"
            description="先到版本已收录，你的现场修改已保留。重新取版后再决定是否重新提交。"
          >
            <el-button size="small" type="danger" plain @click="refreshCue">重新取版</el-button>
          </el-alert>

          <el-alert
            v-if="cue.status === '待复核'"
            class="sync-alert"
            type="warning"
            show-icon
            :closable="false"
            :title="`待复核：${cue.invalidatedReason ?? '联动变更'}`"
            description="复核完成前，该节点会阻止打印下一场执行清单。"
          >
            <el-button size="small" type="warning" plain :disabled="store.locked" @click="confirmSelected">复核确认</el-button>
          </el-alert>

          <el-form label-position="top" size="small" :disabled="store.locked">
            <div class="form-grid">
              <el-form-item label="场景">
                <el-input :model-value="cue.scene" @update:model-value="updateCue('scene', $event)" />
              </el-form-item>
              <el-form-item label="时间码">
                <el-input :model-value="cue.time" @update:model-value="updateCue('time', $event)" />
              </el-form-item>
              <el-form-item label="执行部门">
                <el-select :model-value="cue.department" @update:model-value="updateCue('department', $event)">
                  <el-option v-for="department in departments.slice(1)" :key="department" :label="department" :value="department" />
                </el-select>
              </el-form-item>
              <el-form-item label="责任角色">
                <el-input :model-value="cue.owner" @update:model-value="updateCue('owner', $event)" />
              </el-form-item>
            </div>
            <el-form-item label="执行说明">
              <el-input type="textarea" :rows="3" :model-value="cue.note" @update:model-value="updateCue('note', $event)" />
            </el-form-item>
            <el-form-item label="路线节点 / 触发时机">
              <div class="route-summary">
                <span v-for="(point, index) in cue.route" :key="index">{{ index === 0 ? '入' : index === cue.route.length - 1 ? '出' : index }} ({{ point.x }},{{ point.y }})</span>
              </div>
            </el-form-item>
          </el-form>

          <div class="comment-block">
            <div class="comment-head">
              <strong>部门留言 · {{ cue.comments.filter((item) => !item.resolved).length }} 待处理</strong>
            </div>
            <div class="comment-list">
              <div v-for="comment in cue.comments" :key="comment.id" class="comment" :class="{ resolved: comment.resolved }">
                <div>
                  <strong>{{ comment.author }}</strong>
                  <time>{{ comment.createdAt }}</time>
                </div>
                <p>{{ comment.content }}</p>
                <el-button link type="primary" @click="store.toggleComment(comment.id)">
                  {{ comment.resolved ? '重新打开' : '标记解决' }}
                </el-button>
              </div>
              <el-empty v-if="cue.comments.length === 0" description="暂无留言" :image-size="46" />
            </div>
            <div class="comment-input">
              <el-input v-model="commentText" placeholder="输入需其他部门处理的意见" @keyup.enter="submitComment" />
              <el-button type="primary" @click="submitComment">发送</el-button>
            </div>
          </div>
        </div>
      </aside>
    </div>

    <section class="panel cue-strip">
      <div class="panel-head">
        <h3>脚本节点（{{ store.filteredCues.length }}）</h3>
        <span class="muted">按执行时间排序</span>
      </div>
      <div class="cue-cards">
        <button
          v-for="item in [...store.filteredCues].sort((a, b) => a.time.localeCompare(b.time))"
          :key="item.id"
          class="cue-card"
          :class="{ active: item.id === store.selectedId, conflict: conflictCues.has(item.id), review: item.status === '待复核' }"
          @click="selectCue(item)"
        >
          <span>{{ item.id }} · {{ item.department }}</span>
          <strong>{{ item.title }}</strong>
          <small>{{ item.time }} · {{ item.duration }} 秒 · {{ item.status }}</small>
        </button>
      </div>
    </section>
  </section>
</template>

<style scoped>
.stage-page {
  background: #eef2f4;
}

.conflict-alert {
  margin-bottom: 12px;
}

.toolbar {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 12px;
  padding: 10px 14px;
}

.filter-group,
.zoom-control {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #5d6b78;
  font-size: 12px;
}

.toolbar > :nth-last-child(2) {
  margin-left: auto;
}

.work-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.65fr) minmax(300px, 0.75fr);
  gap: 12px;
}

.stage-panel {
  min-width: 0;
}

.stage-scroll {
  overflow: auto;
  padding: 18px;
  background: #182633;
}

.stage-canvas {
  position: relative;
  width: 100%;
  min-width: 540px;
  aspect-ratio: 16 / 9;
  transform-origin: left top;
  background: #eef1eb;
  box-shadow: 0 12px 30px rgb(0 0 0 / 24%);
}

.stage-label,
.led-strip {
  position: absolute;
  z-index: 2;
  left: 50%;
  transform: translateX(-50%);
  color: #67727a;
  font-size: 10px;
  letter-spacing: 0.2em;
}

.stage-label {
  bottom: 1.6%;
}

.led-strip {
  top: 2.7%;
}

.stage-svg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  cursor: crosshair;
}

.backstage {
  fill: #d8ddd6;
  opacity: 0.75;
}

.apron {
  fill: #dfe5df;
  opacity: 0.65;
}

.center-line {
  stroke: #9aa6a2;
  stroke-width: 0.2;
  stroke-dasharray: 1 1;
}

.route {
  fill: none;
  stroke: #4a8e8b;
  stroke-width: 0.75;
  stroke-linejoin: round;
}

.route.selected {
  stroke: #c36e23;
  stroke-width: 1.1;
}

.route.conflict {
  stroke: #cc4f42;
  stroke-dasharray: 2 1.2;
}

.cue-point circle {
  fill: #fff;
  stroke: #247d7b;
  stroke-width: 0.7;
}

.cue-point text {
  fill: #213d46;
  font-size: 2.2px;
  font-weight: 800;
  cursor: pointer;
}

.cue-point.selected circle {
  fill: #f7b54b;
  stroke: #9f4a17;
  stroke-width: 1;
}

.waypoint {
  fill: #f2a43c;
  stroke: #8a4d12;
  stroke-width: 0.4;
}

.exit-point {
  fill: #bb4d3e;
  stroke: #fff;
  stroke-width: 0.5;
}

.stage-legend {
  position: absolute;
  right: 2%;
  bottom: 3%;
  z-index: 3;
  display: flex;
  gap: 10px;
  padding: 6px 8px;
  color: #44515b;
  background: rgb(255 255 255 / 88%);
  font-size: 10px;
}

.stage-legend i {
  display: inline-block;
  width: 7px;
  height: 7px;
  margin-right: 4px;
  border-radius: 50%;
}

.stage-legend .entry {
  background: #247d7b;
}

.stage-legend .way {
  background: #f2a43c;
}

.stage-legend .exit {
  background: #bb4d3e;
}

.editor-panel {
  max-height: 730px;
  overflow: auto;
}

.editor {
  padding: 16px;
}

.editor-title {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 14px;
}

.editor-title span {
  color: #6b7883;
  font-size: 11px;
}

.editor-title h3 {
  margin: 4px 0 0;
  font-size: 18px;
}

.basis {
  display: block;
  margin-top: 5px;
  color: #34805e;
  font-size: 11px;
}

.sync-alert {
  margin-bottom: 12px;
}

.sync-alert .el-button {
  margin-top: 8px;
}

.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.route-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}

.route-summary span {
  padding: 3px 6px;
  border: 1px solid #dbe2e5;
  border-radius: 4px;
  color: #53606c;
  background: #f6f8f8;
  font-size: 11px;
}

.comment-block {
  padding-top: 12px;
  border-top: 1px solid #e4e9eb;
}

.comment-head {
  margin-bottom: 8px;
  font-size: 13px;
}

.comment-list {
  display: grid;
  gap: 8px;
  max-height: 190px;
  overflow: auto;
}

.comment {
  padding: 9px;
  border: 1px solid #e5eaec;
  border-radius: 6px;
  background: #f9fafa;
}

.comment.resolved {
  opacity: 0.65;
}

.comment div {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  font-size: 11px;
}

.comment time {
  color: #87929b;
}

.comment p {
  margin: 6px 0 3px;
  font-size: 12px;
  line-height: 1.5;
}

.comment-input {
  display: flex;
  gap: 7px;
  margin-top: 10px;
}

.cue-strip {
  margin-top: 12px;
}

.cue-cards {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding: 12px;
}

.cue-card {
  min-width: 190px;
  padding: 11px;
  border: 1px solid #dce3e7;
  border-radius: 7px;
  text-align: left;
  background: #fff;
  cursor: pointer;
}

.cue-card.active {
  border-color: #2f8580;
  box-shadow: 0 0 0 2px rgb(47 133 128 / 14%);
}

.cue-card.conflict {
  border-left: 4px solid #cf5b3f;
}

.cue-card.review {
  border-color: #e0a23c;
  background: #fffaf0;
}

.cue-card span,
.cue-card small {
  display: block;
  color: #76838e;
  font-size: 10px;
}

.cue-card strong {
  display: block;
  margin: 6px 0;
  font-size: 13px;
}

@media (max-width: 1080px) {
  .work-grid {
    grid-template-columns: 1fr;
  }

  .editor-panel {
    max-height: none;
  }
}

@media (max-width: 760px) {
  .toolbar {
    align-items: stretch;
    flex-direction: column;
  }

  .toolbar > :nth-last-child(2) {
    margin-left: 0;
  }

  .form-grid {
    grid-template-columns: 1fr;
  }
}
</style>
