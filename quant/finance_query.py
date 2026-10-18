"""财经结构化查询：把「股票 / 可转债 / 新股打新 / 指数行情 / 宏观财经」类问题
直接交给 akshare 拿结构化数据，不做通用网页检索。

用法：python finance_query.py "查询语句"
输出（stdout 最后一行）：{"intent":"...","source":"akshare","items":[{"title","snippet","url"}]}

设计要点：
1. 每个处理分支独立 try/except，任一支路失败只丢该支路，整体仍输出合法 JSON；
2. url 一律指向可点击的真实页面（东财行情页 / 公告页），没有网址就留空；
3. 只读公开接口，不需要任何 API Key。
"""
import json
import re
import sys

QUERY = sys.argv[1].strip() if len(sys.argv) > 1 else ''

OUT = {"intent": "none", "source": "akshare", "items": []}


def log(msg):
    print(msg, file=sys.stderr)


def norm(value):
    if value is None:
        return ''
    text = str(value).strip()
    if text in ('nan', 'None', 'NaT', 'NaN'):
        return ''
    return text


def push(title, snippet, url=''):
    title = norm(title)
    snippet = norm(snippet)
    if not title and not snippet:
        return
    if len(snippet) > 300:
        snippet = snippet[:300] + '…'
    OUT['items'].append({'title': title, 'snippet': snippet, 'url': norm(url)})


def quote_url(code):
    """A 股 6 位代码 → 东财行情页"""
    code = str(code or '').strip()
    if not re.fullmatch(r'\d{6}', code):
        return ''
    market = 'sh' if code[0] in ('5', '6', '9') else 'sz'
    return f'https://quote.eastmoney.com/{market}{code}.html'


def has(*words):
    return any(word in QUERY for word in words)


# ---------- 各分支 ----------

def q_new_stock():
    """打新 / 新股申购 / 中签"""
    OUT['intent'] = 'new-stock'
    import akshare as ak
    df = None
    for kwargs in ({'symbol': '全部'}, {'symbol': '沪深京'}, {}):
        try:
            df = ak.stock_xgsglb_em(**kwargs)
            if df is not None and len(df):
                break
        except Exception as err:
            log(f'NEWSTOCK_TRY_ERROR: {err}')
    if df is None or not len(df):
        raise RuntimeError('新股申购与中签数据为空')
    for row in df.head(20).to_dict('records'):
        code = norm(row.get('股票代码'))
        name = norm(row.get('股票简称'))
        price = norm(row.get('发行价'))
        date = norm(row.get('申购日期'))
        push(
            f'{name}（{code}）发行价 {price}',
            f'申购日期 {date}；申购上限 {norm(row.get("申购上限"))}；中签号公布 {norm(row.get("中签号公布日"))}；上市日期 {norm(row.get("上市日期"))}',
            quote_url(code)
        )


def q_bond():
    """可转债"""
    OUT['intent'] = 'convertible-bond'
    import akshare as ak
    df = ak.bond_zh_cov()
    if df is None or not len(df):
        raise RuntimeError('可转债数据为空')
    keyword = QUERY.replace('可转债', '').replace('转债', '').strip()
    hit = df
    if keyword and re.fullmatch(r'\d{6}', keyword):
        hit = df[df['债券代码'].astype(str) == keyword]
    for row in hit.head(20).to_dict('records'):
        code = norm(row.get('债券代码'))
        push(
            f'{norm(row.get("债券简称"))}（{code}）',
            f'正股 {norm(row.get("正股代码"))} {norm(row.get("正股简称"))}；发行日期 {norm(row.get("申购日期"))}；中签号公布 {norm(row.get("中签号公布日"))}；评级 {norm(row.get("信用评级"))}',
            quote_url(code)
        )


