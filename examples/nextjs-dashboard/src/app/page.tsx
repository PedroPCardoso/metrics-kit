'use client';

import { useEffect, useRef, useState } from 'react';
import type { ChartJsLineConfig } from 'nestjs-metrics-core/charts';

function Chart({ config }: { config: ChartJsLineConfig | null }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [ChartLib, setChartLib] = useState<any>(null);

  useEffect(() => {
    import('chart.js').then((mod) => setChartLib(() => mod.Chart));
  }, []);

  useEffect(() => {
    if (!ChartLib || !ref.current || !config) return;
    const chart = new ChartLib(ref.current, config);
    return () => chart.destroy();
  }, [ChartLib, config]);

  return <canvas ref={ref} />;
}

export default function Home() {
  const [revenueCfg, setRevenueCfg] = useState<ChartJsLineConfig | null>(null);
  const [kpis, setKpis] = useState<{ totalOrders: number; totalRevenue: number } | null>(null);

  useEffect(() => {
    fetch('/api/revenue').then((r) => r.json()).then(setRevenueCfg);
    fetch('/api/kpis').then((r) => r.json()).then(setKpis);
  }, []);

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', padding: '2rem', background: '#f5f5f5', minHeight: '100vh' }}>
      <h1>Next.js Dashboard</h1>
      {kpis && (
        <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem' }}>
          <div style={{ flex: 1, background: '#fff', padding: '1.5rem', borderRadius: 8 }}>
            <h3>Total Orders</h3>
            <div style={{ fontSize: '2rem', fontWeight: 700 }}>{kpis.totalOrders}</div>
          </div>
          <div style={{ flex: 1, background: '#fff', padding: '1.5rem', borderRadius: 8 }}>
            <h3>Total Revenue</h3>
            <div style={{ fontSize: '2rem', fontWeight: 700 }}>${kpis.totalRevenue.toFixed(2)}</div>
          </div>
        </div>
      )}
      <div style={{ background: '#fff', padding: '1rem', borderRadius: 8 }}>
        <h2>Revenue by Month</h2>
        {revenueCfg && <Chart config={revenueCfg} />}
      </div>
    </div>
  );
}
