import type { DiagramData } from '../model/types';

export type DiagramViewOptions = {
  title: string;
  dbmlRelPath: string;
};

const CARD_WIDTH = 260;
const HEADER_HEIGHT = 34;
const ROW_HEIGHT = 22;
const CARD_PADDING = 8;

const GROUP_PALETTE = [
  '#3b82f6',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#8b5cf6',
  '#ec4899',
  '#14b8a6',
  '#f97316',
  '#6366f1',
  '#84cc16',
];

export function cardHeight(columnCount: number): number {
  return HEADER_HEIGHT + columnCount * ROW_HEIGHT + CARD_PADDING;
}

export function renderDiagramHtml(data: DiagramData, options: DiagramViewOptions): string {
  const json = JSON.stringify(data).replaceAll('<', '\\u003c').replaceAll('>', '\\u003e');
  const constants = JSON.stringify({
    CARD_WIDTH,
    HEADER_HEIGHT,
    ROW_HEIGHT,
    CARD_PADDING,
    GROUP_PALETTE,
  });
  const title = options.title.replaceAll('&', '&amp;').replaceAll('<', '&lt;');
  const relPath = options.dbmlRelPath.replaceAll('&', '&amp;').replaceAll('<', '&lt;');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<style>
  :root {
    --bg: #0d1117;
    --panel: #161b22;
    --border: #30363d;
    --text: #c9d1d9;
    --muted: #8b949e;
    --accent: #58a6ff;
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; height: 100%; }
  body {
    font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    background: var(--bg);
    color: var(--text);
    overflow: hidden;
  }
  #toolbar {
    position: fixed; top: 0; left: 0; right: 0; height: 44px; z-index: 20;
    display: flex; align-items: center; gap: 8px; padding: 0 12px;
    background: var(--panel); border-bottom: 1px solid var(--border);
    font-size: 12px;
  }
  #toolbar .title { color: var(--muted); margin-right: auto; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  #toolbar button {
    background: #21262d; color: var(--text); border: 1px solid var(--border);
    border-radius: 6px; padding: 5px 10px; font-size: 12px; cursor: pointer;
  }
  #toolbar button:hover { background: #30363d; }
  #toolbar select {
    background: #21262d; color: var(--text); border: 1px solid var(--border);
    border-radius: 6px; padding: 5px 8px; font-size: 12px;
  }
  #banner {
    position: fixed; top: 44px; left: 0; right: 0; z-index: 15;
    background: #4d2222; color: #ffb4b4; padding: 8px 12px; font-size: 12px;
    border-bottom: 1px solid #6e3030; display: none;
  }
  #stage {
    position: absolute; inset: 44px 0 0 0; overflow: hidden; cursor: grab;
    background-image:
      radial-gradient(circle, #1c222b 1px, transparent 1px);
    background-size: 26px 26px;
  }
  #stage.panning { cursor: grabbing; }
  #viewport { position: absolute; top: 0; left: 0; transform-origin: 0 0; }
  #edges { position: absolute; top: 0; left: 0; overflow: visible; pointer-events: none; }
  .grp-label {
    position: absolute; font-size: 13px; font-weight: 700; letter-spacing: 0.04em;
    text-transform: uppercase; opacity: 0.85; pointer-events: none;
  }
  .card {
    position: absolute; width: ${CARD_WIDTH}px; background: var(--panel);
    border: 1px solid var(--border); border-radius: 8px; overflow: hidden;
    box-shadow: 0 8px 24px rgba(0,0,0,0.35); user-select: none;
  }
  .card.dim { opacity: 0.28; }
  .card-head {
    height: ${HEADER_HEIGHT}px; display: flex; align-items: center; gap: 6px;
    padding: 0 10px; font-weight: 700; font-size: 13px; cursor: grab;
    background: #1f6feb22; border-bottom: 1px solid var(--border);
  }
  .card-head .badge { margin-left: auto; font-size: 10px; color: var(--muted); font-weight: 500; }
  .col {
    height: ${ROW_HEIGHT}px; display: flex; align-items: center; gap: 6px;
    padding: 0 10px; font-size: 11px; border-top: 1px solid #21262d;
  }
  .col .cname { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .col .ctype { margin-left: auto; color: var(--muted); font-size: 10px; white-space: nowrap; }
  .col.pk .cname { color: #ffd479; font-weight: 600; }
  .col.fk .cname { color: #79c0ff; }
  .tag { font-size: 9px; padding: 0 4px; border-radius: 4px; line-height: 14px; }
  .tag.pk { background: #5a4b13; color: #ffd479; }
  .tag.fk { background: #163a5a; color: #79c0ff; }
  .tag.u  { background: #3a1b4d; color: #d2a8ff; }
  #empty { position: absolute; inset: 44px 0 0 0; display: flex; align-items: center; justify-content: center; color: var(--muted); }
</style>
</head>
<body>
  <div id="toolbar">
    <span class="title">ERD: ${title}</span>
    <select id="algo" title="Auto arrange algorithm">
      <option value="grid">Grid</option>
      <option value="horizontal">Horizontal</option>
      <option value="vertical">Vertical</option>
      <option value="circular">Circular</option>
    </select>
    <button id="arrange">Auto arrange</button>
    <button id="fit">Fit</button>
    <button id="zoomIn">+</button>
    <button id="zoomOut">−</button>
    <button id="reload">Reload</button>
  </div>
  <div id="banner"></div>
  <div id="stage">
    <div id="viewport">
      <svg id="edges"></svg>
    </div>
  </div>
  <script>
    const vscode = acquireVsCodeApi();
    const DATA = JSON.parse("${json.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}");
    const C = ${constants};
    const SVGNS = "http://www.w3.org/2000/svg";

    const stage = document.getElementById('stage');
    const viewport = document.getElementById('viewport');
    const edges = document.getElementById('edges');
    const banner = document.getElementById('banner');

    const tableById = new Map(DATA.tables.map(t => [t.id, t]));
    function cardHeight(t){ return C.HEADER_HEIGHT + t.columns.length * C.ROW_HEIGHT + C.CARD_PADDING; }

    let scale = 1, tx = 0, ty = 0;
    function applyTransform(){ viewport.style.transform = 'translate(' + tx + 'px,' + ty + 'px) scale(' + scale + ')'; }

    // ---- group colors ----
    const groupColor = {};
    DATA.groups.forEach((g, i) => { groupColor[g.name] = g.color || C.GROUP_PALETTE[i % C.GROUP_PALETTE.length]; });

    const cardEls = new Map();

    function buildCards(){
      DATA.tables.forEach(t => {
        const el = document.createElement('div');
        el.className = 'card';
        el.dataset.id = t.id;
        el.style.left = t.x + 'px';
        el.style.top = t.y + 'px';
        const accent = t.group ? groupColor[t.group] : (t.headerColor || '#1f6feb');
        const head = document.createElement('div');
        head.className = 'card-head';
        head.style.background = hexA(accent, 0.18);
        head.style.borderBottom = '1px solid ' + hexA(accent, 0.55);
        const nameSpan = document.createElement('span');
        nameSpan.textContent = t.name;
        head.appendChild(nameSpan);
        if (t.group){ const b = document.createElement('span'); b.className='badge'; b.textContent=t.group; head.appendChild(b); }
        if (t.note) head.title = t.note;
        el.appendChild(head);
        t.columns.forEach(c => {
          const row = document.createElement('div');
          row.className = 'col' + (c.pk ? ' pk' : '') + (c.fk ? ' fk' : '');
          const cn = document.createElement('span'); cn.className='cname'; cn.textContent = c.name;
          row.appendChild(cn);
          if (c.pk){ const tag=document.createElement('span'); tag.className='tag pk'; tag.textContent='PK'; row.appendChild(tag); }
          if (c.fk){ const tag=document.createElement('span'); tag.className='tag fk'; tag.textContent='FK'; row.appendChild(tag); }
          if (c.unique && !c.pk){ const tag=document.createElement('span'); tag.className='tag u'; tag.textContent='U'; row.appendChild(tag); }
          const tp = document.createElement('span'); tp.className='ctype'; tp.textContent = c.type; row.appendChild(tp);
          if (c.note) row.title = c.note;
          el.appendChild(row);
        });
        attachDrag(el, t);
        viewport.appendChild(el);
        cardEls.set(t.id, el);
      });
    }

    function hexA(hex, a){
      const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
      if(!m) return 'rgba(88,166,255,' + a + ')';
      const n = parseInt(m[1],16);
      return 'rgba(' + ((n>>16)&255) + ',' + ((n>>8)&255) + ',' + (n&255) + ',' + a + ')';
    }

    function colIndex(t, colName){
      const i = t.columns.findIndex(c => c.name === colName);
      return i < 0 ? 0 : i;
    }
    function colAnchorY(t, colName){
      return t.y + C.HEADER_HEIGHT + (colIndex(t, colName) + 0.5) * C.ROW_HEIGHT;
    }

    function drawEdges(highlightId){
      while (edges.firstChild) edges.removeChild(edges.firstChild);
      DATA.refs.forEach(r => {
        const a = tableById.get(r.fromTable), b = tableById.get(r.toTable);
        if(!a || !b) return;
        const ay = colAnchorY(a, r.fromColumn), by = colAnchorY(b, r.toColumn);
        const aCx = a.x + C.CARD_WIDTH/2, bCx = b.x + C.CARD_WIDTH/2;
        const aRight = bCx >= aCx;
        const ax = aRight ? a.x + C.CARD_WIDTH : a.x;
        const bLeftSide = bCx > aCx;
        const bx = bLeftSide ? b.x : b.x + C.CARD_WIDTH;
        const dx = Math.max(40, Math.abs(bx-ax) * 0.4);
        const c1x = ax + (aRight ? dx : -dx);
        const c2x = bx + (bLeftSide ? -dx : dx);
        const path = document.createElementNS(SVGNS, 'path');
        path.setAttribute('d', 'M ' + ax + ' ' + ay + ' C ' + c1x + ' ' + ay + ' ' + c2x + ' ' + by + ' ' + bx + ' ' + by);
        const isCascade = (r.onDelete || '').toLowerCase() === 'cascade';
        const active = highlightId && (r.fromTable === highlightId || r.toTable === highlightId);
        path.setAttribute('stroke', active ? '#ffd479' : (isCascade ? '#f97583' : '#56a0d8'));
        path.setAttribute('stroke-width', active ? '2.4' : '1.4');
        path.setAttribute('fill', 'none');
        if(!isCascade) path.setAttribute('stroke-dasharray', '5 4');
        path.setAttribute('opacity', highlightId && !active ? '0.15' : '0.85');
        edges.appendChild(path);
        // FK crow-foot dot at child side
        const dot = document.createElementNS(SVGNS, 'circle');
        dot.setAttribute('cx', ax); dot.setAttribute('cy', ay); dot.setAttribute('r', '3');
        dot.setAttribute('fill', active ? '#ffd479' : (isCascade ? '#f97583' : '#56a0d8'));
        dot.setAttribute('opacity', highlightId && !active ? '0.15' : '0.9');
        edges.appendChild(dot);
      });
    }

    function drawGroups(){
      document.querySelectorAll('.grp-rect,.grp-label').forEach(e => e.remove());
      DATA.groups.forEach(g => {
        const members = g.tables.map(id => tableById.get(id)).filter(Boolean);
        if(!members.length) return;
        const pad = 24;
        const minX = Math.min(...members.map(t=>t.x)) - pad;
        const minY = Math.min(...members.map(t=>t.y)) - pad - 18;
        const maxX = Math.max(...members.map(t=>t.x + C.CARD_WIDTH)) + pad;
        const maxY = Math.max(...members.map(t=>t.y + cardHeight(t))) + pad;
        const col = groupColor[g.name];
        const rect = document.createElementNS(SVGNS, 'rect');
        rect.setAttribute('class','grp-rect');
        rect.setAttribute('x', minX); rect.setAttribute('y', minY);
        rect.setAttribute('width', maxX-minX); rect.setAttribute('height', maxY-minY);
        rect.setAttribute('rx','14'); rect.setAttribute('fill', hexA(col,0.06));
        rect.setAttribute('stroke', hexA(col,0.4)); rect.setAttribute('stroke-width','1.5');
        rect.setAttribute('stroke-dasharray','6 6');
        edges.insertBefore(rect, edges.firstChild);
        const label = document.createElement('div');
        label.className = 'grp-label';
        label.textContent = g.name;
        label.style.left = (minX + 10) + 'px';
        label.style.top = (minY + 2) + 'px';
        label.style.color = col;
        viewport.appendChild(label);
      });
    }

    function redraw(){ drawGroups(); drawEdges(); }

    // ---- drag ----
    function attachDrag(el, t){
      const head = el.querySelector('.card-head');
      head.addEventListener('mousedown', (e) => {
        e.preventDefault(); e.stopPropagation();
        document.querySelectorAll('.card').forEach(c => { if(c!==el) c.classList.add('dim'); });
        drawEdges(t.id);
        const startX = e.clientX, startY = e.clientY;
        const origX = t.x, origY = t.y;
        function onMove(ev){
          t.x = origX + (ev.clientX - startX) / scale;
          t.y = origY + (ev.clientY - startY) / scale;
          el.style.left = t.x + 'px'; el.style.top = t.y + 'px';
          drawEdges(t.id);
        }
        function onUp(){
          window.removeEventListener('mousemove', onMove);
          window.removeEventListener('mouseup', onUp);
          document.querySelectorAll('.card').forEach(c => c.classList.remove('dim'));
          redraw();
          vscode.postMessage({ type:'moveTable', name: t.name, schema: t.schema, x: Math.round(t.x), y: Math.round(t.y) });
        }
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
      });
    }

    // ---- pan & zoom ----
    stage.addEventListener('mousedown', (e) => {
      if (e.target.closest('.card')) return;
      stage.classList.add('panning');
      const sx = e.clientX - tx, sy = e.clientY - ty;
      function onMove(ev){ tx = ev.clientX - sx; ty = ev.clientY - sy; applyTransform(); }
      function onUp(){ stage.classList.remove('panning'); window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); }
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    });
    stage.addEventListener('wheel', (e) => {
      e.preventDefault();
      const rect = stage.getBoundingClientRect();
      const mx = e.clientX - rect.left, my = e.clientY - rect.top;
      const factor = e.deltaY < 0 ? 1.1 : 1/1.1;
      const newScale = Math.min(2.5, Math.max(0.12, scale * factor));
      tx = mx - (mx - tx) * (newScale/scale);
      ty = my - (my - ty) * (newScale/scale);
      scale = newScale; applyTransform();
    }, { passive: false });

    function fit(){
      if(!DATA.tables.length) return;
      const minX = Math.min(...DATA.tables.map(t=>t.x)) - 60;
      const minY = Math.min(...DATA.tables.map(t=>t.y)) - 60;
      const maxX = Math.max(...DATA.tables.map(t=>t.x + C.CARD_WIDTH)) + 60;
      const maxY = Math.max(...DATA.tables.map(t=>t.y + cardHeight(t))) + 60;
      const rect = stage.getBoundingClientRect();
      scale = Math.min(rect.width/(maxX-minX), rect.height/(maxY-minY), 1.5);
      scale = Math.max(scale, 0.12);
      tx = -minX*scale + (rect.width - (maxX-minX)*scale)/2;
      ty = -minY*scale + (rect.height - (maxY-minY)*scale)/2;
      applyTransform();
    }

    // ---- auto arrange ----
    function arrange(algo){
      const list = DATA.tables;
      const gapX = C.CARD_WIDTH + 80;
      if (algo === 'grid'){
        const cols = Math.max(1, Math.ceil(Math.sqrt(list.length)));
        list.forEach((t,i) => { t.x = (i%cols)*gapX; t.y = Math.floor(i/cols)*420; });
      } else if (algo === 'horizontal'){
        let x = 0; list.forEach(t => { t.x = x; t.y = 0; x += gapX; });
      } else if (algo === 'vertical'){
        let y = 0; list.forEach(t => { t.x = 0; t.y = y; y += 360; });
      } else if (algo === 'circular'){
        const R = Math.max(300, list.length * 55);
        list.forEach((t,i) => { const a = (i/list.length)*Math.PI*2; t.x = Math.cos(a)*R; t.y = Math.sin(a)*R; });
      }
      list.forEach(t => { const el = cardEls.get(t.id); if(el){ el.style.left=t.x+'px'; el.style.top=t.y+'px'; } });
      redraw(); fit();
      vscode.postMessage({ type:'moveTables', positions: list.map(t => ({ name:t.name, schema:t.schema, x: Math.round(t.x), y: Math.round(t.y) })) });
    }

    document.getElementById('arrange').addEventListener('click', () => arrange(document.getElementById('algo').value));
    document.getElementById('fit').addEventListener('click', fit);
    document.getElementById('zoomIn').addEventListener('click', () => { scale=Math.min(2.5,scale*1.2); applyTransform(); });
    document.getElementById('zoomOut').addEventListener('click', () => { scale=Math.max(0.12,scale/1.2); applyTransform(); });
    document.getElementById('reload').addEventListener('click', () => vscode.postMessage({ type:'reload' }));

    // ---- init ----
    if (DATA.parseError){
      banner.style.display='block';
      banner.textContent = 'DBML parse error: ' + DATA.parseError;
      document.getElementById('stage').style.display='none';
      const empty = document.createElement('div'); empty.id='empty'; empty.textContent='Failed to parse .dbml'; document.body.appendChild(empty);
    } else if (!DATA.tables.length){
      const empty = document.createElement('div'); empty.id='empty'; empty.textContent='No tables found in .dbml'; document.body.appendChild(empty);
    } else {
      if (DATA.staleTables && DATA.staleTables.length){
        banner.style.display='block';
        banner.textContent = 'Layout has ' + DATA.staleTables.length + ' stale table(s) not in current .dbml: ' + DATA.staleTables.join(', ');
      }
      buildCards();
      redraw();
      fit();
    }
  </script>
</body>
</html>`;
}
