(function () {
  var ws;
  var reconnectTimer;

  var ui = {
    dot: document.getElementById("dot"),
    connection: document.getElementById("connection"),
    mode: document.getElementById("mode"),
    nodeDensity: document.getElementById("nodeDensity"),
    nodeDensityValue: document.getElementById("nodeDensityValue"),
    connectionRadius: document.getElementById("connectionRadius"),
    connectionRadiusValue: document.getElementById("connectionRadiusValue"),
    movementSpeed: document.getElementById("movementSpeed"),
    movementSpeedValue: document.getElementById("movementSpeedValue"),
    color: document.getElementById("color"),
    opticalPreset: document.getElementById("opticalPreset"),
    sensorToggle: document.getElementById("sensorToggle"),
    sensorCalibrate: document.getElementById("sensorCalibrate"),
    sensorStatus: document.getElementById("sensorStatus"),
    yawValue: document.getElementById("yawValue"),
    pitchValue: document.getElementById("pitchValue"),
    rollValue: document.getElementById("rollValue"),
    freeze: document.getElementById("freeze"),
    reset: document.getElementById("reset"),
    debug: document.getElementById("debug")
  };

  var currentFrozen = false;
  var sensorActive = false;
  var lastSensorSend = 0;
  var neutral = null;
  var smooth = { yaw: 0, pitch: 0, roll: 0 };
  var latestRaw = { alpha: 0, beta: 0, gamma: 0 };

  function shortestAngle(current, base) {
    var d = normalizeAngle(current - base);
    return d;
  }

  function lowPass(previous, next, amount) {
    return previous + (next - previous) * amount;
  }

  function calibrateNeutral() {
    neutral = {
      alpha: latestRaw.alpha,
      beta: latestRaw.beta,
      gamma: latestRaw.gamma
    };
    smooth.yaw = 0;
    smooth.pitch = 0;
    smooth.roll = 0;
    ui.sensorStatus.textContent = sensorActive ? "CALIBRATED" : "READY";
    send({ type: "sensor", enabled: sensorActive, yaw: 0, pitch: 0, roll: 0 });
  }

  function normalizeAngle(value) {
    var n = Number(value || 0);
    while (n > 180) n -= 360;
    while (n < -180) n += 360;
    return n;
  }

  function sendSensor(yaw, pitch, roll) {
    var now = Date.now();
    if (now - lastSensorSend < 50) return;
    lastSensorSend = now;

    ui.yawValue.textContent = yaw.toFixed(1);
    ui.pitchValue.textContent = pitch.toFixed(1);
    ui.rollValue.textContent = roll.toFixed(1);

    send({
      type: "sensor",
      enabled: sensorActive,
      yaw: yaw,
      pitch: pitch,
      roll: roll
    });
  }

  function onOrientation(event) {
    if (!sensorActive) return;

    latestRaw.alpha = Number(event.alpha || 0);
    latestRaw.beta = Number(event.beta || 0);
    latestRaw.gamma = Number(event.gamma || 0);

    if (!neutral) {
      calibrateNeutral();
      return;
    }

    // Phone-first control mapping:
    // alpha  -> left/right heading around neutral
    // beta   -> forward/back tilt around neutral
    // gamma  -> side tilt around neutral
    var yaw = shortestAngle(latestRaw.alpha, neutral.alpha);
    var pitch = latestRaw.beta - neutral.beta;
    var roll = latestRaw.gamma - neutral.gamma;

    // Keep the control range intentionally small and predictable.
    yaw = Math.max(-45, Math.min(45, yaw));
    pitch = Math.max(-35, Math.min(35, pitch));
    roll = Math.max(-35, Math.min(35, roll));

    // Suppress tiny hand jitter.
    if (Math.abs(yaw) < 1.0) yaw = 0;
    if (Math.abs(pitch) < 1.0) pitch = 0;
    if (Math.abs(roll) < 1.0) roll = 0;

    // Smooth before transmission.
    smooth.yaw = lowPass(smooth.yaw, yaw, 0.18);
    smooth.pitch = lowPass(smooth.pitch, pitch, 0.18);
    smooth.roll = lowPass(smooth.roll, roll, 0.18);

    sendSensor(smooth.yaw, smooth.pitch, smooth.roll);
  }

  function startSensors() {
    function activate() {
      sensorActive = true;
      neutral = null;
      ui.sensorStatus.textContent = "MOVE / CALIBRATE";
      ui.sensorToggle.textContent = "DISABLE PHONE SENSORS";
      window.addEventListener("deviceorientation", onOrientation, true);
      send({ type: "sensor", enabled: true, yaw: 0, pitch: 0, roll: 0 });
    }

    if (typeof DeviceOrientationEvent !== "undefined" &&
        typeof DeviceOrientationEvent.requestPermission === "function") {
      DeviceOrientationEvent.requestPermission().then(function (result) {
        if (result === "granted") activate();
        else ui.sensorStatus.textContent = "DENIED";
      }).catch(function () {
        ui.sensorStatus.textContent = "ERROR";
      });
    } else if ("DeviceOrientationEvent" in window) {
      activate();
    } else {
      ui.sensorStatus.textContent = "UNAVAILABLE";
    }
  }

  function stopSensors() {
    sensorActive = false;
    neutral = null;
    window.removeEventListener("deviceorientation", onOrientation, true);
    ui.sensorStatus.textContent = "OFF";
    ui.sensorToggle.textContent = "ENABLE PHONE SENSORS";
    send({ type: "sensor", enabled: false, yaw: 0, pitch: 0, roll: 0 });
  }

  function wsUrl() {
    var protocol = location.protocol === "https:" ? "wss://" : "ws://";
    return protocol + location.host + "/ws";
  }

  function setConnected(connected) {
    ui.connection.textContent = connected ? "CONNECTED" : "DISCONNECTED";
    ui.dot.className = connected ? "on" : "";
  }

  function send(message) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  function setValue(key, value) {
    send({ type: "set", key: key, value: value });
  }

  function applyState(s) {
    ui.mode.value = s.mode;
    ui.nodeDensity.value = s.nodeDensity;
    ui.nodeDensityValue.textContent = s.nodeDensity;

    ui.connectionRadius.value = s.connectionRadius;
    ui.connectionRadiusValue.textContent = Number(s.connectionRadius).toFixed(2);

    ui.movementSpeed.value = s.movementSpeed;
    ui.movementSpeedValue.textContent = Number(s.movementSpeed).toFixed(2);

    ui.color.value = s.color;
    if (ui.opticalPreset && s.opticalPreset) ui.opticalPreset.value = s.opticalPreset;
    if (!sensorActive && s.sensorEnabled) ui.sensorStatus.textContent = "REMOTE";
    if (!sensorActive && !s.sensorEnabled) ui.sensorStatus.textContent = "OFF";
    if (typeof s.yaw === "number") ui.yawValue.textContent = Number(s.yaw).toFixed(1);
    if (typeof s.pitch === "number") ui.pitchValue.textContent = Number(s.pitch).toFixed(1);
    if (typeof s.roll === "number") ui.rollValue.textContent = Number(s.roll).toFixed(1);
    currentFrozen = !!s.frozen;
    ui.freeze.textContent = currentFrozen ? "RESUME" : "FREEZE";

    ui.debug.textContent = JSON.stringify(s, null, 2);
  }

  function connect() {
    clearTimeout(reconnectTimer);
    ws = new WebSocket(wsUrl());

    ws.onopen = function () {
      setConnected(true);
      send({ type: "get" });
    };

    ws.onmessage = function (event) {
      try {
        var data = JSON.parse(event.data);
        if (data.type === "state") {
          applyState(data);
        }
      } catch (_err) {
        ui.debug.textContent = "Invalid message";
      }
    };

    ws.onclose = function () {
      setConnected(false);
      reconnectTimer = setTimeout(connect, 1500);
    };

    ws.onerror = function () {
      setConnected(false);
    };
  }

  ui.mode.addEventListener("change", function () {
    setValue("mode", ui.mode.value);
  });

  ui.nodeDensity.addEventListener("input", function () {
    ui.nodeDensityValue.textContent = ui.nodeDensity.value;
  });
  ui.nodeDensity.addEventListener("change", function () {
    setValue("nodeDensity", Number(ui.nodeDensity.value));
  });

  ui.connectionRadius.addEventListener("input", function () {
    ui.connectionRadiusValue.textContent = Number(ui.connectionRadius.value).toFixed(2);
  });
  ui.connectionRadius.addEventListener("change", function () {
    setValue("connectionRadius", Number(ui.connectionRadius.value));
  });

  ui.movementSpeed.addEventListener("input", function () {
    ui.movementSpeedValue.textContent = Number(ui.movementSpeed.value).toFixed(2);
  });
  ui.movementSpeed.addEventListener("change", function () {
    setValue("movementSpeed", Number(ui.movementSpeed.value));
  });

  ui.color.addEventListener("change", function () {
    setValue("color", ui.color.value);
  });

  ui.opticalPreset.addEventListener("change", function () {
    setValue("opticalPreset", ui.opticalPreset.value);
  });

  ui.sensorToggle.addEventListener("click", function () {
    if (sensorActive) stopSensors();
    else startSensors();
  });

  ui.sensorCalibrate.addEventListener("click", function () {
    calibrateNeutral();
  });

  ui.freeze.addEventListener("click", function () {
    setValue("frozen", !currentFrozen);
  });

  ui.reset.addEventListener("click", function () {
    send({ type: "reset" });
  });

  connect();
}());
