// 画面の切り替え（# のうしろで画面を決める）と、全体の枠
import { APP_VERSION } from './config.js';
import { h, clear, icon, confirmDialog, toast } from './ui.js';
import { load, subscribe, reset, currentError, getState } from './store.js';
import { kpis, todayISO } from './logic.js';
import * as dashboard from './views/dashboard.js';
import * as cases from './views/cases.js';
import * as caseDetail from './views/case-detail.js';
import * as tasks from './views/tasks.js';
import * as staff from './views/staff.js';
import * as shifts from './views/shifts.js';
import * as records from './views/records.js';
import * as assistant from './views/assistant.js';

const NAV = [
  { key: 'home', href: '#/', label: 'ダッシュボード', short: 'ホーム', icon: 'home' },
  { key: 'cases', href: '#/cases', label: '案件', short: '案件', icon: 'cases' },
  { key: 'tasks', href: '#/tasks', label: 'タスク', short: 'タスク', icon: 'tasks' },
  { key: 'staff', href: '#/staff', label: 'スタッフ', short: 'スタッフ', icon: 'staff' },
  { key: 'records', href: '#/records', label: '実績', short: '実績', icon: 'records' },
  { key: 'assistant', href: '#/assistant', label: 'AIアシスタント', short: 'AI支援', icon: 'assistant' },
];

const ROUTES = [
  { re: /^$/, view: dashboard, nav: 'home' },
  { re: /^cases$/, view: cases, nav: 'cases' },
  { re: /^cases\/([\w-]+)$/, view: caseDetail, nav: 'cases' },
  { re: /^tasks$/, view: tasks, nav: 'tasks' },
  { re: /^staff$/, view: staff, nav: 'staff' },
  { re: /^staff\/([\w-]+)$/, view: staff, nav: 'staff' },
  { re: /^shifts$/, view: shifts, nav: 'staff' },
  { re: /^records$/, view: records, nav: 'records' },
  { re: /^assistant$/, view: assistant, nav: 'assistant' },
];

function parseHash() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [path = '', qs = ''] = raw.split('?');
  return { path: path.replace(/\/$/, ''), query: new URLSearchParams(qs) };
}

function buildNav() {
  const side = document.getElementById('side-nav');
  const tab = document.getElementById('tabbar');
  clear(side).append(h('ul', null, NAV.map((n) =>
    h('li', null, h('a', { class: 'nav-link', href: n.href, dataset: { nav: n.key } }, icon(n.icon), h('span', null, n.label),
      n.key === 'tasks' ? h('span', { class: 'nav-count', id: 'nav-overdue' }) : null)))));
  clear(tab).append(h('ul', null, NAV.map((n) =>
    h('li', null, h('a', { class: 'tab-link', href: n.href, dataset: { nav: n.key }, 'aria-label': n.label, id: 'tab-' + n.key }, icon(n.icon), h('span', { 'aria-hidden': 'true' }, n.short),
      n.key === 'tasks' ? h('span', { class: 'tab-count', id: 'tab-overdue', 'aria-hidden': 'true' }) : null)))));
}

// メニューに期限切れのタスクの数を出す（0 のときは出さない）
function updateNavCounts() {
  const n = kpis(getState(), todayISO()).overdueTasks;
  const text = n ? String(n) : '';
  document.getElementById('nav-overdue').textContent = text;
  document.getElementById('tab-overdue').textContent = text;
  const label = n ? `期限切れ ${n}件` : '';
  document.getElementById('nav-overdue').setAttribute('aria-label', label);
  document.getElementById('tab-tasks').setAttribute('aria-label', n ? `タスク（${label}）` : 'タスク');
}

function markNav(key) {
  for (const a of document.querySelectorAll('[data-nav]')) {
    if (a.dataset.nav === key) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }
}

let current = null;   // { route, params, query }

function render({ keepScroll = false } = {}) {
  const main = document.getElementById('main');
  const { path, query } = parseHash();
  let route = null;
  let params = [];
  for (const r of ROUTES) {
    const m = path.match(r.re);
    if (m) { route = r; params = m.slice(1); break; }
  }
  const scrollY = window.scrollY;
  const focusedId = document.activeElement && main.contains(document.activeElement) ? document.activeElement.id : null;
  clear(main);
  if (!route) {
    main.append(h('div', { class: 'empty' },
      h('strong', null, 'この画面は見つかりません'),
      h('span', null, 'URL がまちがっているか、消えた画面です。'),
      h('p', null, h('a', { href: '#/' }, 'ダッシュボードへ戻る'))));
    markNav(null);
    document.title = '見つかりません｜託児運営管理（デモ）';
    return;
  }
  const isNewPage = !current || current.route !== route || current.params.join('/') !== params.join('/');
  current = { route, params, query };
  const node = route.view.render({ params, query, isNew: isNewPage, refresh: () => render({ keepScroll: true }) });
  const err = currentError();
  if (err) main.append(h('p', { class: 'notice is-danger', role: 'alert' }, icon('alert'), h('span', null, err)));
  main.append(node);
  markNav(route.nav);
  updateNavCounts();
  const title = main.querySelector('h1');
  document.title = (title ? title.textContent + '｜' : '') + '託児運営管理（デモ）';
  if (keepScroll || !isNewPage) {
    window.scrollTo(0, scrollY);
    if (focusedId) document.getElementById(focusedId)?.focus();
  } else {
    window.scrollTo(0, 0);
    if (title) title.focus({ preventScroll: true });
  }
}

export function refresh() { render({ keepScroll: true }); }

function init() {
  load();
  buildNav();
  subscribe(() => render({ keepScroll: true }));
  for (const b of document.querySelectorAll('[data-action="reset"]')) {
    b.addEventListener('click', () => confirmDialog({
      title: 'サンプルデータに戻しますか',
      message: 'このタブで登録・変更した内容はすべて消え、最初のサンプルの状態に戻ります。元には戻せません。',
      okLabel: 'サンプルに戻す',
      onOk: () => { reset(); location.hash = '#/'; toast('サンプルデータに戻しました'); },
    }));
  }
  document.getElementById('version').textContent = '版 ' + APP_VERSION;
  document.getElementById('skip').addEventListener('click', (e) => {
    e.preventDefault();
    const t = document.getElementById('page-title') || document.getElementById('main');
    t.focus();
  });
  window.addEventListener('hashchange', () => render());
  render();
}

init();
