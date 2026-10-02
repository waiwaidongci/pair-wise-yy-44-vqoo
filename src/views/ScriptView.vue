<script setup lang="ts">
import { computed, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { useWorkshopStore, type Cue, type TimelineEventType } from '../stores/workshop'

const store = useWorkshopStore()
const query = ref('')
const selectedAct = ref('全部')
const acts = computed(() => ['全部', ...new Set(store.cues.map((cue) => cue.act))])
const script = computed(() =>
  [...store.cues]
    .filter((cue) => selectedAct.value === '全部' || cue.act === selectedAct.value)
    .filter((cue) => `${cue.title}${cue.owner}${cue.note}`.includes(query.value))
    .sort((a, b) => a.time.localeCompare(b.time)),
)

const timelineMeta: Record<TimelineEventType, { label: string; type: 'success' | 'warning' | 'info' | 'danger' }> = {
  confirm: { label: '确认', type: 'success' },
  review: { label: '待复核', type: 'danger' },
  sync: { label: '同步', type: 'success' },
  conflict: { label: '冲突', type: 'warning' },
  failure: { label: '失败', type: 'danger' },
  retry: { label: '重试', type: 'info' },
  refetch: { label: '取版', type: 'info' },
  checkpoint: { label: '检查点', type: 'success' },
}

function cueLabel(cue: Cue): string {
  return cue.dirty ? '待复核' : cue.status
}

function cueTagType(cue: Cue): 'success' | 'warning' | 'info' | 'danger' {
  if (cue.dirty) return 'danger'
  if (cue.status === '已确认') return 'success'
  if (cue.status === '待确认') return 'warning'
  return 'info'
}

function confirmCue(id: string) {
  store.selectedId = id
  store.confirmCue(id)
  ElMessage.success(`${id} 已确认并并入基线`)
}

function lock() {
  store.lockBaseline()
  ElMessage.success('演出基线已锁定，后续修改将从新分支开始')
}

function formatTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
}
</script>

<template>
  <section class="page">
    <div class="page-head">
      <div>
        <p class="eyebrow">REHEARSAL / 排练脚本</p>
        <h1>按时间顺序编排排练</h1>
        <p class="muted">提示与走位按时间码串联；依据变更会联动复核，复核完成前不能打印。</p>
      </div>
      <div class="actions">
        <el-button :disabled="store.locked" @click="lock">锁定演出基线</el-button>
        <el-button v-if="store.locked" type="warning" plain @click="store.unlockBaseline">解锁修订</el-button>
        <el-button type="primary" @click="$router.push('/print')">生成执行清单</el-button>
      </div>
    </div>

    <div class="panel script-toolbar">
      <el-input v-model="query" clearable placeholder="搜索提示、角色或说明" style="max-width: 320px" />
      <el-segmented v-model="selectedAct" :options="acts" />
      <div class="baseline-status">
        <span class="status-dot" :style="{ background: store.pendingReviewCount ? '#cf5b3f' : '#41936b' }" />
        {{ store.pendingReviewCount ? `${store.pendingReviewCount} 项待复核` : store.locked ? `基线 ${store.revision} 已锁定` : `${store.revision} · 全部依据有效` }}
      </div>
    </div>

    <div class="script-layout">
      <section class="timeline">
        <article v-for="(cue, index) in script" :key="cue.id" class="timeline-item">
          <div class="time-column">
            <strong>{{ cue.time }}</strong>
            <span>{{ cue.duration }}s</span>
          </div>
          <div class="timeline-rail">
            <i />
            <b v-if="index < script.length - 1" />
          </div>
          <div class="script-card panel" :class="{ dirty: cue.dirty }">
            <div class="script-card-head">
              <div>
                <span>{{ cue.id }} · {{ cue.act }} / {{ cue.scene }} · v{{ cue.version }}</span>
                <h3>{{ cue.title }}</h3>
              </div>
              <el-tag :type="cueTagType(cue)" effect="plain">{{ cueLabel(cue) }}</el-tag>
            </div>
            <p>{{ cue.note || '暂无补充说明' }}</p>
            <div v-if="cue.dirty" class="review-note">
              <strong>待复核：</strong>{{ cue.reviewReason }}
              <span v-if="cue.affectedBy.length">（受 {{ cue.affectedBy.join('、') }} 影响）</span>
            </div>
            <div class="script-meta">
              <span>责任：{{ cue.owner }}</span>
              <span>部门：{{ cue.department }}</span>
              <span>路线：{{ cue.route.length }} 节点</span>
              <span v-if="cue.basis">依据：{{ cue.basis.time }} / {{ cue.basis.department }}</span>
              <span v-if="cue.comments.length">留言：{{ cue.comments.length }}</span>
            </div>
            <div class="script-actions">
              <el-button size="small" @click="store.selectedId = cue.id; $router.push('/stage')">编辑走位</el-button>
              <el-button size="small" type="primary" plain @click="confirmCue(cue.id)">
                {{ cue.dirty ? '重新确认' : cue.status === '已确认' ? '更新确认' : '确认节点' }}
              </el-button>
              <span v-if="cue.status === '已确认' && !cue.dirty" class="confirmed">已纳入 {{ store.revision }}</span>
            </div>
          </div>
        </article>
      </section>

      <aside class="panel version-panel">
        <div class="panel-head">
          <h3>协同时间线</h3>
          <span class="muted">原因留痕</span>
        </div>

        <div class="checkpoint-card">
          <div>
            <span>最后确认点</span>
            <strong>{{ store.lastCheckpoint }}</strong>
          </div>
          <el-button size="small" :loading="store.syncing" @click="store.retrySync">从确认点重试</el-button>
        </div>

        <div class="version-list">
          <div v-for="event in store.timeline" :key="event.id" class="version" :class="event.type">
            <div class="version-head">
              <el-tag size="small" :type="timelineMeta[event.type].type" effect="plain">{{ timelineMeta[event.type].label }}</el-tag>
              <time>{{ formatTime(event.time) }}</time>
            </div>
            <strong>{{ event.message }}</strong>
            <small v-if="event.reason">{{ event.reason }}</small>
            <el-button
              v-if="event.type === 'failure'"
              link
              type="primary"
              size="small"
              class="retry-btn"
              @click="store.retrySync"
            >重试</el-button>
          </div>
          <el-empty v-if="store.timeline.length === 0" description="暂无协同记录" :image-size="46" />
        </div>
        <div class="version-actions">
          <el-button :disabled="!store.canUndo" @click="store.undo">回退上一步</el-button>
          <el-button :disabled="!store.canRedo" @click="store.redo">恢复修改</el-button>
        </div>
      </aside>
    </div>
  </section>
