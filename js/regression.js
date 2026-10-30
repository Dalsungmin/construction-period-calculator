const ln = Math.log;
const upTo = max => v => v.C > 0 && v.C <= max;
const between = (a, b) => v => v.C >= a && v.C <= b;
const min10 = v => v.C >= 10;

// C: 억원, G: 지상층, B: 지하층, A: 연면적(100㎡ 단위로 변환해 사용)
export const REGRESSION = {
  school:  { label: '학교',            rangeText: '≤200억',  inRange: upTo(200), f: v => 129.06 * v.C ** 0.2557 },
  office:  { label: '청사',            rangeText: '≤500억',  inRange: upTo(500), f: v => 155.94 * ln(v.C) - 82.355 },
  medical: { label: '의료시설',        rangeText: '≤200억',  inRange: upTo(200), f: v => -0.0385 * v.C ** 2 + 8.9084 * v.C + 140.87 },
  police:  { label: '경찰서',          rangeText: '≤300억',  inRange: upTo(300), f: v => -0.0154 * v.C ** 2 + 7.9986 * v.C + 145.51 },
  univ:    { label: '대학·연구시설',   rangeText: '5~300억', inRange: between(5, 300), f: v => 201.62 * ln(v.C) - 175.51 },
  culture: { label: '공연·전시시설',   rangeText: '5~300억', inRange: between(5, 300), f: v => -205.7 * ln(v.C) + 1375.4 },
  dorm:    { label: '기숙사',          rangeText: '≤200억',  inRange: upTo(200), f: v => -0.0204 * v.C ** 2 + 6.6742 * v.C + 166.51 },
  factory: { label: '공장·창고',       rangeText: '≤200억',  inRange: upTo(200), f: v => -0.0271 * v.C ** 2 + 6.9664 * v.C + 146.97 },
  sports1: { label: '체육시설(1)',     rangeText: '≤300억',  inRange: upTo(300), f: v => 112.19 * v.C ** 0.3719 },
  fire:    { label: '소방시설',        rangeText: '≤200억',  inRange: upTo(200), f: v => -0.0497 * v.C ** 2 + 10.744 * v.C + 114.94 },
  apt:     { label: '공동주택',        rangeText: '≥10억, G 필요',     inRange: min10, need: ['G'],
             f: v => -21.674 + 7.953 * v.G + 116.835 * ln(v.C) },
  sports2: { label: '체육시설(2)',     rangeText: '≥10억',  inRange: min10, f: v => -278.109 + 189.438 * ln(v.C) },
  etc:     { label: '기타 건축물',     rangeText: '≥10억, G·B·A 필요', inRange: min10, need: ['G', 'B', 'A'],
             f: v => -68.550 + 18.192 * v.B + 12.079 * v.G - 5.25 * ln(v.A / 100) + 167.632 * ln(v.C) }
};

// 회귀식 Y에는 비작업일수가 포함되어 있으므로 준비·정리기간만 더함
export function verify(key, vars, prep, clean, planned) {
  const r = REGRESSION[key];
  for (const k of r.need ?? []) if (!(vars[k] >= 0) || Number.isNaN(vars[k])) throw new Error(`${k} 값을 입력하세요`);
  if (!r.inRange(vars)) throw new Error(`적용범위 밖입니다 (${r.rangeText}). 회귀식 검증을 할 수 없습니다.`);
  const Y = r.f(vars), B = Y + prep + clean;
  const dev = Math.abs(planned - B) / B;
  return { Y, B, dev, ok: dev <= 0.2 };
}

