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
    align-items: center; gap: 10px;
  }
  #banner .msg { flex: 1; }
  #banner button {
    background: #6e3030; color: #ffd9d9; border: 1px solid #8a4040;
    border-radius: 6px; padding: 4px 10px; font-size: 11px; cursor: pointer; white-space: nowrap;
  }
  #banner button:hover { background: #8a4040; }
  #stage {
    position: absolute; inset: 44px 0 0 0; overflow: hidden; cursor: grab;
    background-image:
      radial-gradient(circle, #1c222b 1px, transparent 1px);
    background-size: 26px 26px;
  }
  #stage.panning { cursor: grabbing; }
  #viewport { position: absolute; top: 0; left: 0; transform-origin: 0 0; }
  #edges { position: absolute; top: 0; left: 0; overflow: visible; pointer-events: none; z-index: 1; }
  .group-card {
    position: absolute; border-radius: 16px; pointer-events: none; z-index: 0;
    border: 1.5px solid; overflow: hidden;
    box-shadow: 0 4px 18px rgba(0,0,0,0.18) inset;
  }
  .group-card .gc-head {
    height: 28px; display: flex; align-items: center; gap: 8px; padding: 0 14px;
    font-size: 12px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    border-bottom: 1px solid;
  }
  .group-card .gc-count { font-size: 10px; font-weight: 600; opacity: 0.7; letter-spacing: 0; }
  .card {
    position: absolute; width: ${CARD_WIDTH}px; background: var(--panel);
    border: 1px solid var(--border); border-radius: 8px; overflow: hidden;
    box-shadow: 0 8px 24px rgba(0,0,0,0.35); user-select: none; z-index: 2;
  }
  .card.active {
    border-color: #ffd479;
    box-shadow: 0 0 0 2px rgba(255,212,121,0.42), 0 12px 30px rgba(0,0,0,0.42);
    z-index: 3;
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
  #minimap {
    position: fixed; right: 14px; bottom: 14px; width: 280px; height: 190px; z-index: 25;
    background: rgba(13,17,23,0.88); border: 1px solid var(--border); border-radius: 8px;
    box-shadow: 0 10px 28px rgba(0,0,0,0.38); pointer-events: none; overflow: hidden;
  }
  #minimap svg { width: 100%; height: 100%; display: block; }
  #minimap .mini-title {
    position: absolute; top: 6px; left: 8px; color: var(--muted); font-size: 10px;
    font-weight: 700; letter-spacing: 0.04em;
  }
  #empty { position: absolute; inset: 44px 0 0 0; display: flex; align-items: center; justify-content: center; color: var(--muted); }
