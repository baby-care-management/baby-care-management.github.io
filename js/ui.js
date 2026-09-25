// 画面の部品。値は textContent で入れ、innerHTML は使わない（S-18・S-19）
import { statusTone } from './logic.js';

export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  setProps(el, props);
  append(el, children);
  return el;
}

function setProps(el, props) {
  if (!props) return;
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (typeof v !== 'string' && k in el) el[k] = v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
}

export function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : String(c));
  }
  return el;
}

export function clear(el) {
  while (el.firstChild) el.firstChild.remove();
  return el;
}

// ---------- アイコン（線 1.75・角丸。D-15） ----------
const SVG_NS = 'http://www.w3.org/2000/svg';
const ICONS = {
  home: ['M3.5 10.5 12 3.5l8.5 7', 'M5.5 9v11h4.5v-6h4v6h4.5V9'],
  cases: ['M3 7.5A1.5 1.5 0 0 1 4.5 6H9l2 2h8.5A1.5 1.5 0 0 1 21 9.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5z'],
  tasks: ['M4.5 4.5h15v15h-15z', 'm8.5 12 2.5 2.5 4.5-5'],
  staff: ['M9 11.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7', 'M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6', 'M16 4.8a3.2 3.2 0 0 1 0 6.2', 'M18 14.3c2 .7 3.5 2.7 3.5 5.7'],
  records: ['M9 3.5h6v3H9z', 'M9 5H6a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1h-3', 'M8.5 11.5h7', 'M8.5 15.5h4.5'],
  assistant: ['M4 5h16v11H10l-4.5 3.5V16H4z', 'M8 9h8', 'M8 12h5'],
  plus: ['M12 5v14', 'M5 12h14'],
  copy: ['M9 9h10v10H9z', 'M15 9V5H5v10h4'],
  check: ['m5 12.5 4.5 4.5L19 7.5'],
  alert: ['M12 4 2.8 19.5h18.4z', 'M12 10v4.5', 'M12 17.2v.3'],
  arrow: ['M5 12h14', 'm13 6 6 6-6 6'],
  back: ['M19 12H5', 'm11 6-6 6 6 6'],
  search: ['M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14', 'm20 20-4-4'],
  close: ['m6 6 12 12', 'M18 6 6 18'],
  edit: ['M4 20h4L19 9l-4-4L4 16z', 'm13.5 6.5 4 4'],
  person: ['M12 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7', 'M5 20c0-3.6 3-6 7-6s7 2.4 7 6'],
};

export function icon(name, label) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.75');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  if (label) { svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', label); }
  else svg.setAttribute('aria-hidden', 'true');
  for (const d of ICONS[name] || []) {
    const p = document.createElementNS(SVG_NS, 'path');
    p.setAttribute('d', d);
    svg.append(p);
  }
  return svg;
}

// ---------- よく使う形 ----------
export function pageHead({ title, lead, actions, crumb }) {
  return h('div', { class: 'page-head-wrap' },
    crumb ? h('p', { class: 'crumb' }, h('a', { href: crumb.href }, icon('back'), crumb.label)) : null,
    h('div', { class: 'page-head' },
      h('div', null,
        h('h1', { id: 'page-title', tabindex: '-1' }, title),
        lead ? h('p', { class: 'lead' }, lead) : null),
      actions && actions.length ? h('div', { class: 'page-actions' }, actions) : null));
}

export function panel({ title, count, actions, body, foot, id, cls }) {
  return h('section', { class: 'panel' + (cls ? ' ' + cls : ''), id, 'aria-labelledby': id ? id + '-h' : null },
    title ? h('div', { class: 'panel-head' },
      h('h2', { id: id ? id + '-h' : null }, title, count != null ? h('span', { class: 'count num' }, count) : null),
      actions ? h('div', { class: 'page-actions' }, actions) : null) : null,
    body,
    foot ? h('div', { class: 'panel-foot' }, foot) : null);
}

export function empty(title, text) {
  return h('div', { class: 'empty' }, h('strong', null, title), text ? h('span', null, text) : null);
}

export function button(label, { kind = '', size = '', iconName, onClick, type = 'button', disabled, ariaLabel, id } = {}) {
  const cls = ['btn', kind && 'btn-' + kind, size && 'btn-' + size].filter(Boolean).join(' ');
  return h('button', { type, class: cls, id, onclick: onClick, disabled: !!disabled, 'aria-label': ariaLabel },
    iconName ? icon(iconName) : null, label);
}

export function linkButton(label, href, { kind = '', size = '', iconName } = {}) {
  const cls = ['btn', kind && 'btn-' + kind, size && 'btn-' + size].filter(Boolean).join(' ');
  return h('a', { class: cls, href }, iconName ? icon(iconName) : null, label);
}

// ---------- お知らせ（トースト） ----------
let toastTimer;
export function toast(message) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = message;
  el.classList.add('is-shown');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('is-shown'), 2600);
}

// ---------- 札（ステータス。色だけに頼らず文字を必ず出す。D-39） ----------

