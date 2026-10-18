"""个股资讯：东方财富个股新闻 + 巨潮官方公告。

用法：python stock_news.py 600519
输出：JSON {news: [...], notices: [...], source: "akshare"|"direct"}

优先走 akshare；本机 curl_cffi TLS 异常时自动降级为 Python 标准库
urllib 直连东财/巨潮官方接口。全部失败输出空数组（接口层另有 1h 缓存兜底）。
"""
import json
import sys

if len(sys.argv) < 2:
    print(json.dumps({"news": [], "notices": [], "source": "none"}))
    sys.exit(0)

code = sys.argv[1].strip()
out = {"news": [], "notices": [], "source": "none"}


def _norm(v):
    if v is None:
        return None
    s = str(v).strip()
    if s in ('', 'nan', 'None', 'NaT'):
        return None
    if 'T' in s:
        s = s.split('T')[0]
    return s


def _http_get(url, headers, timeout=15):
    import urllib.request
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read()


# ---------- 主路径：akshare ----------
def via_akshare():
    import akshare as ak
    out["source"] = "akshare"
    try:
        df = ak.stock_news_em(symbol=code)
        for r in df.to_dict('records'):
            out['news'].append({
                'title': _norm(r.get('新闻标题')) or _norm(r.get('标题')),
                'time': _norm(r.get('发布时间')) or _norm(r.get('时间')),
                'url': _norm(r.get('新闻链接')) or _norm(r.get('链接')),
                'source': _norm(r.get('来源')),
                'summary': _norm(r.get('新闻内容摘要')) or _norm(r.get('摘要')),
            })
    except Exception as e:
        print(f'NEWS_ERROR: {e}', file=sys.stderr)
    try:
        df2 = ak.stock_notice_report(symbol=code)
        for r in df2.to_dict('records'):
            out['notices'].append({
                'title': _norm(r.get('公告标题')) or _norm(r.get('标题')),
                'time': _norm(r.get('公告日期')) or _norm(r.get('日期')),
                'type': _norm(r.get('公告类型')) or _norm(r.get('类型')),
                'url': _norm(r.get('公告链接')) or _norm(r.get('链接')),
                'source': '巨潮',
            })
    except Exception as e:
        print(f'NOTICE_ERROR: {e}', file=sys.stderr)


# ---------- 降级路径：urllib 直连官方接口 ----------
def via_direct():
    out["source"] = "direct"
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://guba.eastmoney.com/',
    }
    # 1) 东财个股新闻（搜索接口，按代码检索，JSONP 返回）
    try:
        import time as _t
        import urllib.parse
        param = json.dumps({
            "uid": "", "keyword": code,
            "type": ["cmsArticleSea"], "scene": "",
            "timestamp": int(_t.time()), "pageSize": 20, "pageIndex": 1,
            "client": "web", "clientType": "web", "version": "100"
        }, ensure_ascii=False)
        url = ('https://search-api-web.eastmoney.com/search/jsonp?cb=jQuery&param='
               + urllib.parse.quote(param))
        raw = _http_get(url, headers).decode('utf-8', errors='ignore')
        m = raw[raw.find('(') + 1: raw.rfind(')')]
        payload = json.loads(m)
        items = (payload.get('result') or {}).get('cmsArticleSea') or []
        for it in items:
            out['news'].append({
                'title': _norm(it.get('title')),
                'time': _norm(it.get('display_time') or it.get('showTime')),
                'url': _norm(it.get('urlWeb') or it.get('url')),
                'source': _norm(it.get('mediaName') or it.get('media_name')),
                'summary': _norm(it.get('content')),
            })
        print(f'NEWS_DIRECT: {len(items)} items', file=sys.stderr)
    except Exception as e:
        print(f'NEWS_DIRECT_ERROR: {e}', file=sys.stderr)

    # 2) 巨潮官方公告（cninfo 公开检索接口）
    try:
        import urllib.parse
        num = code.split('.')[0]
        q = urllib.parse.urlencode({
            'pageNum': 1, 'pageSize': 20, 'column': 'szse', 'tabName': 'fulltext',
            'stock': f'{num}', 'searchkey': '', 'secid': '', 'category': '',
            'plate': 'sz', 'seDate': '',
        })
        data = json.loads(_http_get(
            'http://www.cninfo.com.cn/new/hisAnnouncement/query?' + q,
            headers, timeout=20,
        ).decode('utf-8', errors='ignore'))
        for ann in (data.get('announcements') or []):
            out['notices'].append({
                'title': _norm(ann.get('announcementTitle')),
                'time': _norm(ann.get('announcementTime')),
                'type': _norm(ann.get('announcementType')),
                'url': 'http://static.cninfo.com.cn/' + (_norm(ann.get('adjunctUrl')) or ''),
                'source': '巨潮',
            })
        print(f'NOTICE_DIRECT: {len(data.get("announcements") or [])} items', file=sys.stderr)
    except Exception as e:
        print(f'NOTICE_DIRECT_ERROR: {e}', file=sys.stderr)


via_akshare()
if not out['news'] and not out['notices']:
    try:
        via_direct()
    except Exception as e:
        print(f'DIRECT_FALLBACK_ERROR: {e}', file=sys.stderr)

print(json.dumps(out, ensure_ascii=False))
