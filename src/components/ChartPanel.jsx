import { useEffect, useRef } from 'react';
import { createChart } from 'lightweight-charts';

// ChartPanel — candlestick + EMA20/EMA50 overlay + volume + RSI subpanel
// (spec §3.3). Renders EXCLUSIVELY from `bars`/`series` as shipped in
// data.json — never recomputes an indicator in the browser (RULES §3).
//
// lightweight-charts v4.2.3 has no built-in multi-pane/subplot support (that
// landed in a later major), so RSI gets its own smaller chart instance
// stacked below the main one via CSS, rather than a second price scale
// crammed into the same pane — the standard pre-v5 pattern for this library.
//
// Known limitation, called out rather than silently shipped: the two chart
// instances are NOT synced (scrolling/zooming one doesn't move the other).
// Bidirectional `subscribeVisibleLogicalRangeChange` sync is a well-known
// pattern for this library, but it's also a well-known source of infinite
// update loops if not handled carefully, and that failure mode is not
// something jsdom-mocked tests can catch — only a real browser can. Given
// this session has no working visual preview tool, shipping unverified sync
// logic is a worse risk than shipping two independently-scrollable charts.
// Both call fitContent() on load, so they start aligned. Flagged as a
// follow-up once visual testing is available.

const COLORS = {
  ema50: '#388bfd', // blue, per spec §3.3
  ema20: '#f0883e', // orange, per spec §3.3
  up: '#2ea043',
  down: '#da3633',
  rsiLine: '#a371f7',
  grid: '#2a313c',
  text: '#8b949e',
};

const CHART_BASE_OPTIONS = {
  layout: { background: { color: 'transparent' }, textColor: COLORS.text },
  grid: { vertLines: { color: COLORS.grid }, horzLines: { color: COLORS.grid } },
  timeScale: { borderColor: COLORS.grid },
  rightPriceScale: { borderColor: COLORS.grid },
};

// series values may contain `null` for indicator warmup gaps (ema()/rsi() in
// scripts/indicators.js). lightweight-charts line series require omitting
// those points entirely, not passing value:null.
function toLinePoints(bars, values) {
  if (!values) return [];
  return values.map((v, i) => (v == null ? null : { time: bars[i].time, value: v })).filter(Boolean);
}

export default function ChartPanel({ bars, series }) {
  const mainRef = useRef(null);
  const rsiRef = useRef(null);
  const hasData = Array.isArray(bars) && bars.length > 0 && series;

  useEffect(() => {
    if (!hasData || !mainRef.current || !rsiRef.current) return undefined;

    const mainChart = createChart(mainRef.current, {
      ...CHART_BASE_OPTIONS,
      width: mainRef.current.clientWidth,
      height: 320,
      rightPriceScale: { ...CHART_BASE_OPTIONS.rightPriceScale, scaleMargins: { top: 0.08, bottom: 0.28 } },
    });

    const candleSeries = mainChart.addCandlestickSeries({
      upColor: COLORS.up,
      downColor: COLORS.down,
      borderUpColor: COLORS.up,
      borderDownColor: COLORS.down,
      wickUpColor: COLORS.up,
      wickDownColor: COLORS.down,
    });
    candleSeries.setData(bars.map((b) => ({ time: b.time, open: b.open, high: b.high, low: b.low, close: b.close })));

    // Highlight the current (most recent) candle, per spec §3.3.
    const lastBar = bars[bars.length - 1];
    candleSeries.setMarkers([
      { time: lastBar.time, position: 'aboveBar', color: COLORS.text, shape: 'arrowDown', text: 'today' },
    ]);

    const volumeSeries = mainChart.addHistogramSeries({ priceScaleId: 'volume', priceFormat: { type: 'volume' } });
    volumeSeries.priceScale().applyOptions({ scaleMargins: { top: 0.78, bottom: 0 } });
    volumeSeries.setData(
      bars.map((b) => ({ time: b.time, value: b.volume, color: b.close >= b.open ? COLORS.up : COLORS.down }))
    );

    const ema50Series = mainChart.addLineSeries({ color: COLORS.ema50, lineWidth: 2, priceLineVisible: false });
    ema50Series.setData(toLinePoints(bars, series.ema50));

    const ema20Series = mainChart.addLineSeries({ color: COLORS.ema20, lineWidth: 2, priceLineVisible: false });
    ema20Series.setData(toLinePoints(bars, series.ema20));

    const rsiChart = createChart(rsiRef.current, {
      ...CHART_BASE_OPTIONS,
      width: rsiRef.current.clientWidth,
      height: 120,
      rightPriceScale: { ...CHART_BASE_OPTIONS.rightPriceScale, scaleMargins: { top: 0.1, bottom: 0.1 } },
    });
    const rsiSeries = rsiChart.addLineSeries({ color: COLORS.rsiLine, lineWidth: 2 });
    rsiSeries.setData(toLinePoints(bars, series.rsi));
    // Dashed reference lines at 38 and 50, per spec §3.3.
    rsiSeries.createPriceLine({ price: 38, color: COLORS.text, lineStyle: 2, lineWidth: 1, axisLabelVisible: true, title: '38' });
    rsiSeries.createPriceLine({ price: 50, color: COLORS.text, lineStyle: 2, lineWidth: 1, axisLabelVisible: true, title: '50' });

    mainChart.timeScale().fitContent();
    rsiChart.timeScale().fitContent();

    // Keep both charts sized to their container on resize (mobile-friendly, RULES §7).
    const resizeObserver = new ResizeObserver(() => {
      if (mainRef.current) mainChart.applyOptions({ width: mainRef.current.clientWidth });
      if (rsiRef.current) rsiChart.applyOptions({ width: rsiRef.current.clientWidth });
    });
    resizeObserver.observe(mainRef.current);

    return () => {
      resizeObserver.disconnect();
      mainChart.remove();
      rsiChart.remove();
    };
  }, [hasData, bars, series]);

  if (!hasData) {
    return <p className="chart-empty">No chart data available for this stock.</p>;
  }

  return (
    <div className="chart-panel">
      <div ref={mainRef} className="chart-main" />
      <div ref={rsiRef} className="chart-rsi" />
    </div>
  );
}