export function statusBadge(status) {
  return h('span', { class: 'badge tone-' + statusTone(status) }, status);
}
export function taskBadge(status) {
  const tone = status === '完了' ? 'closed' : status === '進行中' ? 'plan' : 'intake';
  return h('span', { class: 'badge tone-' + tone }, status === '完了' ? icon('check') : null, status);
}
export function assignBadge(state) {
  return h('span', { class: 'badge ' + (state === '確定' ? 'tone-plan' : 'tone-pending') }, state === '確定' ? icon('check') : null, state);
}
export function roleTag(role) {   // AI／システム／人
  const label = { ai: 'AI', system: 'システム', human: '人' }[role];
  return h('span', { class: 'role role-' + role }, label);
}

// ---------- ダイアログ（入力・確認） ----------
// fields を並べたフォームを出し、保存で onSubmit(form) を呼ぶ。onSubmit がエラーの object を返したら閉じずに出す
export function openDialog({ title, lead, body, submitLabel = '保存', danger = false, onSubmit, wide = false }) {
  const errorBox = h('div', { class: 'form-error', role: 'alert', hidden: true });
  const form = h('form', { class: 'dialog-form', novalidate: true, method: 'dialog' },
    h('div', { class: 'dialog-head' },
      h('h2', { id: 'dialog-title' }, title),
      h('button', { type: 'button', class: 'btn btn-ghost icon-btn', 'aria-label': '閉じる', onclick: () => close() }, icon('close'))),
    h('div', { class: 'dialog-body' }, lead ? h('p', { class: 'dialog-lead' }, lead) : null, errorBox, body),
    h('div', { class: 'dialog-foot' },
      h('button', { type: 'button', class: 'btn', onclick: () => close() }, 'キャンセル'),
      h('button', { type: 'submit', class: 'btn ' + (danger ? 'btn-danger' : 'btn-primary') }, submitLabel)));
  const dlg = h('dialog', { class: 'dialog' + (wide ? ' is-wide' : ''), 'aria-labelledby': 'dialog-title' }, form);
  // 閉じたらすぐ取り除く（Esc で閉じたときは close のお知らせで取り除く）
  function close() { dlg.close(); dlg.remove(); }
  dlg.addEventListener('close', () => dlg.remove());
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const errors = onSubmit ? onSubmit(form) : null;
    showErrors(form, errorBox, errors);
    if (!errors || !Object.keys(errors).length) close();
  });
  document.body.append(dlg);
  dlg.showModal();
  const first = form.querySelector('.dialog-body input, .dialog-body select, .dialog-body textarea');
  (first || form.querySelector('[type=submit]')).focus();
  return dlg;
}

export function confirmDialog({ title, message, okLabel = 'はい', danger = true, onOk }) {
  return openDialog({ title, body: h('p', { class: 'dialog-lead' }, message), submitLabel: okLabel, danger, onSubmit: () => { onOk(); return null; } });
}

function showErrors(form, box, errors) {
  for (const el of form.querySelectorAll('.field-error')) el.remove();
  for (const el of form.querySelectorAll('[aria-invalid]')) el.removeAttribute('aria-invalid');
  const keys = errors ? Object.keys(errors) : [];
  box.hidden = !keys.length;
  clear(box);
  if (!keys.length) return;
  box.append(icon('alert'), h('span', null, `${keys.length}か所に直すところがあります。赤い文字の説明を見て直してください。`));
  let firstInvalid = null;
  for (const k of keys) {
    const input = form.elements.namedItem(k);
    const target = input instanceof RadioNodeList ? input[0] : input;
    const msg = h('p', { class: 'field-error', id: 'err-' + k }, errors[k]);
    const wrap = target?.closest?.('.field') || form.querySelector(`[data-field="${k}"]`);
    if (wrap) wrap.append(msg); else box.append(msg);
    if (target && target.setAttribute) {
      target.setAttribute('aria-invalid', 'true');
      target.setAttribute('aria-describedby', 'err-' + k);
      if (!firstInvalid) firstInvalid = target;
    }
  }
  firstInvalid?.focus();
}

// ---------- 入力欄 ----------
let fieldSeq = 0;
export function field(label, control, { hint, required, cls, forId } = {}) {
  const id = forId || control.id || 'f' + (++fieldSeq);
  if (!forId) control.id = id;
  return h('div', { class: 'field' + (cls ? ' ' + cls : ''), dataset: { field: control.name || '' } },
    h('label', { for: id }, label, required ? h('span', { class: 'req' }, '必須') : null),
    control,
    hint ? h('p', { class: 'hint' }, hint) : null);
}
export function input(name, value, attrs = {}) {
  return h('input', { name, value: value ?? '', type: 'text', autocomplete: 'off', ...attrs });
}
export function textarea(name, value, attrs = {}) {
  const t = h('textarea', { name, rows: 3, ...attrs });
  t.value = value ?? '';
  return t;
}
export function select(name, options, value, attrs = {}) {
  return h('select', { name, ...attrs }, options.map((o) => {
    const [v, l] = Array.isArray(o) ? o : [o, o];
    return h('option', { value: v, selected: v === value }, l);
  }));
}
export function fieldset(legend, children, { name, cls } = {}) {
  return h('fieldset', { class: 'field fieldset' + (cls ? ' ' + cls : ''), dataset: { field: name || '' } }, h('legend', null, legend), children);
}
