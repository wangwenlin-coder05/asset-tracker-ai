"""回测报告序列化：引擎结果 -> 供前端渲染的 JSON。"""
from __future__ import annotations

from .engine import EngineResult


def serialize_report(result: EngineResult, strategy_name: str,
                     params: dict) -> dict:
    """把引擎结果转成简洁 JSON，供 REST API / 前端使用。"""
    return {
        "code": result.code,
        "strategy": strategy_name,
        "params": params,
        "range": {
            "start": result.start_date,
            "end": result.end_date,
        },
        "metrics": {
            "initial_cash": result.initial_cash,
            "final_equity": round(result.final_equity, 2),
            "total_return_pct": round(result.total_return * 100, 4),
            "annualized_pct": round(result.annualized_return * 100, 4),
            "max_drawdown_pct": round(result.max_drawdown * 100, 4),
            "sharpe_ratio": result.sharpe_ratio,
            "calmar_ratio": result.calmar_ratio,
            "win_rate_pct": round(result.win_rate * 100, 4),
            "profit_loss_ratio": result.profit_loss_ratio,
            "profit_factor": result.profit_factor,
            "avg_win": result.avg_win,
            "avg_loss": result.avg_loss,
            "max_consecutive_wins": result.max_consecutive_wins,
            "max_consecutive_losses": result.max_consecutive_losses,
            "yearly_returns": result.yearly_returns,
            "trade_count": result.trade_count,
        },
        "equity_curve": [
            {"date": p.date, "equity": round(p.equity, 2)}
            for p in result.equity_curve
        ],
        "drawdown_curve": _drawdown_curve(result),
        "trades": [
            {
                "code": t.code,
                "entry_date": t.entry_date,
                "exit_date": t.exit_date,
                "entry_price": round(t.entry_price, 4),
                "exit_price": round(t.exit_price, 4),
                "shares": t.shares,
                "net_pnl": round(t.net_pnl, 2),
                "return_pct": round(t.return_pct * 100, 4),
                "reason": t.reason,
                "entry_reason": t.entry_reason,
                "add_count": t.add_count,
            }
            for t in result.trades
        ],
    }


def _drawdown_curve(result: EngineResult) -> list[dict]:
    """净值回撤曲线：从净值曲线上逐点计算，便于前端绘制。"""
    curve = result.equity_curve
    out = []
    peak = -1.0
    for p in curve:
        peak = max(peak, p.equity)
        dd = (peak - p.equity) / peak if peak > 0 else 0.0
        out.append({
            "date": p.date,
            "drawdown_pct": round(dd * 100, 4),
        })
    return out