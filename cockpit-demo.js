/* Local TradeForge walkthrough using exclusively fictitious market events. */
(() => {
  "use strict";

  const demo = document.querySelector("[data-demo]");
  if (!demo) return;

  const one = name => demo.querySelector("[data-demo-" + name + "]");
  const field = one("scene");
  const chart = one("chart");
  const chartContext = chart.getContext("2d");
  const scene = new window.TradeForgeOrbitalScene(field);
  const play = one("play");
  const motion = one("motion");
  const log = one("log");
  const rocket = one("rocket");
  const planetButtons = [...demo.querySelectorAll("[data-node]")];
  const viewButtons = [...demo.querySelectorAll("[data-demo-view]")];
  const assetButtons = [...demo.querySelectorAll("[data-demo-asset]")];
  const assetList = demo.querySelector(".demo-assets");
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const money = new Intl.NumberFormat("pt-BR", {minimumFractionDigits: 2, maximumFractionDigits: 2});

  const initialEquity = 1000;
  const entryPrice = 66650;
  const markPrice = 66800;
  const exitPrice = 66950;
  const quantity = .003;
  const costs = .24;
  const samplePnl = price => (price - entryPrice) * quantity - costs;
  const trade = {symbol: "BTCUSDT", qty: quantity};
  const initial = {
    equity: initialEquity,
    price: null,
    position: null,
    data: "Aguardando a primeira cotação da demonstração.",
    context: "A estratégia verifica candles fechados de 15 minutos e o contexto de três dias do Bitcoin.",
    risk: "A demonstração começa com 1.000 USDT virtuais e sem posições abertas.",
    execution: "Aguardando uma entrada válida.",
    wallet: "1.000 USDT de patrimônio virtual. Nenhuma posição aberta.",
    BTCUSDT: "Aguardando cotação fictícia. Nenhuma posição aberta.",
    ETHUSDT: "Ethereum em observação. Nenhum sinal nesta sequência.",
    SOLUSDT: "Solana em observação. Aguardando análise.",
    XRPUSDT: "XRP em observação. Nenhum sinal nesta sequência."
  };

  const sequence = [
    {kind: "quote", node: "data", time: "09:00", title: "Cotação recebida",
      detail: "BTC/USDT · 66.650,00 USDT", tone: "info",
      patch: {price: entryPrice, data: "A cotação fictícia de BTC/USDT foi validada em 66.650,00 USDT.",
        BTCUSDT: "Cotação fictícia de 66.650,00 USDT. Nenhuma posição aberta."}},
    {kind: "scan", node: "context", time: "09:15", title: "Entrada avaliada",
      detail: "Rompimento detectado no candle fechado", tone: "info",
      patch: {context: "O candle fechado de 15 minutos indica rompimento. O cenário fictício de BTC confirma a direção comprada."}},
    {kind: "alert", node: "risk", symbol: "SOLUSDT", time: "09:15", title: "Sinal de SOL vetado",
      detail: "O spread excede o limite de execução", tone: "warning",
      patch: {risk: "O spread fictício de SOL/USDT ficou em 0,18%, acima do limite de 0,12%. A entrada foi vetada.",
        SOLUSDT: "Sinal vetado por spread. Nenhuma posição aberta."}},
    {kind: "entry", node: "execution", symbol: "BTCUSDT", time: "09:16", title: "Compra simulada de BTC",
      detail: "0,003 BTC a 66.650,00 USDT", tone: "success",
      patch: {position: trade, execution: "As verificações de cotação, spread e carteira passaram. A demonstração registrou a compra de 0,003 BTC.",
        wallet: "1 posição simulada em BTC. O patrimônio é acompanhado em USDT.",
        BTCUSDT: "Compra simulada de 0,003 BTC a 66.650,00 USDT."}},
    {kind: "quote", node: "data", time: "09:30", title: "Patrimônio atualizado",
      detail: "Posição marcada pela cotação fictícia", tone: "info",
      patch: {price: markPrice, equity: initialEquity + samplePnl(markPrice),
        data: "A cotação fictícia subiu para 66.800,00 USDT. A posição foi marcada pelo novo preço.",
        BTCUSDT: "Posição simulada aberta. Cotação fictícia atual de 66.800,00 USDT."}},
    {kind: "exit", node: "wallet", symbol: "BTCUSDT", time: "09:45", title: "Operação encerrada",
      detail: "+" + money.format(samplePnl(exitPrice)) + " USDT líquidos após custos", tone: "success",
      patch: {price: exitPrice, equity: initialEquity + samplePnl(exitPrice), position: null,
        wallet: "A operação fictícia encerrou com +" + money.format(samplePnl(exitPrice)) + " USDT líquidos e 0,24 USDT de custos estimados.",
        BTCUSDT: "Compra simulada encerrada a 66.950,00 USDT. Nenhuma posição aberta."}}
  ];

  const nodeNames = {data: "Dados", context: "Contexto", risk: "Risco", execution: "Execução", wallet: "Carteira"};
  const assetNames = {BTCUSDT: "BTC / USDT", ETHUSDT: "ETH / USDT", SOLUSDT: "SOL / USDT", XRPUSDT: "XRP / USDT"};
  const phaseLabels = {
    ready: ["Pronta para iniciar", "Iniciar demonstração"],
    running: ["Em andamento", "Pausar"],
    paused: ["Pausada", "Continuar"],
    complete: ["Concluída", "Repetir demonstração"]
  };

  let phase = "ready";
  let view = "flow";
  let selectedNode = "context";
  let selectedAsset = "BTCUSDT";
  let state = {...initial};
  let values = [initialEquity];
  let cursor = 0;
  let event = null;
  let visible = false;
  let motionOff = false;
  let timer = 0;
  let rocketTimer = 0;

  const motionEnabled = () => !motionOff && !reducedMotion.matches;
  const text = (element, value) => {
    if (element.textContent !== value) element.textContent = value;
  };

  function drawChart() {
    if (!chartContext) return;
    const {width, height} = chart.getBoundingClientRect();
    if (width <= 1 || height <= 1) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const pixelsWide = Math.round(width * ratio);
    const pixelsHigh = Math.round(height * ratio);
    if (chart.width !== pixelsWide) chart.width = pixelsWide;
    if (chart.height !== pixelsHigh) chart.height = pixelsHigh;
    const c = chartContext;
    c.setTransform(ratio, 0, 0, ratio, 0, 0);
    c.clearRect(0, 0, width, height);

    const pad = 5;
    const high = Math.max(initialEquity + .5, ...values) + .12;
    const low = Math.min(initialEquity, ...values) - .18;
    const y = amount => pad + (high - amount) / (high - low) * (height - pad * 2);
    const points = values.map((value, index) => [pad + index / sequence.length * (width - pad * 2), y(value)]);
    if (points.length === 1) points.push([width - pad, points[0][1]]);
    const last = points[points.length - 1];
    const baseline = y(initialEquity);
    c.strokeStyle = "#365169";
    c.setLineDash([3, 4]);
    c.beginPath();
    c.moveTo(pad, baseline);
    c.lineTo(width - pad, baseline);
    c.stroke();
    c.setLineDash([]);

    const fill = c.createLinearGradient(0, pad, 0, height - pad);
    fill.addColorStop(0, "#77f0d654");
    fill.addColorStop(1, "#77f0d600");
    c.fillStyle = fill;
    c.beginPath();
    c.moveTo(points[0][0], height - pad);
    for (const [x, y] of points) c.lineTo(x, y);
    c.lineTo(last[0], height - pad);
    c.closePath();
    c.fill();

    c.strokeStyle = "#77f0d6";
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(...points[0]);
    for (const point of points.slice(1)) c.lineTo(...point);
    c.stroke();
    c.fillStyle = "#77f0d6";
    c.beginPath();
    c.arc(last[0], last[1], 2.7, 0, Math.PI * 2);
    c.fill();
  }

  function stopRocket() {
    clearTimeout(rocketTimer);
    rocket.classList.remove("is-flying");
    rocket.hidden = true;
  }

  function launchRocket() {
    if (!motionEnabled() || !visible || document.hidden) return;
    const origin = field.getBoundingClientRect();
    const target = chart.getBoundingClientRect();
    if (!origin.width || !target.width) return;
    stopRocket();
    rocket.hidden = false;
    const container = (rocket.offsetParent || demo).getBoundingClientRect();
    const x = origin.left + origin.width * .5;
    const y = origin.top + origin.height * .48;
    rocket.style.left = x - container.left + "px";
    rocket.style.top = y - container.top + "px";
    rocket.style.setProperty("--flight-x", target.left + target.width * .83 - x + "px");
    rocket.style.setProperty("--flight-y", target.top + target.height * .36 - y + "px");
    rocket.classList.add("is-flying");
    rocketTimer = window.setTimeout(stopRocket, 2000);
  }

  function render() {
    demo.dataset.phase = phase;
    text(one("status"), phaseLabels[phase][0]);
    text(play, phaseLabels[phase][1]);
    text(one("equity"), money.format(state.equity));
    text(one("btc"), state.price === null ? "—" : money.format(state.price));
    text(one("positions"), state.position ? "1" : "0");
    const reduced = !motionEnabled();
    motion.setAttribute("aria-pressed", String(reduced));
    const mode = reduced ? "reduced" : "full";
    if (document.documentElement.dataset.motion !== mode) {
      document.documentElement.dataset.motion = mode;
      document.dispatchEvent(new CustomEvent("tradeforge:motionchange", {detail: {reduced}}));
    }
    motion.disabled = reducedMotion.matches;
    for (const button of viewButtons) button.setAttribute("aria-pressed", String(button.dataset.demoView === view));
    for (const button of planetButtons) {
      button.hidden = view !== "flow";
      button.setAttribute("aria-pressed", String(button.dataset.node === selectedNode));
    }
    assetList.hidden = view !== "radar";
    for (const button of assetButtons) {
      const symbol = button.dataset.demoAsset;
      button.setAttribute("aria-pressed", String(symbol === selectedAsset));
      button.dataset.state = state.position?.symbol === symbol ? "open" : "waiting";
    }

    const key = view === "flow" ? selectedNode : selectedAsset;
    text(one("inspector-title"), nodeNames[key] || assetNames[key]);
    text(one("inspector-detail"), state[key]);
    chart.setAttribute("aria-label", "Gráfico do patrimônio fictício, " + money.format(state.equity) + " USDT.");
    scene.select(selectedNode);
    scene.update({view, running: phase === "running", paused: phase === "paused",
      motion: motionEnabled() && phase !== "paused", activeNode: event?.node || null,
      radarAssets: Object.keys(assetNames), selectedAsset, effects: event ? [event] : [],
      positions: state.position ? [state.position] : []});
    drawChart();
  }

  function addLog(step) {
    const item = document.createElement("li");
    item.dataset.tone = step.tone;
    const time = document.createElement("time");
    time.dateTime = step.time;
    time.textContent = step.time;
    const title = document.createElement("strong");
    title.textContent = step.title;
    const detail = document.createElement("small");
    detail.textContent = step.detail;
    item.append(time, title, detail);
    log.prepend(item);
  }

  function schedule() {
    clearTimeout(timer);
    if (phase === "running" && visible && !document.hidden) timer = window.setTimeout(advance, 1550);
  }

  function advance() {
    if (phase !== "running" || !visible || document.hidden) return;
    const step = sequence[cursor++];
    Object.assign(state, step.patch);
    values.push(state.equity);
    event = {kind: step.kind, node: step.node, symbol: step.symbol, at: performance.now()};
    if (cursor === 1) log.replaceChildren();
    addLog(step);
    if (cursor === sequence.length) phase = "complete";
    render();
    if (step.kind === "exit" && samplePnl(exitPrice) > 0) launchRocket();
    schedule();
  }

  function reset() {
    clearTimeout(timer);
    stopRocket();
    phase = "ready";
    view = "flow";
    selectedNode = "context";
    selectedAsset = "BTCUSDT";
    state = {...initial};
    values = [initialEquity];
    cursor = 0;
    event = null;
    const placeholder = document.createElement("li");
    placeholder.textContent = "Inicie a demonstração para ver os eventos.";
    log.replaceChildren(placeholder);
    render();
  }

  function start() {
    if (phase === "running") return;
    if (phase === "complete") reset();
    phase = "running";
    if (cursor === 0 && visible && !document.hidden) advance();
    else {
      render();
      schedule();
    }
  }

  play.addEventListener("click", () => {
    if (phase !== "running") return start();
    phase = "paused";
    stopRocket();
    schedule();
    render();
  });
  one("reset").addEventListener("click", reset);
  motion.addEventListener("click", () => {
    motionOff = !motionOff;
    if (!motionEnabled()) stopRocket();
    render();
  });
  reducedMotion.addEventListener("change", () => {
    if (!motionEnabled()) stopRocket();
    render();
  });
  rocket.addEventListener("animationend", stopRocket);
  for (const button of viewButtons) button.addEventListener("click", () => {
    view = button.dataset.demoView;
    render();
  });
  for (const button of planetButtons) button.addEventListener("click", () => {
    selectedNode = button.dataset.node;
    render();
  });
  for (const button of assetButtons) button.addEventListener("click", () => {
    selectedAsset = button.dataset.demoAsset;
    render();
  });
  for (const trigger of document.querySelectorAll("[data-demo-launch]")) trigger.addEventListener("click", start);

  const observer = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (!visible) stopRocket();
    schedule();
  });
  observer.observe(demo);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stopRocket();
    schedule();
  });
  const resize = new ResizeObserver(drawChart);
  resize.observe(chart);
  reset();
})();
