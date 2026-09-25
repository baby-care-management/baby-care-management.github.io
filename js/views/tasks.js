// タスク（R-08）
import { h, pageHead, panel, empty, icon, field, input, select, clear, button, openDialog, toast, statusBadge } from '../ui.js';
import { getState, update, memberName, findCase, nextId } from '../store.js';
import * as L from '../logic.js';
import { today, dueText, checkButton, memberOptions } from './parts.js';
import { TASK_TEMPLATES } from '../templates.js';

const filters = { status: 'open', assignee: '', due: '' };

function syncUrl() {
  const p = new URLSearchParams();
  if (filters.status !== 'open') p.set('status', filters.status || 'all');
  if (filters.assignee) p.set('assignee', filters.assignee);
  if (filters.due) p.set('due', filters.due);
  const qs = p.toString();
  history.replaceState(null, '', '#/tasks' + (qs ? '?' + qs : ''));
}

export function render({ query }) {
  const st = query.get('status');
  filters.status = st === 'all' ? '' : st || 'open';
  filters.assignee = query.get('assignee') || '';
  filters.due = query.get('due') || '';
  // 期限切れで開いたときは、未完了だけにそろえる
  if (filters.due === 'overdue') filters.status = 'open';

  const results = h('div');
  const countEl = h('p', { class: 'result-count', role: 'status' });
  const redraw = () => renderResults(results, countEl);
  const onChange = (key) => (e) => { filters[key] = e.target.value; syncUrl(); redraw(); };

  const box = h('div', null,
    pageHead({
      title: 'タスク',
      lead: 'すべての案件のタスクを、期限の近い順に並べています。期限を過ぎたものは赤い文字と印で出ます。',
      actions: [button('タスクを登録', { kind: 'primary', iconName: 'plus', onClick: () => openTaskDialog() }), button('定型タスクの設定', { iconName: 'edit', onClick: () => openTemplateDialog() })],
    }),
    panel({
      id: 'tasks',
      body: [
        h('div', { class: 'filters' },
          field('ステータス', select('status', [['open', '未完了のみ'], ['', 'すべて'], ...L.TASK_STATUSES], filters.status, { onchange: onChange('status') })),
          field('担当者', select('assignee', memberOptions('すべての担当者'), filters.assignee, { onchange: onChange('assignee') })),
          field('期限', select('due', L.DUE_FILTERS.map((d) => [d.key, d.label]), filters.due, { onchange: onChange('due') })),
          countEl),
        results,
      ],
    }));
  redraw();
  return box;
}

function renderResults(container, countEl) {
  const s = getState();
  const now = today();
  const list = L.sortTasks(L.filterTasks(s.tasks, filters, now));
  countEl.textContent = `${list.length}件 / 全${s.tasks.length}件`;
  clear(container);
  if (!list.length) {
    container.append(empty('条件に合うタスクはありません', '絞り込みを「すべて」に戻すと、終わったタスクも出ます。'));
    return;
  }
  container.append(h('div', { class: 'table-wrap' }, h('table', { class: 'data-table stack' },
    h('caption', { class: 'visually-hidden' }, 'タスクの一覧'),
    h('thead', null, h('tr', null,
      h('th', { scope: 'col' }, h('span', { class: 'visually-hidden' }, '完了')),
      h('th', { scope: 'col' }, 'タスク名'), h('th', { scope: 'col' }, '期限'), h('th', { scope: 'col' }, '担当者'),
      h('th', { scope: 'col' }, 'ステータス'), h('th', { scope: 'col' }, '関連案件'))),
    h('tbody', null, list.map((t) => {
      const c = findCase(t.caseId);
      return h('tr', { class: t.status === '完了' ? 'is-done' : '' },
        h('td', { class: 'cell-check' }, checkButton(t)),
        h('td', { class: 'cell-title' }, h('span', { class: 'row-title' }, t.title)),
        h('td', { 'data-label': '期限', class: 'nowrap' }, dueText(t.due, t)),
        h('td', { 'data-label': '担当者', class: 'nowrap' }, memberName(t.assigneeId)),
        h('td', { 'data-label': 'ステータス' }, statusSelect(t)),
        h('td', { 'data-label': '関連案件' }, c
          ? [h('a', { href: '#/cases/' + c.id }, c.name), h('span', { class: 'cell-sub' }, statusBadge(c.status))]
          : h('span', { class: 'cell-muted' }, 'なし')));
    })))));
}