</template>

<style scoped>
.script-toolbar {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 18px;
  padding: 12px 14px;
}

.baseline-status {
  margin-left: auto;
  color: #5e6d79;
  font-size: 12px;
}

.script-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 300px;
  gap: 18px;
}

.timeline {
  display: grid;
}

.timeline-item {
  display: grid;
  grid-template-columns: 74px 22px minmax(0, 1fr);
}

.time-column {
  padding-top: 14px;
  text-align: right;
}

.time-column strong,
.time-column span {
  display: block;
}

.time-column strong {
  color: #176d6c;
  font-family: ui-monospace, monospace;
  font-size: 13px;
}

.time-column span {
  margin-top: 4px;
  color: #8b969e;
  font-size: 10px;
}

.timeline-rail {
  position: relative;
}

.timeline-rail i {
  position: absolute;
  z-index: 2;
  top: 21px;
  left: 8px;
  width: 7px;
  height: 7px;
  border: 2px solid #fff;
  border-radius: 50%;
  background: #2d8681;
  box-shadow: 0 0 0 1px #2d8681;
}

.timeline-rail b {
  position: absolute;
  top: 29px;
  bottom: -1px;
  left: 11px;
  width: 1px;
  background: #cbd6da;
}

.script-card {
  margin-bottom: 10px;
  padding: 13px;
}

.script-card.dirty {
  border-left: 3px solid #cf5b3f;
  background: #fdf6f4;
}

.script-card-head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
}

.script-card-head span {
  color: #71808b;
  font-size: 11px;
}

.script-card h3 {
  margin: 5px 0 0;
  font-size: 15px;
}

.script-card > p {
  margin: 11px 0;
  color: #55636e;
  font-size: 13px;
  line-height: 1.6;
}

.review-note {
  margin: -4px 0 10px;
  padding: 7px 10px;
  border-radius: 5px;
  color: #8c2a1f;
  background: #fbeae7;
  font-size: 12px;
}

.script-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 14px;
  color: #7a8791;
  font-size: 11px;
}

.script-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 12px;
}

.confirmed {
  color: #34805e;
  font-size: 11px;
}

.version-panel {
  align-self: start;
}

.checkpoint-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin: 12px;
  padding: 11px 12px;
  border: 1px solid #d8e3e1;
  border-radius: 7px;
  background: #f2f8f7;
}

.checkpoint-card span {
  color: #6b7883;
  font-size: 11px;
}

.checkpoint-card strong {
  display: block;
  margin-top: 2px;
  color: #176d6c;
  font-size: 16px;
}

.version-list {
  display: grid;
  gap: 8px;
  max-height: 420px;
  overflow: auto;
  padding: 0 12px 12px;
}

.version {
  padding: 10px 11px;
  border: 1px solid #e6ebed;
  border-left: 3px solid #cdd7db;
  border-radius: 6px;
  background: #fbfcfc;
}

.version.failure {
  border-left-color: #cf5b3f;
  background: #fdf6f4;
}

.version.conflict {
  border-left-color: #d8912d;
  background: #fdf8ee;
}

.version.review {
  border-left-color: #b03a2e;
}

.version.sync,
.version.confirm,
.version.checkpoint {
  border-left-color: #3f9d78;
}

.version-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.version-head time {
  color: #8a959d;
  font-size: 10px;
}

.version strong {
  display: block;
  margin: 6px 0 3px;
  color: #183845;
  font-size: 13px;
}

.version small {
  display: block;
  color: #8a959d;
  font-size: 11px;
  line-height: 1.5;
}

.retry-btn {
  margin-top: 6px;
}

.version-actions {
  display: grid;
  gap: 8px;
  padding: 10px 12px;
}

@media (max-width: 900px) {
  .script-layout {
    grid-template-columns: 1fr;
  }

  .version-panel {
    order: -1;
  }
}

@media (max-width: 680px) {
  .script-toolbar {
    align-items: stretch;
    flex-direction: column;
  }

  .baseline-status {
    margin-left: 0;
  }

  .timeline-item {
    grid-template-columns: 58px 16px minmax(0, 1fr);
  }

  .timeline-rail i {
    left: 5px;
  }

  .timeline-rail b {
    left: 8px;
  }
}
</style>
