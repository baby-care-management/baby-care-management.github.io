// AI の下書きを作る部品（案件詳細と AIアシスタントの両方で使う。R-12〜R-14）
// 必ず「人が確かめてから使う」: 印をつけるまでコピーできない。送信はしない
import { h, icon, roleTag, button, toast, confirmDialog } from '../ui.js';
import { getState } from '../store.js';
import * as ai from '../ai.js';
import { today } from './parts.js';

const drafts = new Map();   // 案件ごとの下書き { kind, text, orig（作ったときの文）, source, checked, loading, error, line }
const lineOn = new Map();   // 案件ごとの「LINE向けの短い文」の切り替え

export function aiNotice(extra) {
  return h('p', { class: 'notice ai-notice' }, roleTag('ai'),
    h('span', null, 'AIの下書きです。宛名・日時・人数と〔 〕の部分を人が確かめてから使ってください。', extra || ''));
}

export function draftTool(caseId, refresh) {
  const d = drafts.get(caseId);
  // 人が直した文があるときは、作り直す前に確認する（D-50）
  const make = (kind) => {
    if (d && d.text != null && d.orig != null && d.text !== d.orig) {
      confirmDialog({ title: '直した文章は消えます', message: '作り直すと、いま直した文章は消えます。作り直しますか。', okLabel: '作り直す', onOk: () => run(kind) });
      return;
    }
    run(kind);
  };
  const run = async (kind) => {
    const k = ai.DRAFT_KINDS.find((x) => x.key === kind);
    const line = !!k.line && !!lineOn.get(caseId);
    drafts.set(caseId, { kind, loading: true, line });
    refresh();
    try {
      const ctx = ai.contextFor(kind, getState(), caseId, today(), { variant: line ? 'line' : '' });
      const { result, source } = await k.fn(ctx);
      drafts.set(caseId, { kind, text: result, orig: result, source, checked: false, line });
    } catch {
      drafts.set(caseId, { kind, error: true, line });
    }
    refresh();
  };

  const kinds = h('div', { class: 'draft-kinds', role: 'group', 'aria-label': '作る下書きの種類' },
    ai.DRAFT_KINDS.map((k) => h('button', {
      type: 'button', class: 'draft-kind' + (d?.kind === k.key ? ' is-selected' : ''),
      'aria-pressed': String(d?.kind === k.key), disabled: !!d?.loading, onclick: () => make(k.key),
    }, h('span', { class: 'draft-kind-name' }, k.label), h('span', { class: 'draft-kind-note' }, k.note))));

  const lineBox = h('label', { class: 'check-line line-toggle', for: `line-${caseId}` },
    h('input', { type: 'checkbox', id: `line-${caseId}`, checked: !!lineOn.get(caseId), onchange: (e) => { lineOn.set(caseId, e.target.checked); } }),
    h('span', null, 'LINE向けの短い文にする（返信文・スタッフへの依頼文）'));
  return h('div', { class: 'draft-tool' }, lineBox, kinds, d ? output(caseId, d, () => make(d.kind)) : null);
}

function output(caseId, d, remake) {
  const k = ai.DRAFT_KINDS.find((x) => x.key === d.kind);
  if (d.loading) {
    return h('div', { class: 'draft-out is-loading', role: 'status' }, h('span', { class: 'spinner', 'aria-hidden': 'true' }), `${k.label}の下書きを作っています…`);
  }
  if (d.error) {
    return h('div', { class: 'draft-out' }, h('p', { class: 'notice is-danger', role: 'alert' }, icon('alert'),
      h('span', null, '下書きを作れませんでした。もう一度押してください。続くときは、案件の情報を見直してください。')),
    button('もう一度作る', { onClick: remake }));
  }
  const taId = `draft-${caseId}`;
  const ta = h('textarea', { id: taId, class: 'draft-text', rows: d.kind === 'handover' ? 18 : 14, maxlength: 5000, spellcheck: 'false' });
  ta.value = d.text;
  const left = h('p', { class: 'draft-left', 'aria-live': 'polite' });
  const copyBtn = button('コピーする', { kind: 'primary', iconName: 'copy', disabled: !d.checked, onClick: () => copy(ta, d) });
  const updateLeft = () => {
    const n = (ta.value.match(/〔[^〕]*〕/g) || []).length;
    left.textContent = n ? `〔 〕の書きかえが ${n}か所 残っています` : '〔 〕の書きかえはありません';
    left.classList.toggle('warn', n > 0);
  };
  ta.addEventListener('input', () => { d.text = ta.value; updateLeft(); });
  updateLeft();
  const check = h('input', { type: 'checkbox', id: `chk-${taId}`, checked: !!d.checked, onchange: (e) => { d.checked = e.target.checked; copyBtn.disabled = !d.checked; } });

  return h('div', { class: 'draft-out' },
    h('div', { class: 'draft-head' },
      h('h3', { class: 'sub-head' }, `${k.label}${d.line ? '（LINE向け）' : ''}（下書き）`),
      h('span', { class: 'source' }, d.source)),
    aiNotice(' 送信はしません。コピーして、メールやチャットに貼り付けて使います。'),
    h('label', { class: 'visually-hidden', for: taId }, `${k.label}の下書き（書きかえられます）`),
    ta,
    left,
    h('label', { class: 'check-line human-check', for: `chk-${taId}` }, check, roleTag('human'), h('span', null, '内容を確かめました')),
    h('div', { class: 'draft-actions' },
      button('作り直す', { kind: 'ghost', onClick: remake }),
      copyBtn));
}

async function copy(ta, d) {
  if (!d.checked) return;
  try {
    if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(ta.value);
    else {
      ta.select();
      if (!document.execCommand('copy')) throw new Error('copy');
    }
    toast('コピーしました。送信はしていません。貼り付けてから送ってください');
  } catch {
    ta.focus();
    ta.select();
    toast('コピーできませんでした。文を選んだので、手でコピー（⌘C / Ctrl+C）してください');
  }
}
