// Centralised input: keyboard state, pointer-lock mouse look, wheel, and
// edge-triggered "just pressed" events other systems can subscribe to.
export class Input {
  constructor(domElement) {
    this.dom = domElement;
    this.keys = new Set();          // currently held key codes
    this.mouse = { dx: 0, dy: 0 };  // accumulated look delta since last read
    this.buttons = new Set();       // held mouse buttons (0 = LMB, 2 = RMB)
    this.wheel = 0;                 // accumulated wheel delta (sign only used)
    this.locked = false;
    this._listeners = { press: [], down: [], up: [], wheel: [] };

    addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      this._emit('press', e.code);
      // Prevent the page scrolling on space / arrows while playing.
      if (['Space', 'Tab'].includes(e.code) && this.locked) e.preventDefault();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));

    this.dom.addEventListener('mousedown', (e) => {
      if (!this.locked) return;
      this.buttons.add(e.button);
      this._emit('down', e.button);
    });
    addEventListener('mouseup', (e) => {
      this.buttons.delete(e.button);
      this._emit('up', e.button);
    });
    addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.mouse.dx += e.movementX;
      this.mouse.dy += e.movementY;
    });
    addEventListener('wheel', (e) => {
      if (!this.locked) return;
      const dir = Math.sign(e.deltaY);
      this.wheel += dir;
      this._emit('wheel', dir);
    }, { passive: true });
    this.dom.addEventListener('contextmenu', (e) => e.preventDefault());

    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.dom;
      if (!this.locked) { this.keys.clear(); this.buttons.clear(); }
    });
  }

  requestLock() { this.dom.requestPointerLock?.(); }
  exitLock() { document.exitPointerLock?.(); }

  on(type, fn) { this._listeners[type].push(fn); }
  _emit(type, v) { for (const fn of this._listeners[type]) fn(v); }

  isDown(code) { return this.keys.has(code); }
  isButton(b) { return this.buttons.has(b); }

  // Reads and clears the accumulated mouse look delta.
  consumeLook() {
    const d = { x: this.mouse.dx, y: this.mouse.dy };
    this.mouse.dx = 0; this.mouse.dy = 0;
    return d;
  }
}
