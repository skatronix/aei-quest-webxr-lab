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
    freeze: document.getElementById("freeze"),
    reset: document.getElementById("reset"),
    debug: document.getElementById("debug")
  };

  var currentFrozen = false;

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

  ui.freeze.addEventListener("click", function () {
    setValue("frozen", !currentFrozen);
  });

  ui.reset.addEventListener("click", function () {
    send({ type: "reset" });
  });

  connect();
}());
