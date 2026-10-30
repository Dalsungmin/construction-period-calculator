// 조건 ID: 부록3 대응
export const CONDITIONS = {
  feel33: '체감온도 ≥33℃', feel35: '체감온도 ≥35℃',
  tmax33: '일최고 ≥33℃',  tmax35: '일최고 ≥35℃',
  tmax0: '일최고 ≤0℃',    snow5: '신적설 ≥5cm',
  tmax0_or_snow5: '일최고 ≤0℃ 또는 신적설 ≥5cm',
  tmin_m12: '일최저 ≤-12℃',
  rain3: '강수 ≥3mm', rain5: '강수 ≥5mm', rain10: '강수 ≥10mm', rain20: '강수 ≥20mm',
  wind15: '최대순간풍속 ≥15m/s'
};

// 공종별 기상조건 프리셋 (부록3에 있는 조건만 사용)
export const PRESETS = {
  earth:    { label: '토공·가시설(옥외)',  conds: ['rain5', 'tmax0_or_snow5', 'wind15'] },
  concrete: { label: '콘크리트 구조물',    conds: ['rain3', 'feel33', 'tmax0_or_snow5', 'wind15'] },
  rcBldg:   { label: '건축 철근콘크리트',  conds: ['tmax0', 'rain3', 'wind15', 'snow5', 'feel33'] },
  tunnel:   { label: '터널(옥내)',         conds: ['feel33', 'tmax0'] },
  indoor:   { label: '옥내(기상 미적용)',  conds: [] }
};

export const daysInMonth = (y, m) => new Date(y, m, 0).getDate(); // m: 1~12

// 월 비작업일수 = max(A + B − A×B/D, 8)
export function monthlyNonWork({ y, m, station, conds, db, dust, round }) {
  const D = daysInMonth(y, m);
  const st = db.weather.stations[station];
  if (!st) throw new Error(`관측지점 ${station} 데이터 없음`);

  let A = conds.reduce((sum, c) => {
    const arr = st.data[c];
    if (!arr) throw new Error(`${st.name}: '${CONDITIONS[c]}' 데이터 없음`);
    return sum + arr[m - 1];
  }, 0);
  if (dust) A += 5 / 12;

  const hy = db.holidays[y];
  if (!hy) throw new Error(`${y}년 공휴일 데이터 없음 (holidays.json 갱신 필요)`);
  const B = hy[m - 1];
  const C = (A * B) / D;

  let N = Math.max(A + B - C, 8);
  if (round) N = Math.round(N);
  return { y, m, D, A, B, C, N };
}

// 커서: { y, m, off }  off = 해당 월에서 경과한 달력일(소수 허용)
export function addCalendarDays(c, days) {
  let { y, m, off } = c;
  off += days;
  while (off >= daysInMonth(y, m)) {
    off -= daysInMonth(y, m);
    if (++m > 12) { m = 1; y++; }
  }
  return { y, m, off };
}

// 공종 1개 일정 계산 (월 차감 + 마지막 달 비례 방식)
export function scheduleActivity(start, workDays, opts) {
  let { y, m, off } = start;
  let remain = workDays, nonWork = 0, guard = 0;
  const log = [];

  while (remain > 1e-9) {
    if (++guard > 600) throw new Error('계산 기간이 50년을 초과합니다');
    const r = monthlyNonWork({ ...opts, y, m });
    const rate = (r.D - r.N) / r.D;              // 달력 1일당 작업가능일
    if (rate <= 0) throw new Error(`${y}.${m} 작업가능일 없음`);

    const calLeft = r.D - off;
    const workAvail = calLeft * rate;

    if (remain >= workAvail) {                    // 이번 달을 모두 사용
      nonWork += calLeft - workAvail;
      remain -= workAvail;
      log.push({ ...r, work: workAvail, non: calLeft - workAvail });
      off = 0; if (++m > 12) { m = 1; y++; }
    } else {                                      // 마지막 달: 비례 배분
      const cal = remain / rate;
      nonWork += cal - remain;
      log.push({ ...r, work: remain, non: cal - remain });
      off += cal; remain = 0;
    }
  }
  return { nonWork, duration: workDays + nonWork, end: { y, m, off }, log };
}

// 전체 공사기간
export function calcProject({ startDate, station, prepDays, cleanDays, acts, db, dust, round }) {
  const d = new Date(startDate);
  let cur = addCalendarDays({ y: d.getFullYear(), m: d.getMonth() + 1, off: d.getDate() - 1 }, prepDays);

  const results = acts.map(a => {
    const begin = cur;
    const r = scheduleActivity(cur, a.workDays, { station, conds: PRESETS[a.preset].conds, db, dust, round });
    cur = r.end;
    return { ...a, begin, ...r };
  });

  const cpSum = results.reduce((s, r) => s + r.duration, 0);
  const total = Math.ceil(prepDays + cpSum + cleanDays);   // 비작업일: 준비·정리기간 미계상
  const finish = new Date(d); finish.setDate(d.getDate() + total - 1);
  return { prepDays, cleanDays, cpSum, total, finish, results };
}

export const cursorToDate = c => new Date(c.y, c.m - 1, 1 + Math.floor(c.off));
