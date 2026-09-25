// AIアシスタント（R-11〜R-14）
// 1. 問い合わせ整理 → 人が直して「案件に登録」  2. 案件を選んで下書き（返信文・依頼文・引き継ぎメモ）
import { h, pageHead, panel, icon, roleTag, button, field, select, toast, confirmDialog } from '../ui.js';
import { getState, update, nextId } from '../store.js';
import * as L from '../logic.js';
import * as ai from '../ai.js';
import { sampleInquiries } from '../seed.js';
import { today } from './parts.js';
import { caseFields, readCaseForm, toCase, emptyCase } from './case-form.js';
import { draftTool } from './ai-parts.js';

const st = { text: '', loading: false, error: false, result: null, source: '', checked: false, caseId: '', raw: null };   // raw: 人が直した入力欄の値

// 人が直した整理結果があるときは、消す前に確認する（D-50）
const guard = (next) => (st.result && st.raw
  ? confirmDialog({ title: '直した内容は消えます', message: 'いま直した整理結果は消えます。よろしいですか。', okLabel: '消して進める', onOk: next })
  : next());

export function render({ refresh }) {
  return h('div', null,
    pageHead({
      title: 'AIアシスタント',
      lead: 'AIは情報の整理と文章の下書きだけを行います。登録・送信・判断は人が行います。今はモック（決まったきまりで動く仮の処理）で、AI API にはつながっていません。',
    }),
    h('div', { class: 'v-stack' },
      inquiryPanel(refresh),
      draftPanel(refresh)));
}

// ---------- 1. 問い合わせ整理（R-11） ----------
function inquiryPanel(refresh) {
  const ta = h('textarea', { id: 'inq-text', rows: 8, maxlength: L.LIMITS.inquiry, placeholder: 'メール・フォームで届いた問い合わせの文章を、そのまま貼り付けてください' });
  ta.value = st.text;
  const count = h('span', { class: 'hint num' }, `${st.text.length} / ${L.LIMITS.inquiry}文字`);
  ta.addEventListener('input', () => { st.text = ta.value; count.textContent = `${st.text.length} / ${L.LIMITS.inquiry}文字`; });

  const run = async () => {
    if (!st.text.trim()) {
      toast('問い合わせの文章を入れてから押してください');
      ta.focus();
      return;
    }
    st.loading = true; st.result = null; st.checked = false; st.raw = null; st.error = false;
    refresh();
    try {
      const { result, source } = await ai.organizeInquiry(st.text, today());
      st.result = result; st.source = source;
    } catch {
      st.error = true;   // 失敗したら「整理しています…」のまま止めず、知らせてやり直せるようにする
    }
    st.loading = false;
    refresh();
    document.getElementById(st.error ? 'inq-run' : 'inq-result-h')?.focus();
  };

  const samples = h('div', { class: 'sample-row' },
    h('span', { class: 'hint' }, '例文を入れる:'),
    sampleInquiries(today()).map((s) => button(s.label, { size: 'sm', kind: 'ghost', disabled: st.loading, onClick: () => guard(() => { st.text = s.text; st.result = null; st.raw = null; refresh(); }) })));

  return panel({
    id: 'inq', title: [h('span', { class: 'ph' }, '問い合わせを整理して'), h('span', { class: 'ph' }, '案件にする')],
    body: h('div', { class: 'panel-body' },
      h('ol', { class: 'how-steps' },
        h('li', null, roleTag('human'), '文章を貼り付ける'),
        h('li', null, roleTag('ai'), '日時・会場・人数などに分ける'),
        h('li', null, roleTag('human'), '直して「案件に登録」'),
        h('li', null, roleTag('system'), '案件とヒアリングのタスクを記録')),
      field('問い合わせの文章', ta, { hint: 'お客さまの名前や連絡先は、この画面の中だけで使います（外には送りません）' }),
      h('div', { class: 'inq-actions' },
        samples,
        h('div', { class: 'inq-run' }, count, button(st.loading ? '整理しています…' : st.error ? 'もう一度整理する' : '整理する', { id: 'inq-run', kind: 'primary', iconName: 'assistant', onClick: () => guard(run), disabled: st.loading }))),
      st.error ? h('p', { class: 'notice is-danger', role: 'alert' }, icon('alert'),
        h('span', null, '整理できませんでした。もう一度押してください。続くときは、文章を見直してください。')) : null,
      st.loading ? h('div', { class: 'draft-out is-loading', role: 'status' }, h('span', { class: 'spinner', 'aria-hidden': 'true' }), '文章から、日時・会場・人数などを取り出しています…') : null,
      st.result ? resultBlock(refresh) : null),
  });
}

const FOUND_LABELS = [['date', '開催日'], ['time', '時間'], ['venue', '会場'], ['children', '子どもの人数'], ['ages', '年齢構成']];

