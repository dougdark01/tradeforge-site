/* TradeForge Lab Pro procedural solar scene adapted for the website demo. */
(() => {
  "use strict";

  const TAU = Math.PI * 2;
  const ORBIT_PERIOD_MS = 64_000;
  const CENTER = [0.5, 0.48];
  const phaseOffset = index => .65 + index * TAU / 5;
  const SYSTEM = {
    data:      {x: .26, y: .22, phase: phaseOffset(3), color: [112, 213, 245], shade: [15, 62, 103], style: "ocean"},
    context:   {x: .30, y: .26, phase: phaseOffset(4), color: [194, 173, 251], shade: [61, 47, 113], style: "cloud"},
    execution: {x: .34, y: .29, phase: phaseOffset(0), color: [240, 147, 115], shade: [104, 49, 39], style: "rock"},
    wallet:    {x: .38, y: .32, phase: phaseOffset(1), color: [118, 226, 185], shade: [21, 84, 83], style: "ocean"},
    risk:      {x: .42, y: .34, phase: phaseOffset(2), color: [250, 215, 157], shade: [117, 78, 45], style: "cloud"},
  };
  const ORBIT_TILT = .14;
  const OUTER_ORBIT_Y = Math.hypot(SYSTEM.risk.y, ORBIT_TILT * SYSTEM.risk.x);
  const STAR = [255, 178, 82];
  const RADAR = [91, 220, 211];
  const STEEL = [117, 164, 211];
  const TELEMETRY = {
    quote: {route: ["data", "core"], color: [120, 228, 255], duration: 1750},
    scan: {route: ["data", "context", "risk"], color: [196, 172, 255], duration: 2400},
    decision: {route: ["context", "risk", "core"], color: [255, 201, 118], duration: 2350},
    entry: {route: ["core", "execution", "wallet"], color: [112, 255, 204], duration: 3050},
    exit: {route: ["wallet", "execution", "core"], color: [255, 161, 138], duration: 3050},
    alert: {route: ["risk", "core"], color: [255, 136, 173], duration: 2650},
  };
  const clamp = (value, low = 0, high = 1) => Math.min(high, Math.max(low, value));
  const rgba = ([r,g,b], opacity) => `rgba(${r},${g},${b},${clamp(opacity)})`;
  const blend = (from, to, amount) => from.map((channel, index) => channel + (to[index] - channel) * amount);

  function randomGenerator(seed) {
    return () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
  }

  const random = randomGenerator(20261125);
  const stars = Array.from({length: 150}, () => ({
    x: random(), y: random(), radius: .25 + random() ** 3 * 1.2, opacity: .16 + random() * .47,
  }));

  const hash = (x, y) => {
    const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
    return n - Math.floor(n);
  };
  function noise(x, y) {
    const i = Math.floor(x);
    const j = Math.floor(y);
    const u = x - i;
    const v = y - j;
    const a = u * u * (3 - 2 * u);
    const b = v * v * (3 - 2 * v);
    const top = hash(i,j) * (1-a) + hash(i+1,j) * a;
    const bottom = hash(i,j+1) * (1-a) + hash(i+1,j+1) * a;
    return top * (1-b) + bottom * b;
  }

  function makeSurface(theme, size) {
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext("2d");
    const image = context.createImageData(size, size);
    const {style, color, shade} = theme;
    for (let row = 0; row < size; row++) {
      for (let column = 0; column < size; column++) {
        const x = 2 * (column + .5) / size - 1;
        const y = 2 * (row + .5) / size - 1;
        const radius = Math.hypot(x,y);
        if (radius > 1) continue;
        const depth = Math.sqrt(Math.max(0, 1-radius*radius));
        const u = Math.atan2(x,depth) * 1.5 + 9;
        const v = Math.asin(y) * 1.5 + 11;
        const broad = noise(u*2.5,v*2.5);
        const detail = noise(u*6.7+23,v*6.7);
        const grain = noise(u*23,v*23+7);
        let surface;
        if (style === "star") {
          const granule = clamp(.40*broad + .31*detail + .42*grain);
          surface = blend([210, 66, 22], [255, 251, 192], granule ** .75);
        } else if (style === "cloud") {
          const belt = Math.sin(36*(v + .039*broad + .034*detail) + 1.6*Math.sin(u))*.5+.5;
          surface = blend(shade,color,clamp(.22 + .52*belt + .20*broad + .095*grain));
        } else if (style === "ocean") {
          const land = broad * .67 + detail * .24 + grain * .09;
          const cloud = clamp((noise(u*3.9+32,v*4.2) - .51) * 2.35, 0, .82);
          const ground = blend(shade, color, land>.50 ? .38+land*.39 : .13+grain*.20);
          surface = blend(ground, [193, 230, 235], cloud);
        } else {
          surface = blend(shade, color, clamp(broad*.52 + detail*.38 + grain*.17));
        }
        const light = style === "star" ? .83 + .17 * depth : clamp(.17 + .86*(-x*.52 - y*.61 + depth*.66));
        const rim = style === "star" ? 0 : (1-depth)**4*.24;
        const index = 4 * (row * size + column);
        for (let channel = 0; channel < 3; channel++) {
          image.data[index+channel] = light*surface[channel] + rim*color[channel];
        }
        image.data[index+3] = 255*clamp((1-radius)*size/2);
      }
    }
    context.putImageData(image, 0, 0);
    return canvas;
  }

  class OrbitalScene {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext("2d");
      this.field = canvas.parentElement;
      this.state = {running: false, paused: false, motion: true, visible: false, activeNode: null, positions: [], view: "flow"};
      this.buttons = Object.fromEntries(Array.from(canvas.parentElement.querySelectorAll("[data-node]"), button =>
        [button.dataset.node, button]));
      this.sun = makeSurface({style: "star", color: STAR}, 176);
      for (const [name, button] of Object.entries(this.buttons)) {
        const disc = button.querySelector(".planet-disc");
        const surface = makeSurface(SYSTEM[name], 104);
        disc.getContext("2d").drawImage(surface,0,0);
      }
      this.selected = "context";
      this.flashKey = null;
      this.flashUntil = 0;
      this.seconds = 0;
      this.orbitStartedAt = null;
      this.orbitElapsed = 0;
      this.pointer = [0, 0];
      this.parallax = [0, 0];
      this.pointerMove = event => {
        if (!this.canAnimate()) return;
        const {left, top, width, height} = this.field.getBoundingClientRect();
        this.pointer = [clamp((event.clientX-left)/width)-.5, clamp((event.clientY-top)/height)-.5];
      };
      this.pointerLeave = () => { this.pointer = [0, 0]; };
      this.field.addEventListener("pointermove", this.pointerMove);
      this.field.addEventListener("pointerleave", this.pointerLeave);
      this.frame = 0;
      this.lastFrame = 0;
      this.width = 0;
      this.height = 0;
      this.media = matchMedia("(prefers-reduced-motion: reduce)");
      this.refreshMotion = () => this.refresh();
      document.addEventListener("visibilitychange", this.refreshMotion);
      this.refreshFocus = () => queueMicrotask(this.refreshMotion);
      this.field.addEventListener("focusin", this.refreshFocus);
      this.field.addEventListener("focusout", this.refreshFocus);
      this.media.addEventListener("change", this.refreshMotion);
      this.observer = new ResizeObserver(() => this.resize());
      this.observer.observe(canvas);
      this.viewport = new IntersectionObserver(([entry]) => {
        this.update({visible: entry.isIntersecting});
      });
      this.viewport.observe(canvas);
      this.resize();
    }

    motionAllowed() {
      return this.state.motion && this.state.visible && !this.media.matches && !document.hidden &&
        !this.field.matches(":focus-within") && this.width > 1 && this.height > 1;
    }

    canAnimate() {
      return this.motionAllowed() && (this.state.view === "flow" || this.state.running);
    }

    orbitTime(now) {
      return this.orbitElapsed + (this.orbitStartedAt === null ? 0 : Math.max(0, now - this.orbitStartedAt));
    }

    resize() {
      const {width, height} = this.canvas.getBoundingClientRect();
      if (width === this.width && height === this.height) return;
      const ratio = Math.min(2, devicePixelRatio || 1);
      this.width = width;
      this.height = height;
      // Reserve room for the largest body, its rings and the labels on the lower arc.
      const outerRadius = clamp(width * .0935, 35, 66) / 2;
      const sideRoom = width * .5 - (Math.max(30, outerRadius * 1.57) + 5);
      const verticalRoom = Math.min(height * CENTER[1] - outerRadius - 8,
        height * (1-CENTER[1]) - outerRadius - 25);
      this.orbitWidth = clamp(sideRoom / SYSTEM.risk.x, 0, width);
      this.orbitHeight = clamp(verticalRoom / OUTER_ORBIT_Y, 0, height);
      this.canvas.width = Math.round(width * ratio);
      this.canvas.height = Math.round(height * ratio);
      this.ctx.setTransform(ratio,0,0,ratio,0,0);
      this.refresh();
    }

    update(frame) {
      Object.assign(this.state, frame);
      const {flash, running} = this.state;
      const key = running && flash ? `${flash.node}:${flash.id}` : null;
      if (key !== this.flashKey) {
        this.flashKey = key;
        this.flashUntil = key ? performance.now() + 1450 : 0;
      }
      this.refresh();
    }

    select(node) {
      this.selected = node;
      if (!this.canAnimate()) this.draw(performance.now());
    }

    destroy() {
      cancelAnimationFrame(this.frame);
      this.observer.disconnect();
      this.viewport.disconnect();
      this.field.removeEventListener("focusin", this.refreshFocus);
      this.field.removeEventListener("focusout", this.refreshFocus);
      this.field.removeEventListener("pointermove", this.pointerMove);
      this.field.removeEventListener("pointerleave", this.pointerLeave);
      document.removeEventListener("visibilitychange", this.refreshMotion);
      this.media.removeEventListener("change", this.refreshMotion);
    }

    refresh() {
      const now = performance.now();
      if (this.motionAllowed()) {
        if (this.orbitStartedAt === null) this.orbitStartedAt = now;
      } else if (this.orbitStartedAt !== null) {
        this.orbitElapsed = this.orbitTime(now) % ORBIT_PERIOD_MS;
        this.orbitStartedAt = null;
        this.pointer = this.parallax = [0, 0];
      }
      if (this.canAnimate()) {
        if (!this.frame) {
          this.lastFrame = 0;
          this.frame = requestAnimationFrame(now => this.animate(now));
        }
      } else {
        cancelAnimationFrame(this.frame);
        this.frame = 0;
        this.draw(now);
      }
    }

    animate(now) {
      this.frame = 0;
      if (!this.lastFrame || now-this.lastFrame >= 26) {
        const elapsed = this.lastFrame ? Math.min(now-this.lastFrame,80)/1000 : 0;
        const advance = elapsed * (this.state.paused ? .28 : 1);
        this.seconds += advance;
        this.parallax = this.parallax.map((position,index) => position+(this.pointer[index]-position)*.12);
        this.lastFrame = now;
        this.draw(now);
      }
      if (this.canAnimate()) this.frame = requestAnimationFrame(next => this.animate(next));
    }

    point(planet, angle, x, y) {
      const horizontal = planet.x * Math.cos(angle);
      return [x + this.orbitWidth * horizontal, y + this.orbitHeight * (planet.y * Math.sin(angle) - ORBIT_TILT * horizontal)];
    }

    path(planet, x, y, from = 0, to = TAU, steps = 82) {
      const c = this.ctx;
      c.beginPath();
      for (let index=0; index<=steps; index++) {
        const point = this.point(planet,from+(to-from)*index/steps,x,y);
        if (!index) c.moveTo(...point);
        else c.lineTo(...point);
      }
    }

    draw(now) {
      if (this.width < 2 || this.height < 2) return;
      const x = this.width * CENTER[0];
      const y = this.height * CENTER[1];
      const innerOrbit = Math.min(this.orbitWidth * SYSTEM.data.x, this.orbitHeight * SYSTEM.data.y);
      const innerPlanet = clamp(this.width * .08, 32, 58) / 2;
      const radius = Math.min(this.width*.102, this.height*.158, Math.max(8, innerOrbit * .94 - innerPlanet - 4));
      const c = this.ctx;
      c.clearRect(0,0,this.width,this.height);
      this.backdrop(x,y,radius);
      const effects = this.activeEffects(now);
      if (this.state.view === "radar") this.drawRadar(x,y,effects,now);
      else this.drawFlow(x,y,radius,effects,now);
    }

    activeEffects(now) {
      if (Array.isArray(this.state.effects)) {
        return this.state.effects.filter(effect => {
          const type = TELEMETRY[effect.kind];
          return type && Number.isFinite(effect.at) && now-effect.at < type.duration && effect.at <= now;
        }).slice(-8);
      }
      if (!this.state.running) return [];
      const fallback = {data:"quote", context:"scan", risk:"decision", execution:"entry", wallet:"exit"};
      const flash = this.state.flash;
      return flash && now < this.flashUntil ? [{kind:fallback[flash.node] || "alert", at:this.flashUntil-1450}] : [];
    }

    drawFlow(x,y,radius,effects,now) {
      const c = this.ctx;
      const {activeNode,running,paused} = this.state;
      const orbitAngle = TAU * (this.orbitTime(now) % ORBIT_PERIOD_MS) / ORBIT_PERIOD_MS;
      const centers = {core:[x,y]};
      const activeBodies = new Set(effects.flatMap(effect => TELEMETRY[effect.kind].route));
      for (const [name, planet] of Object.entries(SYSTEM)) {
        const live = running && (activeNode === name || activeBodies.has(name));
        const selected = name === this.selected;
        const phase = planet.phase + orbitAngle;
        const [px,py] = centers[name] = this.point(planet,phase,x,y);
        const button = this.buttons[name];
        const transform = `translate3d(${px.toFixed(2)}px, ${py.toFixed(2)}px, 0px) translate(-50%, -50%)`;
        if (button.style.transform !== transform) button.style.transform = transform;

        this.path(planet,x,y);
        c.strokeStyle = rgba(selected || live ? planet.color : STEEL, live ? .41 : selected ? .35 : .21);
        c.lineWidth = selected || live ? 1.35 : .85;
        c.stroke();

        // Accents show orbital velocity while the brighter channel routes carry actual events.
        const sweep = phase-.18;
        this.path(planet,x,y,sweep-.48,sweep,22);
        c.lineWidth = live ? 2.4 : 1.45;
        c.strokeStyle = rgba(planet.color, live ? .64 : selected ? .51 : .3);
        c.stroke();
        const satellite = this.point(planet,sweep-1.1,x,y);
        this.dot(satellite[0],satellite[1],1.3,planet.color,paused ? .32 : .6);

        const dist = Math.hypot(px-x,py-y) || 1;
        const rim = [x+(px-x)*radius/dist,y+(py-y)*radius/dist];
        this.trace(rim,[px,py],planet.color,selected || live ? .34 : .19,1,[3,6]);
        if (running && !paused && this.canAnimate()) {
          const u = (this.seconds*.29+planet.phase) % 1;
          this.dot(rim[0]+(px-rim[0])*u,rim[1]+(py-rim[1])*u,1.7,planet.color, .48*Math.sin(Math.PI*u));
        }
      }
      for (const effect of effects) this.drawEventRoute(effect,centers,now);
      this.drawSun(x,y,radius,activeBodies.has("core"));
      this.positionMarkers(x,y);
    }

    trace(from,to,color,opacity,width,dashes) {
      const c = this.ctx;
      c.beginPath();
      c.moveTo(...from);
      c.lineTo(...to);
      c.strokeStyle = rgba(color,opacity);
      c.lineWidth = width;
      if (dashes) c.setLineDash(dashes);
      c.stroke();
      if (dashes) c.setLineDash([]);
    }

    dot(x,y,radius,color,opacity) {
      const c = this.ctx;
      c.beginPath();
      c.arc(x,y,radius,0,TAU);
      c.fillStyle = rgba(color,opacity);
      c.fill();
    }

    drawEventRoute(effect,centers,now) {
      const c = this.ctx;
      const {route,color,duration} = TELEMETRY[effect.kind];
      const moving = this.canAnimate();
      const progress = moving ? clamp((now-effect.at)/duration) : .67;
      const fade = 1-.66*progress;
      const segments = route.length-1;
      for (let i=0; i<segments; i++) {
        const [sx,sy] = centers[route[i]];
        const [ex,ey] = centers[route[i+1]];
        const bend = i%2 ? -.29 : .24;
        const mx = (sx+ex)/2 + (ey-sy)*bend;
        const my = (sy+ey)/2 - (ex-sx)*bend;
        c.beginPath();
        c.moveTo(sx,sy);
        c.quadraticCurveTo(mx,my,ex,ey);
        c.lineWidth = 4.5;
        c.strokeStyle = rgba(color,.16*fade);
        c.stroke();
        c.lineWidth = 1.45;
        c.strokeStyle = rgba(color,.75*fade);
        c.stroke();
        const local = progress*segments-i;
        if (local >= 0 && local < 1) {
          const count = moving ? 6 : 1;
          for (let trail=0; trail<count; trail++) {
            const u = clamp(local-trail*.047);
            const a = (1-u)**2;
            const b = 2*u*(1-u);
            const px = a*sx + b*mx + u*u*ex;
            const py = a*sy + b*my + u*u*ey;
            if (!trail) this.light(px,py,14,color,fade);
            this.dot(px,py,trail ? 1.4 : 2.6,color,fade*(1-trail/count));
          }
        }
      }
    }

    light(x,y,radius,color,opacity) {
      const c = this.ctx;
      const glow = c.createRadialGradient(x,y,0,x,y,radius);
      glow.addColorStop(0,rgba(blend(color,[255,255,255],.57),opacity));
      glow.addColorStop(.33,rgba(color,opacity*.58));
      glow.addColorStop(1,rgba(color,0));
      c.fillStyle = glow;
      c.fillRect(x-radius,y-radius,radius*2,radius*2);
    }

    backdrop(x,y,radius) {
      const c = this.ctx;
      const [parallaxX,parallaxY] = this.parallax;
      const nebula = c.createRadialGradient(x*.76+parallaxX*13,y*.81+parallaxY*9,5,x,y,this.width*.60);
      nebula.addColorStop(0,"rgba(37,44,94,.59)");
      nebula.addColorStop(.55,"rgba(19,43,65,.42)");
      nebula.addColorStop(1,"rgba(7,13,25,0)");
      c.fillStyle = nebula;
      c.fillRect(0,0,this.width,this.height);
      for (const star of stars) {
        const depth = 2+star.radius*11;
        this.dot(this.width*star.x+parallaxX*depth,this.height*star.y+parallaxY*depth,
          star.radius,[189,215,244],star.opacity);
      }

      const left = this.width*.06;
      const right = this.width*.94;
      const top = this.height*.09;
      const bottom = this.height*.91;
      this.trace([left,y],[right,y],STEEL,.18,1,[4,8]);
      this.trace([x,top],[x,bottom],STEEL,.15,1,[4,8]);
      for (const [sx,sy] of [[left,top],[right,top],[left,bottom],[right,bottom]]) {
        const vertical = sy<y ? 1 : -1;
        const horizontal = sx<x ? 1 : -1;
        c.beginPath();
        c.moveTo(sx,sy+vertical*10);
        c.lineTo(sx,sy);
        c.lineTo(sx+horizontal*16,sy);
        c.strokeStyle = rgba(STEEL,.39);
        c.lineWidth = 1;
        c.stroke();
      }
      if (this.state.view === "flow") this.light(x,y,radius*2.8,STAR,this.state.running ? .28 : .18);
    }

    drawSun(x,y,radius,receiving) {
      const c = this.ctx;
      const phase = this.seconds;
      const glow = c.createRadialGradient(x,y,radius*.91,x,y,radius*1.52);
      glow.addColorStop(0,"rgba(255,187,86,.74)");
      glow.addColorStop(.24,"rgba(255,137,55,.32)");
      glow.addColorStop(1,"rgba(244,88,46,0)");
      c.fillStyle = glow;
      c.fillRect(x-radius*1.53,y-radius*1.53,radius*3.06,radius*3.06);

      c.save();
      c.translate(x,y);
      c.rotate(-.37+phase*.12);
      c.drawImage(this.sun,-radius,-radius,radius*2,radius*2);
      c.restore();
      c.beginPath();
      c.arc(x,y,radius,0,TAU);
      c.lineWidth = 1.1;
      c.strokeStyle = "rgba(255,228,164,.83)";
      c.stroke();

      // Instrument rings share the star anchor while counter-rotating at different speeds.
      const rings = [[1.17, .89, -.18, .55, RADAR],[1.40, .90, .18, -.39, STAR]];
      for (const [reach,ratio,tilt,speed,tint] of rings) {
        const angle = phase*speed+reach*3;
        c.beginPath();
        c.ellipse(x,y,radius*reach,radius*reach*ratio,tilt,0,TAU);
        c.lineWidth = .8;
        c.strokeStyle = rgba(tint,.28);
        c.stroke();
        c.beginPath();
        c.ellipse(x,y,radius*reach,radius*reach*ratio,tilt,angle,angle+1.34);
        c.lineWidth = receiving ? 2.3 : 1.5;
        c.strokeStyle = rgba(tint,receiving ? .87 : .58);
        c.stroke();
      }
      const r = radius*1.50;
      c.beginPath();
      for (let i=0; i<36; i++) {
        const angle = i*TAU/36;
        const length = i%3 ? 3 : 7;
        const dx = Math.cos(angle), dy = Math.sin(angle);
        c.moveTo(x+dx*(r-length),y+dy*(r-length));
        c.lineTo(x+dx*r,y+dy*r);
      }
      c.strokeStyle = rgba(STAR,.38);
      c.lineWidth = .8;
      c.stroke();
    }

    drawRadar(x,y,effects,now) {
      const c = this.ctx;
      const radius = Math.min(this.width*.32,this.height*.41);
      const colors = {waiting:STEEL, open:[114,249,198], stale:[249,172,117], pending:[255,198,122]};
      this.light(x,y,Math.max(1,radius*1.18),RADAR,.11);
      for (let i=1; i<=4; i++) {
        c.beginPath();
        c.arc(x,y,radius*i/4,0,TAU);
        c.strokeStyle = rgba(RADAR,i===4 ? .43 : .25);
        c.lineWidth = i===4 ? 1.25 : .85;
        c.stroke();
      }
      this.trace([x-radius,y],[x+radius,y],RADAR,.22,1);
      this.trace([x,y-radius],[x,y+radius],RADAR,.22,1);
      c.beginPath();
      for (let i=0; i<48; i++) {
        const angle = i*TAU/48;
        const [dx,dy] = [Math.cos(angle), Math.sin(angle)];
        const start = radius - (i%6 ? 6 : 13);
        c.moveTo(x+dx*start,y+dy*start);
        c.lineTo(x+dx*radius,y+dy*radius);
      }
      c.strokeStyle = rgba(RADAR,.31);
      c.lineWidth = .9;
      c.stroke();

      if (this.state.running && this.canAnimate() && !this.state.paused) {
        const sweep = this.seconds*.83-Math.PI/2;
        for (let step=1; step<=20; step++) {
          const angle = sweep-(step-1)*.046;
          c.beginPath();
          c.moveTo(x,y);
          c.arc(x,y,radius,angle-.047,angle);
          c.closePath();
          c.fillStyle = rgba(RADAR,.23*(1-step/21)**1.7);
          c.fill();
        }
        this.trace([x,y],[x+radius*Math.cos(sweep), y+radius*Math.sin(sweep)],RADAR,.8,1.25);
      }

      const assets = Array.isArray(this.state.radarAssets) ? this.state.radarAssets : [];
      const buttons = Object.fromEntries(Array.from(this.field.querySelectorAll("[data-demo-asset]"), button =>
        [button.dataset.demoAsset, button]));
      const contacts = assets.length;
      // The asset list is stable. Coordinates vary only with a resize or a universe change.
      for (const [index,symbol] of assets.entries()) {
        const angle = -Math.PI*.78 + index*TAU/contacts;
        const distance = radius * (index%2 ? .76 : .68);
        const px = x+Math.cos(angle)*distance;
        const py = y+Math.sin(angle)*distance;
        const button = buttons[symbol];
        if (button) {
          const pxValue = `${px.toFixed(2)}px`;
          const pyValue = `${py.toFixed(2)}px`;
          if (button.style.left !== pxValue) button.style.left = pxValue;
          if (button.style.top !== pyValue) button.style.top = pyValue;
        }
        const setup = this.state.selectedAsset === symbol;
        const observed = this.state.positions.some(position => position.symbol === symbol && position.qty > 0);
        const tone = colors[button?.dataset.state] || (observed ? colors.open : colors.waiting);
        const recent = effects.find(effect => effect.symbol === symbol && (effect.kind === "entry" || effect.kind === "exit"));
        if (setup || observed) {
          this.trace([x,y],[px,py],tone,setup ? .45 : .24,1,[4,5]);
          this.light(px,py,setup ? 20 : 15,tone,setup ? .48 : .37);
        }
        if (recent) {
          const {color,duration} = TELEMETRY[recent.kind];
          const progress = this.canAnimate() ? clamp((now-recent.at)/duration) : .3;
          c.beginPath();
          c.arc(px,py,8+progress*34,0,TAU);
          c.strokeStyle = rgba(color,.8*(1-progress));
          c.lineWidth = 1.4;
          c.stroke();
        }
        this.dot(px,py,2.4,tone,.85);
      }
      this.dot(x,y,3,RADAR,.88);
    }

    positionMarkers(x,y) {
      const positions = (this.state.positions || []).filter(position => position?.symbol && position.qty > 0);
      if (!positions.length) return;
      const c = this.ctx;
      const label = positions.length === 1 ? positions[0].symbol : `${positions.length} posições`;
      const marker = SYSTEM.wallet;
      const [px,py] = this.point(marker,2.02,x,y);
      this.light(px,py,8,[116,244,206],.94);
      c.font = "600 10px Segoe UI, sans-serif";
      c.fillStyle = "#affeec";
      c.textAlign = "right";
      c.textBaseline = "middle";
      c.fillText(label,px-9,py);
    }
  }

  window.TradeForgeOrbitalScene = OrbitalScene;
})();
