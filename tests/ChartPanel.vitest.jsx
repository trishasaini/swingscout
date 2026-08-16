import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import ChartPanel from '../src/components/ChartPanel';

// lightweight-charts needs real <canvas> 2D context support jsdom doesn't
// provide, so it's mocked entirely — these tests assert on WHAT DATA ChartPanel
// hands the chart API (RULES §3: never invent/recompute values) and that
// mount/unmount lifecycle is correct, not on actual pixel output (per the
// plan: "pixel-level rendering isn't practically unit-testable").

let createdCharts;

// A real timeScale mock: tracks subscribed handlers and actually invokes them
// from setVisibleLogicalRange, so tests can simulate the real event cascade
// lightweight-charts performs (this is what a re-entrancy-guard bug would
// actually loop through). The call-count cap is a test-harness safety net —
// if the component's own guard ever regresses, this throws instead of
// hanging the test runner.
function makeTimeScale() {
  const handlers = new Set();
  let setCallCount = 0;
  return {
    fitContent: vi.fn(),
    subscribeVisibleLogicalRangeChange: vi.fn((handler) => handlers.add(handler)),
    unsubscribeVisibleLogicalRangeChange: vi.fn((handler) => handlers.delete(handler)),
    setVisibleLogicalRange: vi.fn((range) => {
      setCallCount += 1;
      if (setCallCount > 50) throw new Error('setVisibleLogicalRange exceeded 50 calls — likely infinite sync loop');
      handlers.forEach((h) => h(range));
    }),
  };
}

vi.mock('lightweight-charts', () => ({
  createChart: vi.fn(() => {
    const candleSeries = { setData: vi.fn(), setMarkers: vi.fn() };
    const histogramSeries = { setData: vi.fn(), priceScale: vi.fn(() => ({ applyOptions: vi.fn() })) };
    const lineSeriesInstances = [];
    const timeScaleApi = makeTimeScale();
    const chart = {
      addCandlestickSeries: vi.fn((opts) => {
        chart.candleOptions = opts;
        return candleSeries;
      }),
      addHistogramSeries: vi.fn((opts) => {
        chart.histogramOptions = opts;
        return histogramSeries;
      }),
      addLineSeries: vi.fn((opts) => {
        const s = { setData: vi.fn(), createPriceLine: vi.fn(), options: opts };
        lineSeriesInstances.push(s);
        return s;
      }),
      timeScale: vi.fn(() => timeScaleApi),
      applyOptions: vi.fn(),
      remove: vi.fn(),
      candleSeries,
      histogramSeries,
      lineSeriesInstances,
    };
    createdCharts.push(chart);
    return chart;
  }),
}));

function makeBars(n, startPrice = 100) {
  const bars = [];
  let price = startPrice;
  for (let i = 0; i < n; i++) {
    const open = price;
    const close = price + (i % 2 === 0 ? 1 : -1);
    bars.push({
      time: `2026-01-${String(i + 1).padStart(2, '0')}`,
      open,
      high: Math.max(open, close) + 0.5,
      low: Math.min(open, close) - 0.5,
      close,
      volume: 1_000_000 + i * 1000,
    });
    price = close;
  }
  return bars;
}

function makeSeries(n, { emaNullsBefore = 0, rsiNullsBefore = 0 } = {}) {
  return {
    ema50: Array.from({ length: n }, (_, i) => (i < emaNullsBefore ? null : 100 + i * 0.1)),
    ema20: Array.from({ length: n }, (_, i) => (i < emaNullsBefore ? null : 101 + i * 0.1)),
    rsi: Array.from({ length: n }, (_, i) => (i < rsiNullsBefore ? null : 45 + (i % 5))),
  };
}

beforeEach(() => {
  createdCharts = [];
  vi.clearAllMocks();
  if (typeof globalThis.ResizeObserver === 'undefined' || !vi.isMockFunction(globalThis.ResizeObserver)) {
    // Must be a regular function, not an arrow function: ChartPanel calls
    // `new ResizeObserver(...)`, and arrow functions can never be constructors.
    globalThis.ResizeObserver = vi.fn(function ResizeObserverMock() {
      return { observe: vi.fn(), unobserve: vi.fn(), disconnect: vi.fn() };
    });
  }
});

describe('ChartPanel — no-data fallback (edge case)', () => {
  it('renders "no chart data" and does NOT call createChart when bars is undefined (rejected/excluded/error rows)', async () => {
    const { createChart } = await import('lightweight-charts');
    const { getByText } = render(<ChartPanel bars={undefined} series={undefined} />);
    expect(getByText('No chart data available for this stock.')).toBeInTheDocument();
    expect(createChart).not.toHaveBeenCalled();
  });

  it('renders the fallback when bars is an empty array', async () => {
    const { createChart } = await import('lightweight-charts');
    const { getByText } = render(<ChartPanel bars={[]} series={makeSeries(0)} />);
    expect(getByText('No chart data available for this stock.')).toBeInTheDocument();
    expect(createChart).not.toHaveBeenCalled();
  });

  it('renders the fallback when series is missing but bars is present', async () => {
    const { createChart } = await import('lightweight-charts');
    const { getByText } = render(<ChartPanel bars={makeBars(5)} series={undefined} />);
    expect(getByText('No chart data available for this stock.')).toBeInTheDocument();
    expect(createChart).not.toHaveBeenCalled();
  });
});