function resultBlock(refresh) {
  const r = st.result;
  const f = r.fields;
  const c = {
    ...emptyCase(), name: f.name, date: f.date, start: f.start, end: f.end, venue: f.venue,
    children: f.children, ages: f.ages, confirmItems: r.confirmItems.join('\n'),
    customer: { company: f.company, contact: f.contact, phone: '', email: '' },
  };
  const chips = h('ul', { class: 'found-list', 'aria-label': '取り出せた項目' },
    FOUND_LABELS.map(([k, label]) => h('li', { class: r.found[k] ? 'is-found' : 'is-missing' },
      r.found[k] ? icon('check') : icon('alert'),
      h('span', null, label, r.found[k] ? (k === 'children' && r.approxChildren ? '（約）' : '') : '：見つかりません'))),
    h('li', { class: 'is-found' }, icon('check'), h('span', null, `確認事項 ${r.confirmItems.length}件`)));

  const form = h('form', { class: 'inq-form', novalidate: true, onsubmit: (e) => { e.preventDefault(); register(form); } },
    h('div', { class: 'form-error', role: 'alert', hidden: true, id: 'inq-errors' }),
    caseFields(c),
    h('label', { class: 'check-line human-check', for: 'inq-check' },
      h('input', { type: 'checkbox', id: 'inq-check', checked: st.checked, onchange: (e) => { st.checked = e.target.checked; form.querySelector('[type=submit]').disabled = !st.checked; } }),
      roleTag('human'), h('span', null, '整理した内容を確かめ、足りない所を直しました')),
    h('div', { class: 'draft-actions' },
      button('整理をやめる', { kind: 'ghost', onClick: () => guard(() => { st.result = null; st.raw = null; refresh(); }) }),
      h('button', { type: 'submit', class: 'btn btn-primary', disabled: !st.checked }, icon('plus'), '案件に登録')));
  // 描き直しても、人が直した値を残す
  if (st.raw) for (const [k, v] of Object.entries(st.raw)) { const el = form.elements.namedItem(k); if (el && 'value' in el) el.value = v; }
  form.addEventListener('input', () => {
    st.raw = Object.fromEntries([...form.elements].filter((e) => e.name && e.type !== 'checkbox').map((e) => [e.name, e.value]));
  });

  return h('section', { class: 'draft-out', 'aria-labelledby': 'inq-result-h' },
    h('div', { class: 'draft-head' },
      h('h3', { class: 'sub-head', id: 'inq-result-h', tabindex: '-1' }, '整理した結果（下書き）'),
      h('span', { class: 'source' }, st.source)),
    chips,
    h('p', { class: 'notice ai-notice' }, roleTag('ai'),
      h('span', null, 'AIが文章から取り出した内容です。まちがい・抜けがないかを原文と比べて確かめ、下の欄で直してください。「見つかりません」の項目は、お客さまに確かめる事項に入れています。')),
    form);
}

function register(form) {
  const box = form.querySelector('#inq-errors');
  const v = readCaseForm(form);
  const errors = L.validateCase(v);
  for (const el of form.querySelectorAll('.field-error')) el.remove();
  for (const el of form.querySelectorAll('[aria-invalid]')) el.removeAttribute('aria-invalid');
  const keys = Object.keys(errors);
  box.hidden = !keys.length;
  box.textContent = '';
  if (keys.length) {
    box.append(icon('alert'), h('span', null, `${keys.length}か所に直すところがあります。赤い文字の説明を見て直してください。`));
    for (const k of keys) {
      const input = form.elements.namedItem(k);
      input?.setAttribute('aria-invalid', 'true');
      input?.closest('.field')?.append(h('p', { class: 'field-error' }, errors[k]));
    }
    form.elements.namedItem(keys[0])?.focus();
    return;
  }
  const data = toCase(v);
  const id = nextId('c');
  const now = today();
  update((s) => {
    s.cases.push({ ...emptyCase(), ...data, id, status: '問い合わせ', inquiry: st.text });
    s.tasks.push({ id: nextId('t'), caseId: id, title: 'ヒアリング（確認事項の聞き取り）', due: L.addDays(now, 1), status: '未着手', assigneeId: data.ownerId });
  });
  st.text = ''; st.result = null; st.checked = false; st.raw = null;
  toast(`案件「${data.name}」を登録し、ヒアリングのタスクを作りました`);
  location.hash = '#/cases/' + id;
}

// ---------- 2. 案件を選んで下書き（R-12〜R-14） ----------
function draftPanel(refresh) {
  const s = getState();
  const cases = L.sortCases(s.cases);
  if (!st.caseId || !cases.some((c) => c.id === st.caseId)) st.caseId = (cases.find((c) => c.date >= today()) || cases[0])?.id || '';
  const sel = select('case', cases.map((c) => [c.id, `${L.formatDateShort(c.date)} ${c.name}（${c.status}）`]), st.caseId, {
    id: 'draft-case', onchange: (e) => { st.caseId = e.target.value; refresh(); },
  });
  return panel({
    id: 'drafts', title: [h('span', { class: 'ph' }, '案件の情報から'), h('span', { class: 'ph' }, '文章の下書きを作る')],
    body: h('div', { class: 'panel-body' },
      h('p', { class: 'lead-text' }, '案件詳細の「AIアシスタント」と同じものです。登録済みの案件・スタッフ・タスクの情報から作ります。'),
      field('案件', sel),
      st.caseId ? draftTool(st.caseId, refresh) : h('p', { class: 'empty' }, '案件がまだありません')),
  });
}
