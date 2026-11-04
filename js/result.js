import { PRESETS, cursorToDate } from './calc.js';

const $ = id => document.getElementById(id);
const COLORS = ['#2563eb','#7c3aed','#0891b2','#db2777','#ea580c','#16a34a'];
const f1 = n => (Math.round(n * 10) / 10).toLocaleString();
const ymd = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const actName = r => r.name || PRESETS[r.preset].label;
let chart;

// 월별 합산 (여러 공종이 같은 달에 걸치면 합침)
// 비작업일은 A(기상):B(공휴일) 비율로 나눔
function byMonth(results) {
  const map = new Map();
  for (const r of results) for (const l of r.log) {
    const key = `${l.y}-${String(l.m).padStart(2,'0')}`;
    const share = (l.A + l.B) > 0 ? l.A / (l.A + l.B) : 0;
    const o = map.get(key) || { ym: key, work: 0, weather: 0, holiday: 0, acts: new Set() };
    o.work += l.work;
    o.weather += l.non * share;
    o.holiday += l.non * (1 - share);
    o.acts.add(actName(r));
    map.set(key, o);
  }
  return [...map.values()];
}

export function renderResult(res) {
  $('result').hidden = false;
  const workSum = res.results.reduce((s, r) => s + r.workDays, 0);
  const nonSum  = res.results.reduce((s, r) => s + r.nonWork, 0);

  // 요약 카드
  $('kTotal').textContent = res.total.toLocaleString() + '일';
  $('kEnd').textContent   = ymd(res.finish);
  $('kWork').textContent  = f1(workSum) + '일';
  $('kNon').textContent   = f1(nonSum) + '일';

  // 공정 타임라인 (준비 → 공종들 → 정리)
  const segs = [
    { n: '준비', d: res.prepDays, c: '#94a3b8' },
    ...res.results.map((r, i) => ({ n: actName(r), d: r.duration, c: COLORS[i % COLORS.length] })),
    { n: '정리', d: res.cleanDays, c: '#64748b' }
  ].filter(s => s.d > 0);
  const T = segs.reduce((s, x) => s + x.d, 0);
  $('timeline').innerHTML = segs.map(s =>
    `<div style="width:${s.d / T * 100}%;background:${s.c}" title="${s.n} ${f1(s.d)}일">${s.n} ${Math.round(s.d)}일</div>`
  ).join('');

  // 공종별 표
  $('actTable').innerHTML =
    '<tr><th>공종</th><th>시작</th><th>종료</th><th>작업일</th><th>비작업일</th><th>소요일</th></tr>' +
    res.results.map(r => `<tr>
      <td>${actName(r)}</td><td>${ymd(cursorToDate(r.begin))}</td><td>${ymd(cursorToDate(r.end))}</td>
      <td>${f1(r.workDays)}</td><td>${f1(r.nonWork)}</td><td><b>${f1(r.duration)}</b></td></tr>`).join('');

  // 월별 누적 막대그래프
  const months = byMonth(res.results);
  if (chart) chart.destroy();
  chart = new Chart($('monthChart'), {
    type: 'bar',
    data: {
      labels: months.map(m => m.ym),
      datasets: [
        { label: '작업일',      data: months.map(m => +m.work.toFixed(1)),    backgroundColor: '#10b981' },
        { label: '기상 비작업', data: months.map(m => +m.weather.toFixed(1)), backgroundColor: '#60a5fa' },
        { label: '공휴일',      data: months.map(m => +m.holiday.toFixed(1)), backgroundColor: '#f59e0b' }
      ]
    },
    options: {
      maintainAspectRatio: false,
      scales: { x: { stacked: true }, y: { stacked: true, title: { display: true, text: '일' } } },
      plugins: { legend: { position: 'bottom' } }
    }
  });

  // 월별 상세 표
  $('detail').innerHTML =
    '<tr><th>월</th><th>공종</th><th>작업일</th><th>기상</th><th>공휴일</th></tr>' +
    months.map(m => `<tr><td>${m.ym}</td><td>${[...m.acts].join(', ')}</td>
      <td>${f1(m.work)}</td><td>${f1(m.weather)}</td><td>${f1(m.holiday)}</td></tr>`).join('');
}