def q_index():
    """大盘 / 指数行情"""
    OUT['intent'] = 'index'
    import akshare as ak
    df = ak.stock_zh_index_spot_em(symbol='沪深重要指数')
    if df is None or not len(df):
        raise RuntimeError('指数行情为空')
    for row in df.head(20).to_dict('records'):
        push(
            f'{norm(row.get("名称"))} {norm(row.get("最新价"))}',
            f'涨跌幅 {norm(row.get("涨跌幅"))}%；涨跌额 {norm(row.get("涨跌额"))}；成交额 {norm(row.get("成交额"))}；最高 {norm(row.get("最高"))}；最低 {norm(row.get("最低"))}'
        )


def q_board():
    """行业板块"""
    OUT['intent'] = 'industry-board'
    import akshare as ak
    df = ak.stock_board_industry_name_em()
    if df is None or not len(df):
        raise RuntimeError('行业板块数据为空')
    for row in df.head(20).to_dict('records'):
        push(
            f'{norm(row.get("板块名称"))} {norm(row.get("最新价"))}',
            f'涨跌幅 {norm(row.get("涨跌幅"))}%；总市值 {norm(row.get("总市值"))}；上涨家数 {norm(row.get("上涨家数"))}；下跌家数 {norm(row.get("下跌家数"))}；领涨股票 {norm(row.get("领涨股票"))}'
        )


def q_stock():
    """个股：查询里带 6 位代码时给该股详情"""
    OUT['intent'] = 'stock'
    import akshare as ak
    match = re.search(r'(\d{6})', QUERY)
    if not match:
        return False
    code = match.group(1)
    df = ak.stock_individual_info_em(symbol=code)
    if df is None or not len(df):
        raise RuntimeError('个股信息为空')
    pairs = {norm(r.get('item')): norm(r.get('value')) for r in df.to_dict('records')}
    push(
        f'{pairs.get("股票简称", code)}（{code}）',
        '；'.join(f'{k} {v}' for k, v in pairs.items() if v)[:300],
        quote_url(code)
    )
    return True


def q_macro():
    """宏观财经数据"""
    OUT['intent'] = 'macro'
    import akshare as ak
    if has('GDP', 'gdp', '国内生产总值'):
        df = ak.macro_china_gdp_yearly()
        label = '中国 GDP 年率'
    elif has('CPI', 'cpi', '物价'):
        df = ak.macro_china_cpi_yearly()
        label = '中国 CPI 年率'
    elif has('货币', 'M2', 'm2', 'M1'):
        df = ak.macro_china_money_supply()
        label = '中国货币供应量'
    elif has('汇率', '美元', '人民币'):
        df = ak.fx_spot_quote()
        label = '人民币外汇即期报价'
    else:
        df = ak.bond_zh_us_rate()
        label = '中美国债收益率'
    if df is None or not len(df):
        raise RuntimeError('宏观数据为空')
    for row in df.tail(12).to_dict('records'):
        text = '；'.join(f'{k} {norm(v)}' for k, v in row.items() if norm(v))
        push(f'{label}', text[:300])


HANDLERS = [
    (lambda: has('打新', '新股', '申购', '中签'), q_new_stock),
    (lambda: has('可转债', '转债'), q_bond),
    (lambda: has('板块', '行业'), q_board),
    (lambda: has('大盘', '指数', '上证', '深证', '创业板', '沪深300', '行情'), q_index),
    (lambda: bool(re.search(r'\d{6}', QUERY)), q_stock),
    (lambda: has('GDP', 'gdp', 'CPI', 'cpi', '汇率', '货币', 'M2', '国债', '宏观', '物价'), q_macro),
]


def main():
    if not QUERY:
        return
    try:
        import akshare  # noqa: F401  仅用于确认依赖存在
    except Exception as err:
        OUT['source'] = 'none'
        log(f'AKSHARE_MISSING: {err}')
        return
    for match, handler in HANDLERS:
        if not match():
            continue
        try:
            handler()
            if OUT['items']:
                return
        except Exception as err:
            log(f'HANDLER_ERROR [{handler.__name__}]: {err}')


main()
print(json.dumps(OUT, ensure_ascii=False))
