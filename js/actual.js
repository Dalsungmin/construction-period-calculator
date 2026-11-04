import { PRESETS, CONDITIONS, cursorToDate } from './calc.js';

// calc.js의 CONDITIONS 키와 1:1 대응
export const RULES = {
  feel33: d => d.feel >= 33,
  feel35: d => d.feel >= 35,
  tmax33: d => d.tmax >= 33,
  tmax35: d => d.tmax >= 35,
  tmax0:  d => d.tmax <= 0,
  snow5:  d => d.snow >= 5,
  tmax0_or_snow5: d => d.tmax <= 0 || d.snow >= 5,
  tmin_m12: d => d.tmin <= -12,
  rain3:  d => d.rain >= 3,
  rain5:  d => d.rain >= 5,
  rain10: d => d.rain >= 10,
  rain20: d => d.rain >= 20,
  wind15: d => d.gust >= 15          // 최대 '순간' 풍속
};

// 기상청 여름철 체감온도식 (Stull 습구온도 사용)
function feelTemp(T, RH) {
  if (Number.isNaN(T) || Number.isNaN(RH)) return NaN;
  const at = Math.atan;
  const Tw = T * at(0.151977 * Math.sqrt(RH + 8.313659)) + at(T + RH) - at(RH - 1.67633)
           + 0.00391838 * RH ** 1.5 * at(0.023101 * RH) - 4.686035;
  return -0.2442 + 0.55399 * Tw + 0.45535 * T - 0.0022 * Tw ** 2 + 0.00278 * Tw * T + 3.0;
}


const $ = id => document.getElementById(id);
const r1 = x => Math.round(x * 10) / 10;
const fmt = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const day0 = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());

// 기상자료개방포털 ASOS 일자료 CSV 읽기 (UTF-8 / EUC-KR 자동 판별)
export async function readKmaCsv(file) {
  const buf = await file.arrayBuffer();
  let text = new TextDecoder('utf-8').decode(buf);
  if (text.includes('\uFFFD')) text = new TextDecoder('euc-kr').decode(buf);

  const [headLine, ...lines] = text.trim().split(/\r?\n/);
  const head = headLine.replace(/^\uFEFF/, '').split(',').map(s => s.trim().replace(/"/g, ''));
  const find = t => head.findIndex(t);
    const idx = {
    date: find(h => h === '일시'),
    rain: find(h => h.startsWith('일강수량')),
    tmin: find(h => h.startsWith('최저기온(')),
    tmax: find(h => h.startsWith('최고기온(')),
    gust: find(h => h.startsWith('최대 순간 풍속(')),
    rhmin: find(h => h.startsWith('최소 상대습도')),
    snow: find(h => h.startsWith('일 최심신적설('))
  };

  if (idx.date < 0) throw new Error('ASOS 일자료 CSV가 아닙니다 ("일시" 열이 없음)');

  const num = v => (v?.trim() ? Number(v) : NaN);   // 빈 값은 NaN → 모든 비교가 false
  const days = new Map();
  let station = '';
  for (const line of lines) {
    const c = line.split(',').map(s => s.replace(/"/g, ''));
    if (!c[idx.date]) continue;
    station ||= c[0].trim();
    const g = k => (idx[k] >= 0 ? num(c[idx[k]]) : NaN);
    const tmax = g('tmax');
    days.set(c[idx.date].trim().slice(0, 10), {
      rain: g('rain') || 0, snow: g('snow') || 0,   // 강수·적설 빈칸 = 0
      tmin: g('tmin'), tmax, gust: g('gust'),
      feel: feelTemp(tmax, g('rhmin'))
    });

  }
  const missingCols = Object.entries(idx).filter(([, i]) => i < 0).map(([k]) => k);
  return { station, days, missingCols };
}

// 계획(평년값) 대비 실측 비작업일 차이 계산
export function compareActual(plan, acts, { days }) {
  const rows = [], unknown = new Set();

  plan.results.forEach((r, i) => {
    const conds = PRESETS[acts[i].preset]?.conds ?? [];
    const tests = conds.filter(c => (RULES[c] ? true : (unknown.add(c), false))).map(c => RULES[c]);
    const begin = day0(cursorToDate(r.begin)), end = day0(cursorToDate(r.end));

    for (const l of r.log) {
      const D = new Date(l.y, l.m, 0).getDate();
      const s = new Date(Math.max(begin, new Date(l.y, l.m - 1, 1)));
      const e = new Date(Math.min(end, new Date(l.y, l.m - 1, D)));

      let span = 0, covered = 0, bad = 0;
      for (const d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
        span++;
        const w = days.get(fmt(d));
        if (!w) continue;
        covered++;
        if (tests.some(t => t(w))) bad++;
      }
      if (!span) continue;

      const planA = l.A * span / D;                                 // 해당 구간 평년 기상 비작업일
      const actual = covered ? bad * span / covered : null;         // 자료 일부만 있으면 비례 추정
      const extra = actual == null ? null : (actual - planA) * (1 - l.B / D); // 공휴일 중복분 제외
      rows.push({ name: r.name, y: l.y, m: l.m, span, covered, planA, actual, extra });
    }
  });

  const done = rows.filter(x => x.extra != null);
  return { rows, unknown: [...unknown], net: done.reduce((a, x) => a + x.extra, 0), months: done.length };
}

export function renderActual(res, { station, selected, missingCols }) {
  const sign = x => (x > 0 ? '+' : '') + r1(x);
  const warn = [];
  if (station && station !== String(selected)) warn.push(`CSV 지점(${station})이 선택한 관측지점(${selected})과 다릅니다.`);
  if (res.unknown.length) warn.push(`평가하지 못한 조건: ${res.unknown.map(k => CONDITIONS[k] ?? k).join(', ')} (actual.js의 RULES에 추가 필요)`);
  if (missingCols.length) warn.push(`CSV에 없는 열: ${missingCols.join(', ')}`);
  if (!res.months) warn.push('공사기간과 겹치는 실측 자료가 없습니다.');

  const ext = Math.max(0, Math.ceil(res.net));
  $('actualOut').innerHTML = `
    <div class="kpis">
      <div class="kpi main"><span>기상 추가 비작업일 (순증)</span><b class="${res.net > 0 ? 'pos' : 'neg'}">${sign(res.net)}일</b></div>
      <div class="kpi"><span>공기연장 검토일수</span><b>${ext}일</b></div>
      <div class="kpi"><span>비교 월 수</span><b>${res.months}개월</b></div>
    </div>
    ${warn.map(w => `<div class="err" style="display:block">${w}</div>`).join('')}
    <div class="tbl-wrap"><table class="tbl" style="margin-top:12px">
      <tr><th>공종</th><th>년월</th><th>대상일</th><th>계획 기상일</th><th>실측 기상일</th><th>추가 비작업일</th><th>자료</th></tr>
      ${res.rows.map(x => `<tr><td>${x.name}</td><td>${x.y}.${x.m}</td><td>${x.span}</td><td>${r1(x.planA)}</td>
        <td>${x.actual == null ? '-' : r1(x.actual)}</td>
        <td class="${x.extra > 0 ? 'pos' : 'neg'}">${x.extra == null ? '-' : sign(x.extra)}</td>
        <td>${x.covered === x.span ? '완전' : x.covered ? `일부(${x.covered}/${x.span})` : '없음'}</td></tr>`).join('')}
    </table></div>`;
}
