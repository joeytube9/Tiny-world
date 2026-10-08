// Tiny DOM helpers.
export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'html') el.innerHTML = v;
    else if (k in el && typeof v !== 'string') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat(3)) {
    if (c === null || c === undefined || c === false) continue;
    el.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
  }
  return el;
}

export function slider({ label, min, max, step = 0.01, value, fmt = (v) => v.toFixed(2), oninput, onchange, hint }) {
  const val = h('span', { class: 'sl-val' }, fmt(value));
  const inp = h('input', { type: 'range', min, max, step, value: String(value) });
  inp.addEventListener('input', () => { const v = parseFloat(inp.value); val.textContent = fmt(v); oninput && oninput(v); });
  inp.addEventListener('change', () => onchange && onchange(parseFloat(inp.value)));
  const wrap = h('label', { class: 'slider' }, h('span', { class: 'sl-label' }, label, hint ? h('small', {}, ' ' + hint) : null), inp, val);
  wrap.set = (v) => { inp.value = String(v); val.textContent = fmt(v); };
  wrap.input = inp;
  return wrap;
}

export function toggle({ label, value, onchange, hint }) {
  const inp = h('input', { type: 'checkbox' });
  inp.checked = !!value;
  inp.addEventListener('change', () => onchange && onchange(inp.checked));
  const el = h('label', { class: 'toggle' }, inp, h('span', { class: 'tg-ui' }), h('span', {}, label, hint ? h('small', {}, ' ' + hint) : null));
  el.set = (v) => { inp.checked = !!v; };
  return el;
}

export function chips(items, { value, onpick, cls = '' } = {}) {
  const wrap = h('div', { class: 'chips ' + cls });
  const btns = items.map((it) => {
    const b = h('button', { class: 'chip' + (it.id === value ? ' on' : ''), title: it.title || it.label, 'data-id': it.id }, it.icon ? h('span', { class: 'ci' }, it.icon) : null, h('span', { class: 'cl' }, it.label));
    b.addEventListener('click', () => { wrap.setValue(it.id); onpick && onpick(it.id); });
    wrap.appendChild(b);
    return b;
  });
  wrap.setValue = (id) => btns.forEach((b) => b.classList.toggle('on', b.dataset.id === String(id)));
  return wrap;
}

export function section(title, ...children) {
  return h('div', { class: 'section' }, title ? h('h3', {}, title) : null, ...children);
}

export function btn(label, onclick, cls = '') {
  return h('button', { class: 'btn ' + cls, onclick }, label);
}

export function fmtNum(v, d = 2) {
  if (!Number.isFinite(v)) return '—';
  const a = Math.abs(v);
  if (a >= 1e6) return (v / 1e6).toFixed(2) + 'M';
  if (a >= 1e4) return (v / 1e3).toFixed(1) + 'k';
  if (a >= 100) return v.toFixed(0);
  return v.toFixed(d);
}

export function pct(v, d = 1) {
  return (v * 100).toFixed(d) + '%';
}
