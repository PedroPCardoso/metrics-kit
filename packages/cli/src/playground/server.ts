import { createServer, type Server } from 'node:http';

export interface PlaygroundOptions {
  host?: string;
  port?: number;
}

export interface PlaygroundHandle {
  server: Server;
  url: string;
  close(): Promise<void>;
}

const sampleData = [
  { month: 'Jan', orders: 120, revenue: 12800, users: 84 },
  { month: 'Feb', orders: 145, revenue: 15120, users: 97 },
  { month: 'Mar', orders: 168, revenue: 18300, users: 112 },
  { month: 'Apr', orders: 152, revenue: 17240, users: 105 },
  { month: 'May', orders: 190, revenue: 21450, users: 131 },
  { month: 'Jun', orders: 218, revenue: 24890, users: 146 },
];

export async function startPlayground(options: PlaygroundOptions = {}): Promise<PlaygroundHandle> {
  const host = options.host ?? '127.0.0.1';
  const port = options.port ?? 3000;
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', `http://${request.headers.host ?? host}`);
    if (url.pathname === '/api/sample') {
      response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
      response.end(JSON.stringify(sampleData));
      return;
    }
    if (url.pathname === '/' || url.pathname === '/metrics-playground') {
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      response.end(renderPlaygroundHtml());
      return;
    }
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('Not found');
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.off('error', reject);
      resolve();
    });
  });

  const address = server.address();
  const actualPort = typeof address === 'object' && address ? address.port : port;
  const url = `http://${host}:${actualPort}/metrics-playground`;

  return {
    server,
    url,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}

function renderPlaygroundHtml(): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>NestJS Metrics Playground</title>
  <style>
    body { margin: 0; font-family: system-ui, sans-serif; color: #17202a; background: #f7f8fb; }
    main { max-width: 1100px; margin: 0 auto; padding: 32px 20px; }
    h1 { margin: 0 0 24px; font-size: 28px; }
    .layout { display: grid; grid-template-columns: 320px 1fr; gap: 20px; align-items: start; }
    section { background: #fff; border: 1px solid #d8dde8; border-radius: 8px; padding: 16px; }
    label { display: block; font-weight: 600; margin: 12px 0 6px; }
    select, input, textarea { width: 100%; box-sizing: border-box; border: 1px solid #b8c0cc; border-radius: 6px; padding: 9px 10px; font: inherit; }
    textarea { min-height: 170px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
    .bars { display: grid; gap: 8px; margin-top: 14px; }
    .bar { display: grid; grid-template-columns: 42px 1fr 72px; gap: 10px; align-items: center; }
    .track { height: 14px; background: #e7ebf2; border-radius: 999px; overflow: hidden; }
    .fill { height: 100%; background: #2f6fdd; }
    @media (max-width: 760px) { .layout { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <main>
    <h1>NestJS Metrics Playground</h1>
    <div class="layout">
      <section>
        <label for="metric">Metric</label>
        <select id="metric">
          <option value="orders">Orders</option>
          <option value="revenue">Revenue</option>
          <option value="users">Users</option>
        </select>
        <label for="aggregate">Aggregate</label>
        <select id="aggregate">
          <option value="count">countByMonth</option>
          <option value="sum">sumByMonth</option>
        </select>
        <label for="column">Column</label>
        <input id="column" value="amount" />
      </section>
      <section>
        <strong>Live preview</strong>
        <div id="bars" class="bars"></div>
        <label for="code">Generated code</label>
        <textarea id="code" readonly></textarea>
      </section>
    </div>
  </main>
  <script>
    const metric = document.querySelector('#metric');
    const aggregate = document.querySelector('#aggregate');
    const column = document.querySelector('#column');
    const bars = document.querySelector('#bars');
    const code = document.querySelector('#code');
    let rows = [];

    function render() {
      const selected = metric.value;
      const max = Math.max(...rows.map((row) => row[selected]), 1);
      bars.innerHTML = rows.map((row) => '<div class="bar"><span>' + row.month + '</span><span class="track"><span class="fill" style="width:' + ((row[selected] / max) * 100).toFixed(0) + '%"></span></span><span>' + row[selected] + '</span></div>').join('');
      const method = aggregate.value === 'sum' ? 'sumByMonth' : 'countByMonth';
      code.value = "Metrics.query(orderRepo.createQueryBuilder('orders'))\\n  ." + method + "('" + column.value + "', 6)\\n  .fillMissingData()\\n  .trends();";
    }

    fetch('/api/sample').then((res) => res.json()).then((data) => { rows = data; render(); });
    metric.addEventListener('change', render);
    aggregate.addEventListener('change', render);
    column.addEventListener('input', render);
  </script>
</body>
</html>`;
}
