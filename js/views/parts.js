// 複数の画面で使う部品
import { h, icon, toast, taskBadge } from '../ui.js';
import { getState, update, memberName, findCase, nextId } from '../store.js';
import { templateTasks } from '../templates.js';
import * as L from '../logic.js';

export const today = () => L.todayISO();

// スタッフの充足（確定 2 / 必要 4・不足 2）。色だけでなく「不足」の文字で知らせる
export function staffFill(c) {
  const { confirmed, requested } = L.staffCounts(c);
  const short = L.staffShortage(c);
  return h('span', { class: 'fill num' },
    h('span', null, `確定 ${confirmed}`),
    h('span', { class: 'of' }, `/ 必要 ${c.requiredStaff == null ? '未入力' : c.requiredStaff}`),
    short > 0 ? h('span', { class: 'warn' }, icon('alert'), `不足${short}`) : null,
    requested > 0 ? h('span', { class: 'cell-sub' }, `依頼中 ${requested}`) : null);
}

export function dueText(due, t) {
  const now = today();
  if (!L.isOpenTask(t)) return h('span', null, `${L.formatDate(due)}・完了`);
  const overdue = due < now;
  return h('span', { class: overdue ? 'warn' : '' },
    overdue ? icon('alert') : null,
    `${L.formatDate(due)}・${L.dueLabel(due, now)}`);
}

export function nextTaskCell(caseId) {
  const t = L.nextTaskOf(getState().tasks, caseId);
  if (!t) return h('span', { class: 'cell-muted' }, 'なし');
  return h('span', null, t.title, h('span', { class: 'cell-sub' }, dueText(t.due, t)));
}

// 1行で書く次のタスク（次のタスク: 見積書を送る・9/22（火）2日超過）
export function nextTaskInline(caseId) {
  const t = L.nextTaskOf(getState().tasks, caseId);
  if (!t) return h('span', null, '次のタスク: なし');
  const now = today();
  const overdue = t.due < now;
  return h('span', null, `次のタスク: ${t.title}・`,
    h('span', { class: overdue ? 'warn' : '' }, overdue ? icon('alert') : null, `${L.formatDateShort(t.due)} ${L.dueLabel(t.due, now)}`));
}

export function toggleTask(t) {
  const done = t.status !== '完了';
  update((s) => {
    const x = s.tasks.find((y) => y.id === t.id);
    if (x) x.status = done ? '完了' : '未着手';
  });
  toast(done ? `「${t.title}」を完了にしました` : `「${t.title}」を未着手に戻しました`);
}

export function checkButton(t) {
  const done = t.status === '完了';
  return h('button', {
    type: 'button', class: 'check-btn', 'aria-pressed': String(done), id: 'chk-' + t.id,
    'aria-label': done ? `「${t.title}」を未着手に戻す` : `「${t.title}」を完了にする`,
    onclick: () => toggleTask(t),
  }, h('span', { class: 'box' }, icon('check')));
}

// タスクの1行（ダッシュボード・案件詳細）
export function taskRow(t, { showCase = true } = {}) {
  const c = showCase ? findCase(t.caseId) : null;
  return h('li', { class: t.status === '完了' ? 'is-done' : '' },
    checkButton(t),
    h('div', { class: 'row-main' },
      h('p', { class: 'row-title' }, t.title),
      h('p', { class: 'row-meta' },
        dueText(t.due, t),
        h('span', null, '担当 ' + memberName(t.assigneeId)),
        c ? h('a', { href: '#/cases/' + c.id }, c.name) : null)),
    h('div', { class: 'row-side' }, taskBadge(t.status)));
}

export function memberOptions(withEmpty) {
  const opts = getState().members.map((m) => [m.id, m.name]);
  return withEmpty ? [['', withEmpty], ...opts] : opts;
}

// 定型タスクを作る（R-28）。update の中で使う。同じ名前のタスクは重ねて作らない。作った数を返す
export function addTemplateTasks(st, c, { skip = [] } = {}) {
  const off = [...(st.settings?.templatesOff || []), ...skip];
  const made = templateTasks(c.status, c, L.todayISO(), st.tasks, off);
  for (const t of made) st.tasks.push({ id: nextId('t'), caseId: c.id, title: t.title, due: t.due, status: '未着手', assigneeId: c.ownerId });
  return made.length;
}

// スタッフ画面の上のタブ（一覧・シフト表）
export function staffTabs(active) {
  const tab = (key, href, label) => h('a', { class: 'subtab', href, 'aria-current': active === key ? 'page' : null }, label);
  return h('nav', { class: 'subtabs', 'aria-label': 'スタッフの画面' }, tab('list', '#/staff', 'スタッフ一覧'), tab('shifts', '#/shifts', 'シフト表'));
}

// 文字をファイルとして書き出す（画面の中だけで作る。外へは送らない）
export function downloadText(filename, text, mime = 'text/csv;charset=utf-8') {
  const safe = filename.replace(/[\\/:*?"<>|\s]+/g, '_');
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement('a');
  a.href = url; a.download = safe;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  toast(`「${safe}」を書き出しました`);
}

export async function copyText(text, okMessage = 'コピーしました') {
  try {
    if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text);
    else {
      const ta = document.createElement('textarea');
      ta.value = text; document.body.append(ta); ta.select();
      const ok = document.execCommand('copy'); ta.remove();
      if (!ok) throw new Error('copy');
    }
    toast(okMessage);
  } catch {
    toast('コピーできませんでした。CSVで書き出してください');
  }
}
