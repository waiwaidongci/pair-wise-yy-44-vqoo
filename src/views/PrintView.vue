<script setup lang="ts">
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { useWorkshopStore } from '../stores/workshop'

const store = useWorkshopStore()
const includeNotes = ref(true)
const includeRoutes = ref(true)
const includeComments = ref(false)

function cueLabel(status: string, dirty: boolean): string {
  return dirty ? '待复核' : status
}

function print() {
  if (!store.canPrint) {
    ElMessage.warning('尚有提示待复核，复核完成前不能打印')
    return
  }
  window.print()
}

function exportCsv() {
  if (!store.canPrint) {
    ElMessage.warning('尚有提示待复核，复核完成前不能导出')
    return
  }
  const rows = [
    ['编号', '时间码', '场景', '提示', '部门', '责任', '路线节点', '状态'],
    ...store.cues.map((cue) => [
      cue.id,
      cue.time,
      `${cue.act}/${cue.scene}`,
      cue.title,
      cue.department,
      cue.owner,
      cue.route.map((point) => `${point.x},${point.y}`).join(' > '),
      cueLabel(cue.status, cue.dirty),
    ]),
  ]
  const csv = `﻿${rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(',')).join('\n')}`
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `潮汐来信-走位表-${store.revision}.csv`
  link.click()
  URL.revokeObjectURL(url)
  ElMessage.success('走位表已导出')
}
</script>

<template>
  <section class="page print-page">
    <div class="page-head no-print">
      <div>
        <p class="eyebrow">PRINT / 演出文档</p>
        <h1>走位表与执行清单</h1>
        <p class="muted">打印版仅包含已选信息，固定 A4 横向布局，适合舞台监督工作台使用。</p>
      </div>
      <div class="actions">
        <el-button @click="exportCsv">导出 CSV</el-button>
        <el-button type="primary" :disabled="!store.canPrint" @click="print">打印 / 导出 PDF</el-button>
      </div>
    </div>

    <el-alert
      v-if="!store.canPrint"
      class="print-guard no-print"
      type="error"
      show-icon
      :closable="false"
      title="复核未完成，不能打印下一场"
      :description="`当前有 ${store.pendingReviewCount} 项提示待复核（${store.blockingScenes.join('、')}）。走位、道具或灯光音响提示变更后，受影响提示须退回待复核并重新确认，锁定节点保留原依据。`"
    >
      <div class="guard-actions">
        <el-button size="small" type="primary" @click="$router.push('/script')">前往复核</el-button>
        <el-button size="small" @click="$router.push('/stage')">返回舞台走位</el-button>
      </div>
    </el-alert>

    <div class="print-options panel no-print">
      <strong>文档内容</strong>
      <el-checkbox v-model="includeNotes">执行说明</el-checkbox>
      <el-checkbox v-model="includeRoutes">路线坐标</el-checkbox>
      <el-checkbox v-model="includeComments">未解决留言</el-checkbox>
      <span class="print-revision">版本 {{ store.revision }} · 生成于 {{ new Date().toLocaleString('zh-CN') }}</span>
    </div>

    <article class="print-sheet" :class="{ locked: !store.canPrint }">
      <header class="sheet-head">
        <div>
          <span>远岸剧团 · STAGE MANAGEMENT</span>
          <h2>《潮汐来信》执行清单</h2>
        </div>
        <dl>
          <div><dt>排练日</dt><dd>2026-10-08</dd></div>
          <div><dt>版本</dt><dd>{{ store.revision }}</dd></div>
          <div><dt>场地</dt><dd>上海大剧院 · 大剧场</dd></div>
        </dl>
      </header>

      <table>
        <thead>
          <tr>
            <th>时间码</th>
            <th>幕 / 场</th>
            <th>执行提示</th>
            <th>部门 / 责任</th>
            <th>时长</th>
            <th>状态</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="cue in [...store.cues].sort((a, b) => a.time.localeCompare(b.time))" :key="cue.id" :class="{ dirty: cue.dirty }">
            <td class="mono">{{ cue.time }}</td>
            <td>{{ cue.act }} / {{ cue.scene }}</td>
            <td>
              <strong>{{ cue.id }} · {{ cue.title }}</strong>
              <p v-if="includeNotes">{{ cue.note }}</p>
              <small v-if="includeRoutes">路线：{{ cue.route.map((point, index) => `${index + 1}. ${point.x}/${point.y}`).join(' → ') }}</small>
              <em v-if="includeComments && cue.comments.length">{{ cue.comments.filter((item) => !item.resolved).length }} 条未解决留言</em>
            </td>
            <td>{{ cue.department }}<br /><small>{{ cue.owner }}</small></td>
            <td>{{ cue.duration }} 秒</td>
            <td>
              <el-tag v-if="cue.dirty" type="danger" size="small" effect="plain">待复核</el-tag>
              <span v-else>{{ cue.status }}</span>
            </td>
          </tr>
        </tbody>
      </table>

      <footer class="sheet-foot">
        <span>舞台监督：________________</span>
        <span>技术总监：________________</span>
        <span>制作人：________________</span>
      </footer>
    </article>
  </section>
