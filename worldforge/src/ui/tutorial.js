// Short interactive tutorial. Each step completes from real actions.
import { h } from './dom.js';

const STEPS = [
  { title: 'Welcome to WORLDFORGE', text: 'Shape worlds. Stir storms. Seed life. This Earth–Moon scene is live: gravity, water, weather and life are all simulating. Tap Next to begin.', manual: true },
  { title: '1 · Rotate the view', text: 'Drag with one finger (or the mouse) to orbit around Earth.', on: 'orbit' },
  { title: '2 · Zoom', text: 'Pinch with two fingers (or scroll) to zoom in toward the surface.', on: 'zoom' },
  { title: '3 · Pour water', text: 'Open 💧 Water → Pour water, then drag one finger across dry land. Water falls toward the planet centre, pools in hollows and flows downhill. Two fingers still move the camera.', check: (app) => app.stats.poured > 0.5 },
  { title: '4 · Make weather', text: 'Open 🌀 Weather, pick Tornado or Hurricane (try Forced for any location), then tap the planet.', on: 'storm' },
  { title: '5 · Spawn life', text: 'Open 🌱 Life → choose an animal in Organism dropper and tap green land. The game explains if it cannot thrive there.', on: 'animal' },
  { title: '6 · Create an orbit', text: 'Open 🛰️ Orbits → Add a moon to the selected body. Gravity takes over from the initial velocity.', on: 'orbit-created' },
  { title: '7 · Load a scene', text: 'Open ✨ Presets and load any scene, e.g. Flood Lab or Storm World. You will be offered to save first.', on: 'scene' },
  { title: 'You are ready!', text: 'Tip: ✋ View returns to camera mode. ⚙ holds quality, units and audio. Undo ↶ reverts discrete edits.', manual: true, last: true },
];

export class Tutorial {
  constructor(app, root) {
    this.app = app;
    this.root = root;
    this.i = -1;
    this.el = h('div', { class: 'tutorial hidden' });
    root.appendChild(this.el);
  }
  start() {
    this.i = 0;
    this.render();
  }
  stop(done = true) {
    this.i = -1;
    this.el.classList.add('hidden');
    if (done) this.app.storagePref('tutorialDone', true);
  }
  notify(ev) {
    if (this.i < 0) return;
    const s = STEPS[this.i];
    if (s.on && (ev === s.on || ev.startsWith(s.on))) this.next();
  }
  tick() {
    if (this.i < 0) return;
    const s = STEPS[this.i];
    if (s.check && s.check(this.app)) this.next();
  }
  next() {
    this.i++;
    if (this.i >= STEPS.length) return this.stop(true);
    this.render();
  }
  render() {
    const s = STEPS[this.i];
    this.el.innerHTML = '';
    this.el.classList.remove('hidden');
    this.el.append(
      h('div', { class: 't-step' }, `${this.i + 1}/${STEPS.length}`),
      h('b', {}, s.title),
      h('p', {}, s.text),
      h('div', { class: 'row' },
        h('button', { class: 'btn small', onclick: () => this.stop(true) }, 'Skip tutorial'),
        h('button', { class: 'btn small primary', onclick: () => this.next() }, s.last ? 'Finish' : s.manual ? 'Next' : 'Skip step')),
    );
  }
}