export function statusSelect(t) {
  return select('task-status', L.TASK_STATUSES, t.status, {
    class: 'inline-select', id: 'st-' + t.id, 'aria-label': `「${t.title}」のステータス`,
    onchange: (e) => {
      const v = e.target.value;
      update((s) => { const x = s.tasks.find((y) => y.id === t.id); if (x) x.status = v; });
      toast(`「${t.title}」を${v}にしました`);
    },
  });
}

// タスクを登録する（案件詳細からは caseId を決めて開く）
export function openTaskDialog({ caseId = '' } = {}) {
  const s = getState();
  const caseOpts = [['', '案件なし'], ...L.sortCases(s.cases).map((c) => [c.id, `${L.formatDate(c.date)} ${c.name}`])];
  const defaultOwner = caseId ? findCase(caseId)?.ownerId : s.members[0].id;
  openDialog({
    title: 'タスクを登録',
    submitLabel: '登録する',
    body: h('div', { class: 'form-grid' },
      field('タスク名', input('title', '', { maxlength: L.LIMITS.name, placeholder: '例: 見積書を送る' }), { required: true, cls: 'span-2' }),
      field('期限', input('due', L.addDays(today(), 1), { type: 'date' }), { required: true }),
      field('担当者', select('assigneeId', memberOptions(), defaultOwner), { required: true }),
      field('ステータス', select('status', L.TASK_STATUSES, '未着手')),
      field('関連案件', select('caseId', caseOpts, caseId), { cls: 'span-2' })),
    onSubmit: (form) => {
      const v = {
        title: form.elements.title.value.trim(),
        due: form.elements.due.value,
        assigneeId: form.elements.assigneeId.value,
        status: form.elements.status.value,
        caseId: form.elements.caseId.value,
      };
      const errors = L.validateTask(v);
      if (Object.keys(errors).length) return errors;
      update((st) => { st.tasks.push({ id: nextId('t'), ...v }); });
      toast(`タスク「${v.title}」を登録しました`);
      return null;
    },
  });
}


// 定型タスクの設定（R-28）。ステータスを進めたときに作られるタスクを、1つずつ「使う・使わない」にする
function timingText(t) {
  const d = Math.abs(t.days);
  return t.base === 'event' ? `開催日の${d}日前` : t.days === 0 ? '進めた日' : `進めた日から${d}日後`;
}
export function openTemplateDialog() {
  const off = new Set(getState().settings.templatesOff);
  const groups = [...new Set(TASK_TEMPLATES.map((t) => t.status))];
  openDialog({
    title: '定型タスクの設定',
    lead: '案件のステータスを進めると、ここで「使う」にしたタスクが、期限と担当者（案件の担当者）つきで作られます。同じ名前のタスクは、重ねて作りません。',
    submitLabel: '保存する',
    wide: true,
    body: h('div', null, groups.map((g) => h('fieldset', { class: 'field fieldset tpl-group' }, h('legend', null, `「${g}」に進めたとき`),
      TASK_TEMPLATES.filter((t) => t.status === g).map((t) => h('label', { class: 'check-line', for: `tpl-${t.key}` },
        h('input', { type: 'checkbox', name: t.key, id: `tpl-${t.key}`, checked: !off.has(t.key) }),
        h('span', null, t.title, h('span', { class: 'row-note' }, `期限: ${timingText(t)}`))))))),
    onSubmit: (form) => {
      const offNow = TASK_TEMPLATES.filter((t) => !form.elements.namedItem(t.key).checked).map((t) => t.key);
      update((s) => { s.settings.templatesOff = offNow; });
      toast(offNow.length ? `定型タスクを保存しました（使わない: ${offNow.length}件）` : '定型タスクを保存しました（すべて使う）');
      return null;
    },
  });
}