</template>

<style scoped>
.print-page {
  background: #e8ecee;
}

.print-guard {
  margin-bottom: 14px;
}

.guard-actions {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}

.print-options {
  display: flex;
  align-items: center;
  gap: 18px;
  margin-bottom: 14px;
  padding: 12px 15px;
}

.print-revision {
  margin-left: auto;
  color: #74818c;
  font-size: 12px;
}

.print-sheet {
  max-width: 1180px;
  min-height: 600px;
  margin: 0 auto;
  padding: 34px;
  background: #fff;
  box-shadow: 0 12px 34px rgb(35 54 65 / 12%);
}

.print-sheet.locked {
  opacity: 0.92;
}

.sheet-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24px;
  padding-bottom: 18px;
  border-bottom: 3px solid #173846;
}

.sheet-head span {
  color: #697985;
  font-size: 10px;
  letter-spacing: 0.15em;
}

.sheet-head h2 {
  margin: 8px 0 0;
  font-size: 25px;
}

.sheet-head dl {
  display: flex;
  gap: 22px;
  margin: 0;
}

.sheet-head dt {
  color: #818c95;
  font-size: 10px;
}

.sheet-head dd {
  margin: 4px 0 0;
  font-size: 12px;
  font-weight: 700;
}

table {
  width: 100%;
  margin-top: 20px;
  border-collapse: collapse;
  font-size: 12px;
}

th {
  padding: 10px 8px;
  color: #fff;
  text-align: left;
  background: #1c4251;
}

td {
  padding: 11px 8px;
  border-bottom: 1px solid #dfe5e8;
  vertical-align: top;
}

td strong,
td small,
td em {
  display: block;
}

td p {
  margin: 5px 0 0;
  color: #56636d;
  line-height: 1.5;
}

td small {
  margin-top: 6px;
  color: #7e8991;
}

td em {
  margin-top: 5px;
  color: #b05a2b;
  font-style: normal;
}

.mono {
  color: #1d7371;
  font-family: ui-monospace, monospace;
  font-weight: 700;
}

tr.dirty td {
  background: #fdf3f1;
}

.sheet-foot {
  display: flex;
  justify-content: space-between;
  margin-top: 48px;
  padding-top: 14px;
  border-top: 1px solid #dce2e5;
  color: #69757e;
  font-size: 11px;
}

@media print {
  @page {
    size: A4 landscape;
    margin: 12mm;
  }

  .no-print {
    display: none !important;
  }

  .print-page {
    padding: 0;
    background: #fff;
  }

  .print-sheet {
    max-width: none;
    padding: 0;
    box-shadow: none;
  }

  th {
    color: #111;
    background: #e8ecee;
  }
}

@media (max-width: 760px) {
  .print-options {
    align-items: flex-start;
    flex-direction: column;
  }

  .print-revision {
    margin-left: 0;
  }

  .print-sheet {
    overflow-x: auto;
    padding: 18px;
  }

  .sheet-head {
    flex-direction: column;
  }

  .sheet-head dl {
    flex-wrap: wrap;
  }
}
</style>
