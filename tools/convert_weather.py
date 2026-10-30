# 입력 CSV 열: 지점코드,지점명,조건ID,1,2,...,12
import pandas as pd, json
df = pd.read_csv('appendix3.csv', dtype={'지점코드': str})
out = {"stations": {}}
for _, r in df.iterrows():
    st = out["stations"].setdefault(r['지점코드'], {"name": r['지점명'], "data": {}})
    st["data"][r['조건ID']] = [float(r[str(m)]) for m in range(1, 13)]
json.dump(out, open('../data/weather.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
