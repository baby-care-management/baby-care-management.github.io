// 案件の登録・編集（R-05）
import { h, field, input, select, textarea, openDialog, toast } from '../ui.js';
import { getState, update, nextId } from '../store.js';
import * as L from '../logic.js';
import { memberOptions } from './parts.js';

export const CASE_TYPES = ['イベント託児', '常設託児室'];

export function emptyCase() {
  return {
    name: '', type: CASE_TYPES[0], date: '', start: '', end: '', venue: '',
    customer: { company: '', contact: '', phone: '', email: '' },
    children: null, ages: '', requiredStaff: null, ownerId: getState().members[0].id,
    status: '問い合わせ', confirmItems: '', careNotes: '', inquiry: '', assignments: [],
  };
}

// フォームの値を読む（数の欄は、空なら null＝未入力）
export function readCaseForm(form) {
  const el = form.elements;
  const val = (k) => (el.namedItem(k)?.value ?? '').trim();
  return {
    name: val('name'), type: val('type'), date: val('date'), start: val('start'), end: val('end'), venue: val('venue'),
    company: val('company'), contact: val('contact'), phone: val('phone'), email: val('email'),
    children: L.parseCount(val('children')), ages: val('ages'), requiredStaff: L.parseCount(val('requiredStaff')),
    ownerId: val('ownerId'), confirmItems: val('confirmItems'), careNotes: val('careNotes'),
  };
}

export function toCase(v) {
  const { company, contact, phone, email, ...rest } = v;
  return { ...rest, customer: { company, contact, phone, email } };
}

// 入力欄（AIアシスタントの「案件に登録」でも使う）
export function caseFields(c, { showType = true } = {}) {
  const n = (x) => (x == null ? '' : String(x));
  return h('div', { class: 'form-grid' },
    h('p', { class: 'form-section' }, '基本情報'),
    field('案件名', input('name', c.name, { maxlength: L.LIMITS.name, placeholder: '例: 秋の住宅フェア キッズスペース' }), { required: true, cls: 'span-2' }),
    showType ? field('種類', select('type', CASE_TYPES, c.type)) : null,
    field('担当者（運営）', select('ownerId', memberOptions(), c.ownerId)),
    field('開催日', input('date', c.date, { type: 'date' }), { required: true }),
    h('div', { class: 'time-pair' },
      field('開始', input('start', c.start, { type: 'time' })),
      field('終了', input('end', c.end, { type: 'time' }))),
    field('会場', input('venue', c.venue, { maxlength: L.LIMITS.text }), { cls: 'span-2' }),
    h('p', { class: 'form-section' }, '顧客情報'),
    field('顧客名', input('company', c.customer.company, { maxlength: L.LIMITS.text, placeholder: '例: 〇〇株式会社 総務部' })),
    field('顧客の担当者', input('contact', c.customer.contact, { maxlength: L.LIMITS.text, placeholder: '例: 山田 様' })),
    field('電話', input('phone', c.customer.phone, { type: 'tel', maxlength: 20 })),
    field('メール', input('email', c.customer.email, { type: 'email', maxlength: L.LIMITS.text })),
    h('p', { class: 'form-section' }, '託児情報'),
    field('子ども人数', input('children', n(c.children), { inputmode: 'numeric', placeholder: '例: 12' }), { hint: '分からなければ空のまま（未入力）。0人なら 0' }),
    field('必要スタッフ数', input('requiredStaff', n(c.requiredStaff), { inputmode: 'numeric', placeholder: '例: 4' }), { hint: '人数と年齢を見て、人が決める' }),
    field('年齢構成', input('ages', c.ages, { maxlength: L.LIMITS.text, placeholder: '例: 0〜2歳 3名／3〜6歳 7名' }), { cls: 'span-2' }),
    field('確認事項', textarea('confirmItems', c.confirmItems, { maxlength: L.LIMITS.long, rows: 2 }), { cls: 'span-2', hint: 'お客さまに確かめること' }),
    field('託児メモ', textarea('careNotes', c.careNotes, { maxlength: L.LIMITS.long, rows: 3 }), { cls: 'span-2', hint: '部屋・受付・持ち物・注意することなど' }));
}

export function openCaseDialog(existing) {
  const isNew = !existing;
  const c = existing || emptyCase();
  openDialog({
    title: isNew ? '案件を登録' : '案件を編集',
    lead: isNew ? '問い合わせの文章から始めるときは「AIアシスタント」の問い合わせ整理が使えます。' : null,
    submitLabel: isNew ? '登録する' : '保存する',
    wide: true,
    body: caseFields(c),
    onSubmit: (form) => {
      const v = readCaseForm(form);
      const errors = L.validateCase(v);
      if (Object.keys(errors).length) return errors;
      const data = toCase(v);
      let id = existing?.id;
      update((s) => {
        if (isNew) {
          id = nextId('c');
          s.cases.push({ ...emptyCase(), ...data, id });
        } else {
          Object.assign(s.cases.find((x) => x.id === id), data);
        }
      });
      toast(isNew ? `案件「${data.name}」を登録しました` : '案件の内容を保存しました');
      if (isNew) location.hash = '#/cases/' + id;
      return null;
    },
  });
}