describe('ChartPanel — real data wiring', () => {
  it('creates exactly two chart instances (main price/volume + RSI subpanel)', () => {
    render(<ChartPanel bars={makeBars(10)} series={makeSeries(10)} />);
    expect(createdCharts).toHaveLength(2);
  });

  it('candle series receives OHLC data matching bars exactly, in order, with no volume key', () => {
    const bars = makeBars(5);
    render(<ChartPanel bars={bars} series={makeSeries(5)} />);
    const [mainChart] = createdCharts;
    const passed = mainChart.candleSeries.setData.mock.calls[0][0];
    expect(passed).toHaveLength(5);
    expect(passed[0]).toEqual({ time: bars[0].time, open: bars[0].open, high: bars[0].high, low: bars[0].low, close: bars[0].close });
    expect(passed[0].volume).toBeUndefined();
  });

  it('volume histogram colors each bar up or down matching close vs open', () => {
    const bars = makeBars(4); // alternates up/down by construction (i%2)
    render(<ChartPanel bars={bars} series={makeSeries(4)} />);
    const [mainChart] = createdCharts;
    const passed = mainChart.histogramSeries.setData.mock.calls[0][0];
    passed.forEach((point, i) => {
      const expectedColor = bars[i].close >= bars[i].open ? '#2ea043' : '#da3633';
      expect(point.color).toBe(expectedColor);
      expect(point.value).toBe(bars[i].volume);
    });
  });

  it('EMA50/EMA20 line series omit null (warmup-gap) entries rather than passing value:null', () => {
    const n = 10;
    const bars = makeBars(n);
    const series = makeSeries(n, { emaNullsBefore: 4 });
    render(<ChartPanel bars={bars} series={series} />);
    const [mainChart] = createdCharts;
    // addLineSeries called twice on the main chart: EMA50 then EMA20 (in that source order).
    expect(mainChart.lineSeriesInstances).toHaveLength(2);
    const ema50Data = mainChart.lineSeriesInstances[0].setData.mock.calls[0][0];
    expect(ema50Data).toHaveLength(n - 4); // 4 nulls dropped
    expect(ema50Data.every((p) => typeof p.value === 'number')).toBe(true);
    expect(ema50Data[0]).toEqual({ time: bars[4].time, value: series.ema50[4] });
  });

  it('RSI line series omits nulls the same way, and draws dashed reference lines at 38 and 50', () => {
    const n = 10;
    const bars = makeBars(n);
    const series = makeSeries(n, { rsiNullsBefore: 3 });
    render(<ChartPanel bars={bars} series={series} />);
    const [, rsiChart] = createdCharts;
    expect(rsiChart.lineSeriesInstances).toHaveLength(1);
    const rsiSeries = rsiChart.lineSeriesInstances[0];
    const rsiData = rsiSeries.setData.mock.calls[0][0];
    expect(rsiData).toHaveLength(n - 3);
    expect(rsiSeries.createPriceLine).toHaveBeenCalledWith(expect.objectContaining({ price: 38 }));
    expect(rsiSeries.createPriceLine).toHaveBeenCalledWith(expect.objectContaining({ price: 50 }));
  });

  it('marks the current (last) candle with a marker, per spec §3.3', () => {
    const bars = makeBars(7);
    render(<ChartPanel bars={bars} series={makeSeries(7)} />);
    const [mainChart] = createdCharts;
    const markers = mainChart.candleSeries.setMarkers.mock.calls[0][0];
    expect(markers).toHaveLength(1);
    expect(markers[0].time).toBe(bars[bars.length - 1].time);
  });

  it('does not crash for a $20 stock or a $200 stock (axis-scaling edge cases)', () => {
    expect(() => render(<ChartPanel bars={makeBars(5, 20)} series={makeSeries(5)} />)).not.toThrow();
    expect(() => render(<ChartPanel bars={makeBars(5, 200)} series={makeSeries(5)} />)).not.toThrow();
  });

  it('observes the container with a ResizeObserver for responsive width (mobile-friendly, RULES §7)', () => {
    render(<ChartPanel bars={makeBars(5)} series={makeSeries(5)} />);
    expect(globalThis.ResizeObserver).toHaveBeenCalled();
    const instance = globalThis.ResizeObserver.mock.results[0].value;
    expect(instance.observe).toHaveBeenCalled();
  });
});

