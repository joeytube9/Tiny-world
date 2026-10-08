// Pointer input. View mode: 1 finger orbits, pinch zooms, 2-finger drag pans.
// Brush tools: 1 finger applies the tool, 2 fingers control the camera.
// Tap tools: tap applies, drag orbits. Mouse: wheel zoom, right/shift-drag pan.
export class Input {
  constructor(el, app) {
    this.el = el;
    this.app = app;
    this.pointers = new Map();
    this.mode = 'idle';
    this.pinch = null;
    el.style.touchAction = 'none';
    el.addEventListener('pointerdown', (e) => this.down(e));
    el.addEventListener('pointermove', (e) => this.move(e));
    el.addEventListener('pointerup', (e) => this.up(e));
    el.addEventListener('pointercancel', (e) => this.cancel(e));
    el.addEventListener('lostpointercapture', (e) => { if (this.pointers.has(e.pointerId)) this.cancel(e); });
    el.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') app.hover(null); });
    el.addEventListener('wheel', (e) => { e.preventDefault(); app.renderer.zoomCamera(Math.exp(e.deltaY * 0.0012)); app.notify('zoom'); }, { passive: false });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    // iOS Safari gesture events (prevent page zoom)
    for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(ev, (e) => e.preventDefault(), { passive: false });
    window.addEventListener('keydown', (e) => this.key(e));
  }

  pos(e) {
    const r = this.el.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  down(e) {
    this.app.audio.unlock();
    const p = this.pos(e);
    try { this.el.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    this.pointers.set(e.pointerId, { ...p, sx: p.x, sy: p.y, t0: performance.now(), button: e.button, type: e.pointerType, shift: e.shiftKey });
    const n = this.pointers.size;
    if (n === 1) {
      const mouseAlt = e.pointerType === 'mouse' && (e.button === 2 || e.button === 1 || e.shiftKey);
      if (mouseAlt) this.mode = e.button === 2 && !e.shiftKey ? 'orbit' : 'pan';
      else if (this.app.isBrushTool()) {
        this.mode = 'brush';
        this.app.brushStart(p.x, p.y);
      } else this.mode = 'tap';
    } else if (n === 2) {
      if (this.mode === 'brush') this.app.brushEnd(true);
      const [a, b] = [...this.pointers.values()];
      this.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
      this.mode = 'pinch';
    }
  }

  move(e) {
    const p = this.pos(e);
    const ptr = this.pointers.get(e.pointerId);
    if (!ptr) {
      if (e.pointerType === 'mouse') this.app.hover(p);
      return;
    }
    const dx = p.x - ptr.x, dy = p.y - ptr.y;
    ptr.x = p.x; ptr.y = p.y;
    switch (this.mode) {
      case 'brush':
        this.app.brushMove(p.x, p.y);
        break;
      case 'tap':
        if (Math.hypot(p.x - ptr.sx, p.y - ptr.sy) > 7) this.mode = 'orbit';
        break;
      case 'orbit':
        this.app.renderer.orbitCamera(dx, dy);
        this.app.notify('orbit');
        break;
      case 'pan':
        this.app.renderer.panCamera(dx, dy);
        break;
      case 'pinch': {
        if (this.pointers.size < 2) break;
        const [a, b] = [...this.pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        if (this.pinch.d > 10 && d > 10) this.app.renderer.zoomCamera(this.pinch.d / d);
        this.app.renderer.panCamera(mx - this.pinch.mx, my - this.pinch.my);
        this.pinch = { d, mx, my };
        this.app.notify('zoom');
        break;
      }
    }
    if (e.pointerType === 'mouse') this.app.hover(p);
  }

  up(e) {
    const ptr = this.pointers.get(e.pointerId);
    if (!ptr) return;
    const p = this.pos(e);
    if (this.mode === 'tap' && performance.now() - ptr.t0 < 600) this.app.tap(p.x, p.y);
    if (this.mode === 'brush') this.app.brushEnd(false);
    this.pointers.delete(e.pointerId);
    if (this.pointers.size === 0) this.mode = 'idle';
    else if (this.mode === 'pinch') this.mode = 'hold'; // remaining finger does nothing until lifted
  }

  cancel(e) {
    if (this.mode === 'brush') this.app.brushEnd(true);
    this.pointers.delete(e.pointerId);
    if (this.pointers.size === 0) this.mode = 'idle';
  }

  key(e) {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT')) return;
    const a = this.app;
    if (e.key === ' ') { e.preventDefault(); a.togglePause(); }
    else if ((e.key === 'z' || e.key === 'Z') && (e.ctrlKey || e.metaKey)) { e.preventDefault(); e.shiftKey ? a.redo() : a.undo(); }
    else if (e.key === 'y' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); a.redo(); }
    else if (e.key === 'Escape') a.setTool('view');
    else if (e.key === '.') a.step();
  }
}
