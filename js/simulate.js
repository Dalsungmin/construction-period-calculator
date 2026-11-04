import { calcProject } from './calc.js';

const $ = id => document.getElementById(id);
const fmt = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
let chart;

// 같은 조건에서 착공 월만 1~12월로 바꿔 반복 계산
export function simulateStarts(params) {
  const [y, , d] = params.startDate.split('-').map(Number);
  const day = String(Math.min(d, 28)).padStart(2, '0');
  return Array.from({ length: 12 }, (_, i) => {
    const startDate = `${y}-${String(i + 1).padStart(2, '0')}-${day}`;
    try {
      const p = calcProject({ ...params, startDate });
      return { month: i + 1, startDate, total: p.total, finish: fmt(p.finish) };
    } catch (e) {
      return { month: i + 1, startDate, error: e.message };
    }
  });
}

export function renderSimulation(list, curMonth) {
  const ok = list.filter(s => !s.error);
  if (!ok.length) { $('simSummary').textContent = '시뮬레이션 실패: ' + list[0].error; return; }

  const best = ok.reduce((a, b) => (b.total < a.total ? b : a));
  const worst = ok.reduce((a, b) => (b.total > a.total ? b : a));
  const cur = list[curMonth - 1];

  $('simSummary').innerHTML =
    `최단 <b>${best.month}월 착공 ${best.total}일</b> · 최장 <b>${worst.month}월 착공 ${worst.total}일</b> (차이 ${worst.total - best.total}일)` +
    (cur && !cur.error ? `<br>현재 ${curMonth}월 착공 ${cur.total}일 → 최단 대비 <b>+${cur.total - best.total}일</b>` : '');

  chart?.destroy();
  chart = new Chart($('simChart'), {
    type: 'bar',
    data: {
      labels: list.map(s => s.month + '월'),
      datasets: [{
        label: '총 공사기간(일)',
        data: list.map(s => s.total ?? null),
        backgroundColor: list.map(s => s.month === curMonth ? '#2563eb' : s === best ? '#10b981' : '#cbd5e1')
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { y: { min: Math.floor(best.total * 0.95) } }
    }
  });

  $('simTable').innerHTML = `<tr><th>착공일</th><th>총 공사기간</th><th>준공 예정일</th><th>최단 대비</th></tr>` +
    list.map(s => s.error
      ? `<tr><td>${s.startDate}</td><td colspan="3">${s.error}</td></tr>`
      : `<tr${s.month === curMonth ? ' style="font-weight:700"' : ''}><td>${s.startDate}</td><td>${s.total}일</td>
         <td>${s.finish}</td><td>+${s.total - best.total}일</td></tr>`).join('');
}
