(function () {
  "use strict";

  var canvas = document.getElementById("scene");
  var ctx = canvas.getContext("2d", { alpha: false });

  var hud = {
    mode: document.getElementById("mode"),
    nodes: document.getElementById("nodes"),
    fps: document.getElementById("fps"),
    net: document.getElementById("net")
  };

  var state = {
    mode: "NETWORK",
    nodeDensity: 24,
    connectionRadius: 0.75,
    movementSpeed: 1,
    color: "cyan",
    frozen: false
  };

  var palette = {
    cyan: [112, 242, 255],
    amber: [255, 190, 86],
    magenta: [255, 104, 224],
    white: [235, 248, 255]
  };

  var nodes = [];
  var orbitals = [];
  var trail = [];
  var walker = { x: 0, y: 0, dx: 1, dy: 0, stepTimer: 0 };

  var lastTime = performance.now();
  var fpsTime = lastTime;
  var frames = 0;
  var width = 0;
  var height = 0;
  var ws = null;
  var reconnectTimer = null;

  function randomNode(i) {
    var angle = (i * 2.399963229728653) % (Math.PI * 2);
    var radius = 0.12 + ((i * 37) % 100) / 100 * 0.34;
    return {
      x: 0.5 + Math.cos(angle) * radius,
      y: 0.5 + Math.sin(angle) * radius * 0.62,
      vx: Math.sin(i * 1.7) * 0.00007,
      vy: Math.cos(i * 2.3) * 0.00006,
      phase: i * 0.67
    };
  }

  function rebuildNodes() {
    var count = Math.max(4, Math.min(30, Number(state.nodeDensity) || 24));
    while (nodes.length < count) {
      nodes.push(randomNode(nodes.length));
    }
    if (nodes.length > count) {
      nodes.length = count;
    }
    hud.nodes.textContent = String(nodes.length);
  }

  function initOrbitals() {
    if (orbitals.length) return;
    orbitals = [
      { radius: 0.18, speed: 0.00018, phase: 0.2 },
      { radius: 0.27, speed: -0.00013, phase: 2.1 },
      { radius: 0.34, speed: 0.00009, phase: 4.2 }
    ];
  }

  function resize() {
    var dpr = 1;
    width = Math.max(1, window.innerWidth);
    height = Math.max(1, window.innerHeight);
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = width + "px";
    canvas.style.height = height + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function rgb(alpha) {
    var c = palette[state.color] || palette.cyan;
    return "rgba(" + c[0] + "," + c[1] + "," + c[2] + "," + alpha + ")";
  }

  function updateNetwork(dt, t) {
    if (state.frozen) return;
    var speed = Number(state.movementSpeed) || 0;

    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      n.x += (n.vx + Math.sin(t * 0.00035 + n.phase) * 0.000015) * dt * speed;
      n.y += (n.vy + Math.cos(t * 0.00031 + n.phase) * 0.000012) * dt * speed;

      if (n.x < 0.12 || n.x > 0.88) n.vx *= -1;
      if (n.y < 0.14 || n.y > 0.86) n.vy *= -1;

      n.x = Math.max(0.08, Math.min(0.92, n.x));
      n.y = Math.max(0.10, Math.min(0.90, n.y));
    }
  }

  function drawNetwork(t, strength) {
    var threshold = Math.max(0.08, Math.min(0.42, Number(state.connectionRadius) * 0.16));
    var thresholdSq = threshold * threshold;
    var maxSegments = 80;
    var segments = 0;

    ctx.lineWidth = 1;

    for (var i = 0; i < nodes.length; i++) {
      for (var j = i + 1; j < nodes.length; j++) {
        if (segments >= maxSegments) break;
        var dx = nodes[i].x - nodes[j].x;
        var dy = nodes[i].y - nodes[j].y;
        var d2 = dx * dx + dy * dy;
        if (d2 < thresholdSq) {
          var alpha = (1 - d2 / thresholdSq) * 0.32 * strength;
          ctx.strokeStyle = rgb(alpha);
          ctx.beginPath();
          ctx.moveTo(nodes[i].x * width, nodes[i].y * height);
          ctx.lineTo(nodes[j].x * width, nodes[j].y * height);
          ctx.stroke();
          segments++;
        }
      }
    }

    for (var k = 0; k < nodes.length; k++) {
      var n = nodes[k];
      var pulse = 1.5 + Math.sin(t * 0.003 + n.phase) * 0.55;
      ctx.fillStyle = rgb(0.72 * strength);
      ctx.beginPath();
      ctx.arc(n.x * width, n.y * height, Math.max(1.2, pulse), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawOrbitals(t, strength) {
    initOrbitals();
    var cx = width * 0.5;
    var cy = height * 0.5;

    for (var i = 0; i < orbitals.length; i++) {
      var o = orbitals[i];
      var r = Math.min(width, height) * o.radius;

      ctx.strokeStyle = "rgba(255,255,255," + (0.08 * strength) + ")";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();

      var a = o.phase + t * o.speed * state.movementSpeed;
      var x = cx + Math.cos(a) * r;
      var y = cy + Math.sin(a) * r * 0.72;

      var c = i === 1 ? "rgba(255,104,224," : "rgba(255,190,86,";
      ctx.fillStyle = c + (0.8 * strength) + ")";
      ctx.beginPath();
      ctx.arc(x, y, 3.2 + i, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function updateWalker(dt) {
    if (state.frozen) return;
    walker.stepTimer += dt * state.movementSpeed;
    if (walker.stepTimer < 170) return;
    walker.stepTimer = 0;

    if (!trail.length) {
      walker.x = 0;
      walker.y = 0;
      trail.push({ x: walker.x, y: walker.y });
    }

    if (Math.random() < 0.32) {
      if (walker.dx !== 0) {
        walker.dy = Math.random() < 0.5 ? -1 : 1;
        walker.dx = 0;
      } else {
        walker.dx = Math.random() < 0.5 ? -1 : 1;
        walker.dy = 0;
      }
    }

    walker.x += walker.dx;
    walker.y += walker.dy;

    if (walker.x > 8 || walker.x < -8) {
      walker.dx *= -1;
      walker.x += walker.dx * 2;
    }
    if (walker.y > 5 || walker.y < -5) {
      walker.dy *= -1;
      walker.y += walker.dy * 2;
    }

    trail.push({ x: walker.x, y: walker.y });
    while (trail.length > 40) trail.shift();
  }

  function drawWalker(strength) {
    if (trail.length < 2) return;

    var grid = Math.max(18, Math.min(width / 18, height / 12));
    var cx = width * 0.5;
    var cy = height * 0.5;

    ctx.strokeStyle = rgb(0.46 * strength);
    ctx.lineWidth = 1.2;
    ctx.beginPath();

    for (var i = 0; i < trail.length; i++) {
      var p = trail[i];
      var x = cx + p.x * grid;
      var y = cy + p.y * grid;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    var last = trail[trail.length - 1];
    ctx.fillStyle = rgb(0.9 * strength);
    ctx.beginPath();
    ctx.arc(cx + last.x * grid, cy + last.y * grid, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  function draw(t, dt) {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, width, height);

    updateNetwork(dt, t);
    updateWalker(dt);

    var mode = state.mode;

    if (mode === "NETWORK") {
      drawNetwork(t, 1);
    } else if (mode === "ORBITAL") {
      drawOrbitals(t, 1);
      drawNetwork(t, 0.25);
    } else if (mode === "GRID") {
      drawWalker(1);
      drawNetwork(t, 0.18);
    } else {
      drawNetwork(t, 0.62);
      drawOrbitals(t, 0.85);
      drawWalker(0.75);
    }
  }

  function applyState(next) {
    state.mode = next.mode || state.mode;
    state.nodeDensity = next.nodeDensity;
    state.connectionRadius = next.connectionRadius;
    state.movementSpeed = next.movementSpeed;
    state.color = next.color || state.color;
    state.frozen = !!next.frozen;

    hud.mode.textContent = state.mode;
    rebuildNodes();
  }

  function connect() {
    clearTimeout(reconnectTimer);

    var protocol = location.protocol === "https:" ? "wss://" : "ws://";
    ws = new WebSocket(protocol + location.host + "/ws");

    ws.onopen = function () {
      hud.net.textContent = "LOCAL";
      ws.send(JSON.stringify({ type: "get" }));
    };

    ws.onmessage = function (event) {
      try {
        var data = JSON.parse(event.data);
        if (data.type === "state") applyState(data);
      } catch (_err) {}
    };

    ws.onclose = function () {
      hud.net.textContent = "OFF";
      reconnectTimer = setTimeout(connect, 1500);
    };

    ws.onerror = function () {
      hud.net.textContent = "ERR";
    };
  }

  function frame(t) {
    var dt = Math.min(50, t - lastTime);
    lastTime = t;

    draw(t, dt);

    frames++;
    if (t - fpsTime >= 1000) {
      hud.fps.textContent = String(Math.round(frames * 1000 / (t - fpsTime)));
      fpsTime = t;
      frames = 0;
    }

    requestAnimationFrame(frame);
  }

  window.addEventListener("resize", resize, false);
  resize();
  rebuildNodes();
  initOrbitals();
  connect();
  requestAnimationFrame(frame);
}());