</style>
</head>
<body>
  <div id="toolbar">
    <span class="title">ERD: ${title}</span>
    <select id="algo" title="自動配置アルゴリズム">
      <option value="grouped">グループ (FK考慮)</option>
      <option value="grid">グリッド</option>
      <option value="horizontal">横並び</option>
      <option value="vertical">縦並び</option>
      <option value="circular">円形</option>
    </select>
    <button id="arrange">自動配置</button>
    <button id="fit">全体表示</button>
    <button id="zoomIn" title="拡大">+</button>
    <button id="zoomOut" title="縮小">−</button>
    <button id="reload">再読み込み</button>
    <button id="updateLatest" title="最新リリースへ更新">更新</button>
  </div>
  <div id="banner"></div>
  <div id="stage">
    <div id="viewport">
      <svg id="edges"></svg>
    </div>
  </div>
  <div id="minimap">
    <div class="mini-title">サブビュー</div>
    <svg id="minimapSvg" viewBox="0 0 280 190" preserveAspectRatio="none"></svg>
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
    const minimap = document.getElementById('minimap');
    const minimapSvg = document.getElementById('minimapSvg');

    const tableById = new Map(DATA.tables.map(t => [t.id, t]));
    function cardHeight(t){ return C.HEADER_HEIGHT + t.columns.length * C.ROW_HEIGHT + C.CARD_PADDING; }

    let scale = 1, tx = 0, ty = 0;
    function applyTransform(){
      viewport.style.transform = 'translate(' + tx + 'px,' + ty + 'px) scale(' + scale + ')';
      drawMiniMap(activeHighlightId);
    }

    // ---- group colors ----
    const groupColor = {};
    DATA.groups.forEach((g, i) => { groupColor[g.name] = g.color || C.GROUP_PALETTE[i % C.GROUP_PALETTE.length]; });

    const cardEls = new Map();
    let activeHighlightId = null;
    let dragTableId = null;

    function buildCards(){
      DATA.tables.forEach(t => {
        const el = document.createElement('div');
        el.className = 'card';
        el.dataset.id = t.id;
        el.tabIndex = 0;
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
        attachHighlight(el, t);
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

    function previewWindow(highlightId){
      const viewW = 280, viewH = 190, previewScale = 0.42;
      const focus = highlightId ? tableById.get(highlightId) : undefined;
      const stageRect = stage.getBoundingClientRect();
      const cx = focus ? focus.x + C.CARD_WIDTH / 2 : (-tx + stageRect.width / 2) / scale;
      const cy = focus ? focus.y + cardHeight(focus) / 2 : (-ty + stageRect.height / 2) / scale;
      const w = viewW / previewScale;
      const h = viewH / previewScale;
      return {
        x: cx - w / 2,
        y: cy - h / 2,
        w,
        h,
        scale: previewScale,
      };
    }

    function miniRect(x, y, w, h, window){
      return {
        x: (x - window.x) * window.scale,
        y: (y - window.y) * window.scale,
        w: Math.max(2, w * window.scale),
        h: Math.max(2, h * window.scale),
      };
    }

    function appendMiniRect(rect, attrs){
      const node = document.createElementNS(SVGNS, 'rect');
      node.setAttribute('x', String(rect.x));
      node.setAttribute('y', String(rect.y));
      node.setAttribute('width', String(rect.w));
      node.setAttribute('height', String(rect.h));
      Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, String(value)));
      minimapSvg.appendChild(node);
    }

    function drawMiniMap(highlightId){
      if(!DATA.tables.length){
        minimap.style.display = 'none';
        return;
      }
      minimap.style.display = 'block';
      while (minimapSvg.firstChild) minimapSvg.removeChild(minimapSvg.firstChild);
      appendMiniRect({ x: 0.5, y: 0.5, w: 279, h: 189 }, {
        fill: 'rgba(22,27,34,0.78)',
        stroke: 'rgba(139,148,158,0.18)',
        'stroke-width': 1,
      });

      const win = previewWindow(highlightId);
      const related = highlightId ? relatedTableIds(highlightId) : new Set();
      DATA.tables.forEach(t => {
        const rect = miniRect(t.x, t.y, C.CARD_WIDTH, cardHeight(t), win);
        if (rect.x > 280 || rect.y > 190 || rect.x + rect.w < 0 || rect.y + rect.h < 0) return;
        const active = t.id === highlightId;
        const dim = highlightId && !related.has(t.id);
        appendMiniRect(rect, {
          fill: active ? '#ffd479' : (t.group ? hexA(groupColor[t.group], 0.72) : 'rgba(88,166,255,0.72)'),
          stroke: active ? '#fff1bd' : 'rgba(201,209,217,0.28)',
          'stroke-width': active ? 1.8 : 0.8,
          opacity: dim ? 0.22 : 0.9,
          rx: 2,
        });

        if (active) {
          const label = document.createElementNS(SVGNS, 'text');
          label.setAttribute('x', String(Math.max(8, Math.min(214, rect.x))));
          label.setAttribute('y', String(Math.max(22, rect.y - 7)));
          label.setAttribute('fill', '#ffd479');
          label.setAttribute('font-size', '11');
          label.setAttribute('font-weight', '700');
          label.textContent = t.name;
          minimapSvg.appendChild(label);
        }
      });

      const stageRect = stage.getBoundingClientRect();
      const viewX = -tx / scale;
      const viewY = -ty / scale;
      const viewW = stageRect.width / scale;
      const viewH = stageRect.height / scale;
      appendMiniRect(miniRect(viewX, viewY, viewW, viewH, win), {
        fill: 'rgba(88,166,255,0.08)',
        stroke: '#58a6ff',
        'stroke-width': 1.6,
        rx: 3,
      });
    }

    function relatedTableIds(tableId){
      const related = new Set([tableId]);
      DATA.refs.forEach(r => {
        if (r.fromTable === tableId) related.add(r.toTable);
        if (r.toTable === tableId) related.add(r.fromTable);
      });
      return related;
    }

    function highlightTable(tableId){
      activeHighlightId = tableId;
      const related = relatedTableIds(tableId);
      document.querySelectorAll('.card').forEach(c => {
        const id = c.dataset.id;
        c.classList.toggle('active', id === tableId);
        c.classList.toggle('dim', !related.has(id));
      });
      drawEdges(tableId);
      drawMiniMap(tableId);
    }

    function clearHighlight(){
      activeHighlightId = null;
      document.querySelectorAll('.card').forEach(c => {
        c.classList.remove('active');
        c.classList.remove('dim');
      });
      drawEdges();
      drawMiniMap();
    }

    function attachHighlight(el, t){
      el.addEventListener('mouseenter', () => highlightTable(t.id));
      el.addEventListener('mouseleave', () => {
        if (dragTableId) return;
        clearHighlight();
      });
      el.addEventListener('focus', () => highlightTable(t.id));
      el.addEventListener('blur', () => {
        if (dragTableId) return;
        clearHighlight();
      });
    }

    function drawGroups(){
      document.querySelectorAll('.group-card').forEach(e => e.remove());
      DATA.groups.forEach(g => {
        const members = g.tables.map(id => tableById.get(id)).filter(Boolean);
        if(!members.length) return;
        const padX = 22, padTop = 44, padBottom = 22;
        const minX = Math.min(...members.map(t=>t.x)) - padX;
        const minY = Math.min(...members.map(t=>t.y)) - padTop;
        const maxX = Math.max(...members.map(t=>t.x + C.CARD_WIDTH)) + padX;
        const maxY = Math.max(...members.map(t=>t.y + cardHeight(t))) + padBottom;
        const col = groupColor[g.name];
        const box = document.createElement('div');
        box.className = 'group-card';
        box.style.left = minX + 'px';
        box.style.top = minY + 'px';
        box.style.width = (maxX - minX) + 'px';
        box.style.height = (maxY - minY) + 'px';
        box.style.background = hexA(col, 0.05);
        box.style.borderColor = hexA(col, 0.45);
        const head = document.createElement('div');
        head.className = 'gc-head';
        head.style.background = hexA(col, 0.20);
        head.style.color = col;
        head.style.borderBottomColor = hexA(col, 0.35);
        const name = document.createElement('span');
        name.textContent = g.name;
        const count = document.createElement('span');
        count.className = 'gc-count';
        count.textContent = members.length + ' tables';
        head.appendChild(name);
        head.appendChild(count);
        box.appendChild(head);
        viewport.insertBefore(box, viewport.firstChild);
      });
    }

    function redraw(){ drawGroups(); drawEdges(activeHighlightId); drawMiniMap(activeHighlightId); }

    // ---- drag ----
    function attachDrag(el, t){
      const head = el.querySelector('.card-head');
      head.addEventListener('mousedown', (e) => {
        e.preventDefault(); e.stopPropagation();
        dragTableId = t.id;
        highlightTable(t.id);
        const startX = e.clientX, startY = e.clientY;
        const origX = t.x, origY = t.y;
        function onMove(ev){
          t.x = origX + (ev.clientX - startX) / scale;
          t.y = origY + (ev.clientY - startY) / scale;
          el.style.left = t.x + 'px'; el.style.top = t.y + 'px';
          drawEdges(activeHighlightId);
          drawMiniMap(activeHighlightId);
        }
        function onUp(ev){
          window.removeEventListener('mousemove', onMove);
          window.removeEventListener('mouseup', onUp);
          dragTableId = null;
          const hovered = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('.card');
          if (hovered === el) {
            highlightTable(t.id);
          } else {
            clearHighlight();
          }
          drawGroups();
          drawMiniMap(activeHighlightId);
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
      if (algo === 'grouped'){
        vscode.postMessage({ type:'autoLayout' });
        return;
      }
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
    document.getElementById('updateLatest').addEventListener('click', () => vscode.postMessage({ type:'installLatestRelease' }));

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
        banner.style.display='flex';
        const msg = document.createElement('span');
        msg.className = 'msg';
        msg.textContent = 'Layout has ' + DATA.staleTables.length + ' stale table(s) not in current .dbml: ' + DATA.staleTables.join(', ');
        const btn = document.createElement('button');
        btn.textContent = 'Clean up';
        btn.addEventListener('click', () => vscode.postMessage({ type: 'cleanupStale' }));
        banner.appendChild(msg);
        banner.appendChild(btn);
      }
      buildCards();
      redraw();
      fit();
    }
  </script>
</body>
</html>`;
}
