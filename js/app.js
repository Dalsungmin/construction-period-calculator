import { calcProject, PRESETS, cursorToDate } from './calc.js';
import { REGRESSION, verify } from './regression.js';
import { renderResult } from './result.js';

const $ = id => document.getElementById(id);
// 로컬 날짜 기준 (toISOString은 한국시간에서 하루 밀릴 수 있음)
const fmt = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const r1 = x => Math.round(x * 10) / 10;
let DB, last;

function showError(msg) {
  $('err').textContent = msg;
  $('err').style.display = msg ? 'block' : 'none';
}

async function init() {
  const [holidays, weather, prep] = await Promise.all(
    ['holidays', 'weather', 'prep'].map(f => fetch(`data/${f}.json`).then(r => r.json())));
  DB = { holidays, weather, prep };

  $('station').innerHTML = Object.entries(weather.stations)
    .map(([k, v]) => `<option value="${k}">${v.name} (${k})</option>`).join('');
  $('prepType').innerHTML = prep.map((p, i) => `<option value="${i}">${p.type} (${p.days}일)</option>`).join('');
  $('prepType').onchange = () => ($('prepDays').value = prep[$('prepType').value].days);
  $('prepType').onchange();
  $('model').innerHTML = Object.entries(REGRESSION)
    .map(([k, v]) => `<option value="${k}">${v.label} (${v.rangeText})</option>`).join('');

  if (!$('start').value) $('start').value = `${new Date().getFullYear() + 1}-03-01`;

  addRow({ name: '토공사', direct: 40, preset: 'earth' });
  addRow({ name: '골조공사', direct: 150, preset: 'rcBldg' });
  addRow({ name: '마감공사', direct: 110, preset: 'indoor' });
}

function addRow(a = {}) {
  const opts = Object.entries(PRESETS)
    .map(([k, p]) => `<option value="${k}" ${k === a.preset ? 'selected' : ''}>${p.label}</option>`).join('');
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td><input class="name" value="${a.name ?? ''}"></td>
    <td><input class="qty" type="number"></td>
    <td><input class="rate" type="number"></td>
    <td><input class="crew" type="number" value="1"></td>
    <td><input class="extra" type="number" value="0"></td>
    <td><input class="direct" type="number" value="${a.direct ?? ''}"></td>
    <td><select class="preset">${opts}</select></td>
    <td><button type="button" class="del">삭제</button></td>`;
  tr.querySelector('.del').onclick = () => tr.remove();
  $('acts').tBodies[0].appendChild(tr);
}

function readActs() {
  const rows = [...$('acts').tBodies[0].rows];
  if (!rows.length) throw new Error('공종을 1개 이상 추가하세요');
  return rows.map((tr, i) => {
    const v = c => parseFloat(tr.querySelector(c).value);
    const name = tr.querySelector('.name').value || `공종${i + 1}`;
    let workDays = v('.direct');
    if (Number.isNaN(workDays)) {
      if (!(v('.qty') > 0 && v('.rate') > 0 && v('.crew') > 0))
        throw new Error(`${name}: 수량·1일작업량·조수 또는 작업일수(직접)를 입력하세요`);
      workDays = v('.qty') / (v('.rate') * v('.crew')) + (v('.extra') || 0);
    }
    if (!(workDays > 0)) throw new Error(`${name}: 작업일수는 0보다 커야 합니다`);
    return { name, workDays, preset: tr.querySelector('.preset').value };
  });
}

function calc() {
  showError('');
  try {
    if (!DB) throw new Error('데이터를 아직 불러오지 못했습니다');
    if (!$('start').value) throw new Error('착공일을 입력하세요');
    const clean = +$('cleanDays').value;
    if (clean > 30) throw new Error('정리기간은 최대 30일입니다');
    last = calcProject({
      startDate: $('start').value, station: $('station').value,
      prepDays: +$('prepDays').value, cleanDays: clean,
      acts: readActs(), db: DB, dust: $('dust').checked, round: $('round').checked
    });
    render(last);
  } catch (e) { showError(e.message); console.error(e); }
}

function render(p) {
  renderResult(p);                       // 요약·타임라인·그래프·표 (result.js)
  $('verifyCard').hidden = false;
  $('verifyOut').innerHTML = '';

  // 산정 근거: 공종별 월별 A·B·C
  $('calcDetail').innerHTML = p.results.map(r => `<details><summary>${r.name} 월별 내역</summary>
    <div class="tbl-wrap"><table class="tbl">
    <tr><th>년월</th><th>A 기상</th><th>B 공휴일</th><th>C 중복</th><th>비작업일</th><th>반영 작업일</th><th>반영 비작업일</th></tr>
    ${r.log.map(l => `<tr><td>${l.y}.${l.m}</td><td>${r1(l.A)}</td><td>${l.B}</td><td>${r1(l.C)}</td>
      <td>${r1(l.N)}</td><td>${r1(l.work)}</td><td>${r1(l.non)}</td></tr>`).join('')}</table></div></details>`).join('');

  $('result').scrollIntoView({ behavior: 'smooth' });
}

function downloadCSV() {
  if (!last) return;
  const rows = [['공종', '착수', '완료', '작업일', '비작업일', '공사기간'],
    ...last.results.map(r => [r.name, fmt(cursorToDate(r.begin)), fmt(cursorToDate(r.end)),
      r1(r.workDays), r1(r.nonWork), r1(r.duration)]),
    [], ['준비기간', last.prepDays], ['정리기간', last.cleanDays], ['총 공사기간', last.total],
    ['준공 예정일', fmt(last.finish)]];
  const blob = new Blob(['\uFEFF' + rows.map(r => r.join(',')).join('\n')], { type: 'text/csv' });
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: '공사기간_산정.csv' });
  a.click();
}

function doVerify() {
  try {
    if (!last) throw new Error('먼저 공사기간을 계산하세요');
    const vars = { C: +$('vC').value, G: parseFloat($('vG').value), B: parseFloat($('vB').value), A: parseFloat($('vA').value) };
    const r = verify($('model').value, vars, last.prepDays, last.cleanDays, last.total);
    $('verifyOut').innerHTML = `회귀식 Y = ${r1(r.Y)}일 → 비교기준 B = ${r1(r.B)}일<br>
      산정값 A = ${last.total}일, 차이 ${r1(r.dev * 100)}% →
      <span class="${r.ok ? 'ok' : 'ng'}">${r.ok ? '적정 (±20% 이내)' : '재검토 필요 (±20% 초과)'}</span>`;
  } catch (e) { $('verifyOut').textContent = e.message; }
}

$('addRow').onclick = () => addRow();
$('calc').onclick = calc;
$('csv').onclick = downloadCSV;
$('verify').onclick = doVerify;
init().catch(e => showError('데이터 불러오기 실패: ' + e.message));
