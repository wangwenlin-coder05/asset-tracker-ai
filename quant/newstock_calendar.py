"""打新日历：优先东方财富全量申购总览（A股新股 + 可转债），失败回落同花顺。

输出统一 schema，供 /api/newstock-calendar 使用：
[{date, applyCode, name, price, marketValue, limit, lotteryDate, listingDate}]
"""
import json
import sys
from datetime import date, datetime

sys.stdout.reconfigure(encoding='utf-8')

# 东财 xgsglb 全量总览约 4000 行（含历史已上市），只保留未来/最近未上市的新股
DEFAULT_MAX_ROWS = 80
DEFAULT_KEEP_DAYS = 21


def norm(value):
    """空值归一：NaN / 'nan' / 'None' / 空串 → null。"""
    if value is None:
        return None
    if isinstance(value, float) and value != value:  # NaN
        return None
    text = str(value).strip()
    if text in ('', 'nan', 'None', 'NaT', '--', '-'):
        return None
    # 东财日期列常带 ' 00:00:00'，归一为 YYYY-MM-DD
    if 'T' in text:
        text = text.split('T')[0]
    elif ' ' in text:
        text = text.split(' ')[0]
    if len(text) == 10 and text[4] == '-' and text[7] == '-':
        return text
    return text


def from_df(frame):
    """按东财/同花顺字段名做宽松匹配（列名可能带单位后缀，按前缀/包含匹配）。"""
    records = []
    for row in frame.to_dict('records'):
        # 键归一：小写去空格，便于按包含匹配
        keys = {str(k).strip().lower(): v for k, v in row.items()}

        def find(*needles):
            for key, value in keys.items():
                if any(n in key for n in needles):
                    return norm(value)
            return None

        records.append({
            'date': find('申购日期', '发行日期'),
            'applyCode': find('申购代码'),
            'name': find('股票简称', '名称'),
            'price': find('发行价', '申购价', '中签价'),
            'marketValue': find('顶格', '配市值'),
            'limit': find('申购上限', '申购数量'),
            'lotteryDate': find('中签号公布', '中签公布'),
            'listingDate': find('上市日期'),
        })
    return records


def main():
    import os

    try:
        import akshare as ak
    except Exception as exc:
        print(f'AKSHARE_IMPORT_ERROR:{exc}', file=sys.stderr)
        sys.exit(2)

    try:
        keep_days = int(os.environ.get('CALENDAR_KEEP_DAYS', DEFAULT_KEEP_DAYS))
    except ValueError:
        keep_days = DEFAULT_KEEP_DAYS
    try:
        max_rows = int(os.environ.get('CALENDAR_MAX_ROWS', DEFAULT_MAX_ROWS))
    except ValueError:
        max_rows = DEFAULT_MAX_ROWS

    # 方案 A：东方财富新股申购总览（全量，含可转债）
    try:
        frame = ak.stock_xgsglb_em()
        rows = from_df(frame)
        # 过滤：申购日期 >= 今天 - keep_days；去重（按 code + 申购日期）；截断
        today = date.today().isoformat()
        seen = set()
        kept = []
        for r in rows:
            d = r.get('date')
            key = (r.get('applyCode') or r.get('code'), d)
            if not d:
                continue
            if d < today:
                continue
            if key in seen:
                continue
            seen.add(key)
            kept.append(r)
        kept.sort(key=lambda r: (r.get('date') or '', r.get('applyCode') or ''), reverse=True)
        kept = kept[:max_rows]
        json.dump(kept, sys.stdout, ensure_ascii=False)
        print(f'CALENDAR_SOURCE:stock_xgsglb_em rows={len(kept)}', file=sys.stderr)
        return
    except Exception as exc:
        print(f'XGSHGLB_EM_ERROR:{exc}', file=sys.stderr)

    # 回落：同花顺新股申购
    try:
        frame = ak.stock_ipo_ths()
        rows = from_df(frame)
        json.dump(rows, sys.stdout, ensure_ascii=False)
        print(f'CALENDAR_SOURCE:stock_ipo_ths rows={len(rows)}', file=sys.stderr)
    except Exception as exc:
        print(f'IPO_THS_ERROR:{exc}', file=sys.stderr)
        sys.exit(3)


if __name__ == '__main__':
    main()