describe('ChartPanel — time scale sync (main chart <-> RSI chart)', () => {
  // The mock's setVisibleLogicalRange() invokes that chart's own subscribed
  // handlers, same as real lightweight-charts — so calling it directly here
  // is an accurate stand-in for "the user dragged/scrolled this chart."

  it('subscribes to visibleLogicalRangeChange on both charts on mount', () => {
    render(<ChartPanel bars={makeBars(5)} series={makeSeries(5)} />);
    const [mainChart, rsiChart] = createdCharts;
    expect(mainChart.timeScale().subscribeVisibleLogicalRangeChange).toHaveBeenCalledTimes(1);
    expect(rsiChart.timeScale().subscribeVisibleLogicalRangeChange).toHaveBeenCalledTimes(1);
  });

  it('panning the main chart moves the RSI chart to the same range', () => {
    render(<ChartPanel bars={makeBars(10)} series={makeSeries(10)} />);
    const [mainChart, rsiChart] = createdCharts;
    const range = { from: 2, to: 8 };

    mainChart.timeScale().setVisibleLogicalRange(range); // simulated user pan on the main chart

    expect(rsiChart.timeScale().setVisibleLogicalRange).toHaveBeenCalledWith(range);
  });

  it('panning the RSI chart moves the main chart to the same range', () => {
    render(<ChartPanel bars={makeBars(10)} series={makeSeries(10)} />);
    const [mainChart, rsiChart] = createdCharts;
    const range = { from: 1, to: 5 };

    rsiChart.timeScale().setVisibleLogicalRange(range); // simulated user pan on the RSI chart

    expect(mainChart.timeScale().setVisibleLogicalRange).toHaveBeenCalledWith(range);
  });

  it('does NOT create a runaway update loop — each chart is set exactly once per pan (re-entrancy guard)', () => {
    render(<ChartPanel bars={makeBars(10)} series={makeSeries(10)} />);
    const [mainChart, rsiChart] = createdCharts;

    mainChart.timeScale().setVisibleLogicalRange({ from: 0, to: 9 });

    // The mock throws if setVisibleLogicalRange exceeds 50 calls (would have
    // already failed above if the guard were broken); this asserts the exact,
    // correct call counts rather than just "didn't crash".
    expect(mainChart.timeScale().setVisibleLogicalRange).toHaveBeenCalledTimes(1); // only our simulated pan
    expect(rsiChart.timeScale().setVisibleLogicalRange).toHaveBeenCalledTimes(1); // exactly one sync response, no bounce-back
  });

  it('ignores a null range (fires on some internal states) without calling the other chart', () => {
    render(<ChartPanel bars={makeBars(10)} series={makeSeries(10)} />);
    const [mainChart, rsiChart] = createdCharts;

    mainChart.timeScale().setVisibleLogicalRange(null);

    expect(rsiChart.timeScale().setVisibleLogicalRange).not.toHaveBeenCalled();
  });

  it('unsubscribes both sync handlers on unmount', () => {
    const { unmount } = render(<ChartPanel bars={makeBars(5)} series={makeSeries(5)} />);
    const [mainChart, rsiChart] = createdCharts;
    unmount();
    expect(mainChart.timeScale().unsubscribeVisibleLogicalRangeChange).toHaveBeenCalledTimes(1);
    expect(rsiChart.timeScale().unsubscribeVisibleLogicalRangeChange).toHaveBeenCalledTimes(1);
  });
});

describe('ChartPanel — mount/unmount lifecycle', () => {
  it('calls remove() on BOTH chart instances on unmount (no leak)', () => {
    const { unmount } = render(<ChartPanel bars={makeBars(5)} series={makeSeries(5)} />);
    expect(createdCharts).toHaveLength(2);
    unmount();
    createdCharts.forEach((chart) => expect(chart.remove).toHaveBeenCalledTimes(1));
  });

  it('disconnects the ResizeObserver on unmount', () => {
    const { unmount } = render(<ChartPanel bars={makeBars(5)} series={makeSeries(5)} />);
    const instance = globalThis.ResizeObserver.mock.results[0].value;
    unmount();
    expect(instance.disconnect).toHaveBeenCalled();
  });

  it('tears down the old charts and builds new ones when switching to a different stock\'s data (rerender)', () => {
    const { rerender } = render(<ChartPanel bars={makeBars(5, 100)} series={makeSeries(5)} />);
    const firstCharts = [...createdCharts]; // snapshot — createdCharts keeps growing, this must not
    expect(firstCharts).toHaveLength(2);

    rerender(<ChartPanel bars={makeBars(6, 50)} series={makeSeries(6)} />);
    expect(createdCharts).toHaveLength(4); // 2 old + 2 new tracked in the same array
    firstCharts.forEach((chart) => expect(chart.remove).toHaveBeenCalledTimes(1));

    const newCharts = createdCharts.slice(2);
    const newCandleData = newCharts[0].candleSeries.setData.mock.calls[0][0];
    expect(newCandleData).toHaveLength(6); // reflects the NEW bars, not stale data
  });
});
