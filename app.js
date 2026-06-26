(() => {
  "use strict";

  // ---------- chain config ----------
  const CHAINS = [
    { id: "solana", label: "SOLANA", kind: "solana" },
    { id: "1", label: "ETHEREUM", kind: "evm" },
    { id: "56", label: "BNB CHAIN", kind: "evm" },
    { id: "8453", label: "BASE", kind: "evm" },
    { id: "42161", label: "ARBITRUM", kind: "evm" },
    { id: "137", label: "POLYGON", kind: "evm" },
  ];

  const EXAMPLES = [
    { symbol: "BONK", chainId: "solana", address: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263" },
    { symbol: "PEPE", chainId: "1", address: "0x6982508145454Ce325dDbE47a25d4ec3d2311933" },
    { symbol: "USDT", chainId: "1", address: "0xdAC17F958D2ee523a2206206994597C13D831ec" },
  ];

  const STEPS = [
    "reading contract bytecode",
    "probing liquidity pool",
    "mapping holder wallets",
    "simulating test-sell",
    "tallying threat score",
  ];

  // ---------- state ----------
  const state = { chainId: "solana", checking: false };

  // ---------- dom ----------
  const tabsEl = document.getElementById("chainTabs");
  const examplesEl = document.getElementById("examples");
  const addressInput = document.getElementById("addressInput");
  const scanBtn = document.getElementById("scanBtn");
  const errorBox = document.getElementById("errorBox");
  const checkingBox = document.getElementById("checkingBox");
  const checkStepEl = document.getElementById("checkStep");
  const resultBox = document.getElementById("resultBox");

  function renderTabs() {
    tabsEl.innerHTML = "";
    CHAINS.forEach((c) => {
      const btn = document.createElement("button");
      btn.className = "tab-btn" + (c.id === state.chainId ? " active" : "");
      btn.textContent = c.label;
      btn.onClick = null;
      btn.addEventListener("click", () => {
        state.chainId = c.id;
        renderTabs();
      });
      tabsEl.appendChild(btn);
    });
  }

  function renderExamples() {
    examplesEl.innerHTML = "";
    EXAMPLES.forEach((ex) => {
      const btn = document.createElement("button");
      btn.className = "example-btn";
      btn.textContent = "$" + ex.symbol;
      btn.addEventListener("click", () => {
        state.chainId = ex.chainId;
        renderTabs();
        addressInput.value = ex.address;
        runCheck();
      });
      examplesEl.appendChild(btn);
    });
  }

  renderTabs();
  renderExamples();

  scanBtn.addEventListener("click", runCheck);
  addressInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") runCheck();
  });

  // ---------- address validation ----------
  function isValidAddress(addr, kind) {
    if (kind === "evm") return /^0x[a-fA-F0-9]{40}$/.test(addr);
    // Solana base58 mint addresses are typically 32-44 chars
    return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(addr);
  }

  function shortAddr(addr) {
    return addr.length > 14 ? addr.slice(0, 6) + "…" + addr.slice(-4) : addr;
  }

  // ---------- GoPlus API ----------
  async function fetchTokenSecurity(chainId, address, kind) {
    const url =
      kind === "solana"
        ? `https://api.gopluslabs.io/api/v1/solana/token_security?contract_addresses=${encodeURIComponent(address)}`
        : `https://api.gopluslabs.io/api/v1/token_security/${chainId}?contract_addresses=${encodeURIComponent(address)}`;

    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(`GoPlus API error (HTTP ${res.status})`);
    const json = await res.json();
    if (json.code !== 1) throw new Error(json.message || "GoPlus API returned an error");

    const result = json.result;
    if (!result) return null;

    // Result is keyed by the lowercase address (EVM) or the raw address (Solana).
    const key = Object.keys(result).find(
      (k) => k.toLowerCase() === address.toLowerCase()
    ) ?? Object.keys(result)[0];

    const data = key ? result[key] : null;
    if (!data || Object.keys(data).length === 0) return null;
    return data;
  }

  // ---------- field mapping ----------
  function pctStr(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n * 100 : null;
  }

  function sumHolderPercent(holders, limit) {
    if (!Array.isArray(holders)) return null;
    const real = holders.filter((h) => {
      const tag = (h.tag || "").toLowerCase();
      return !h.is_contract || tag.includes("lp") ? true : true; // keep all; GoPlus already excludes burn/LP in most cases
    });
    return real
      .slice(0, limit)
      .reduce((sum, h) => sum + (Number(h.percent) || 0), 0) * 100;
  }

  function sumLockedLpPercent(lpHolders) {
    if (!Array.isArray(lpHolders) || lpHolders.length === 0) return null;
    let total = 0,
      locked = 0;
    lpHolders.forEach((h) => {
      const pct = Number(h.percent) || 0;
      total += pct;
      if (String(h.is_locked) === "1" || h.is_locked === true) locked += pct;
    });
    if (total === 0) return null;
    return (locked / total) * 100;
  }

  function mapEvm(d) {
    const lpLockedPct = sumLockedLpPercent(d.lp_holders);
    let liquidityUsd = null;
    if (Array.isArray(d.dex) && d.dex.length) {
      liquidityUsd = d.dex.reduce((s, x) => s + (Number(x.liquidity) || 0), 0);
    }
    const ownerAddr = (d.owner_address || "").toLowerCase();
    const ownerRenounced =
      ownerAddr === "" ||
      /^0x0{40}$/.test(ownerAddr) ||
      /^0x0*dead$/.test(ownerAddr);

    return {
      name: d.token_name || null,
      symbol: d.token_symbol || null,
      totalSupply: d.total_supply || null,
      holderCount: d.holder_count != null ? Number(d.holder_count) : null,
      isOpenSource: d.is_open_source === "1",
      mintActive: d.is_mintable === "1",
      ownerRenounced,
      hiddenOwner: d.hidden_owner === "1",
      canTakeBackOwnership: d.can_take_back_ownership === "1",
      freezeActive: false, // not applicable on EVM
      isHoneypot: d.is_honeypot === "1",
      cannotSellAll: d.cannot_sell_all === "1",
      buyTaxPct: pctStr(d.buy_tax),
      sellTaxPct: pctStr(d.sell_tax),
      top10Pct: sumHolderPercent(d.holders, 10),
      devPct: d.owner_percent != null ? Number(d.owner_percent) * 100 : null,
      liquidityUsd,
      lpLockedPct,
    };
  }

  function mapSolana(d) {
    const lpLockedPct = sumLockedLpPercent(d.lp_holders);
    let liquidityUsd = null;
    if (Array.isArray(d.dex) && d.dex.length) {
      liquidityUsd = d.dex.reduce((s, x) => s + (Number(x.liquidity) || 0), 0);
    }
    const mintable = d.mintable || {};
    const freezable = d.freezable || {};
    const creators = Array.isArray(d.creators) ? d.creators : [];
    let devPct = null;
    if (Array.isArray(d.holders)) {
      const creatorAddrs = new Set(creators.map((c) => c.address));
      const creatorHolder = d.holders.find((h) => creatorAddrs.has(h.address));
      if (creatorHolder) devPct = (Number(creatorHolder.percent) || 0) * 100;
    }
    const top10Pct =
      d.top10_holder_percent != null
        ? Number(d.top10_holder_percent) * 100
        : sumHolderPercent(d.holders, 10);

    return {
      name: d.token_name || d.metadata?.name || null,
      symbol: d.token_symbol || d.metadata?.symbol || null,
      totalSupply: d.total_supply || null,
      holderCount: d.holder_count != null ? Number(d.holder_count) : null,
      isOpenSource: null, // not applicable on Solana
      mintActive: String(mintable.status) === "1",
      ownerRenounced: null, // Solana tokens have no EVM-style "owner"
      hiddenOwner: false,
      canTakeBackOwnership: false,
      freezeActive: String(freezable.status) === "1",
      isHoneypot: false, // GoPlus Solana has no direct honeypot flag
      cannotSellAll: false,
      buyTaxPct: null,
      sellTaxPct: null,
      top10Pct,
      devPct,
      liquidityUsd,
      lpLockedPct,
    };
  }

  // ---------- risk scoring ----------
  function computeRisk(t) {
    if (t.isHoneypot || t.cannotSellAll) {
      return { score: 100, forced: true, reasons: ["Honeypot / cannot sell"] };
    }

    let score = 0;
    const reasons = [];
    const add = (pts, label, cond) => {
      if (cond) {
        score += pts;
        reasons.push(label);
      }
    };

    add(40, "Mint authority active / mintable", t.mintActive === true);
    add(
      30,
      "Ownership not renounced / hidden owner / can reclaim ownership",
      t.ownerRenounced === false || t.hiddenOwner || t.canTakeBackOwnership
    );
    add(30, "Freeze authority active", t.freezeActive === true);
    add(
      25,
      "Sell tax > 10%",
      t.sellTaxPct != null && t.sellTaxPct > 10
    );
    add(25, "Top 10 holders > 50%", t.top10Pct != null && t.top10Pct > 50);
    add(20, "LP not locked", t.lpLockedPct != null && t.lpLockedPct < 50);
    add(20, "Not open source", t.isOpenSource === false);
    add(15, "Dev/creator wallet > 10%", t.devPct != null && t.devPct > 10);
    add(
      15,
      "Liquidity < $10k",
      t.liquidityUsd != null && t.liquidityUsd < 10000
    );
    add(
      10,
      "Buy or sell tax 5–10%",
      (t.buyTaxPct != null && t.buyTaxPct >= 5 && t.buyTaxPct <= 10) ||
        (t.sellTaxPct != null && t.sellTaxPct >= 5 && t.sellTaxPct <= 10)
    );
    add(
      10,
      "Top 10 holders 30–50%",
      t.top10Pct != null && t.top10Pct >= 30 && t.top10Pct <= 50
    );
    add(
      10,
      "Holder count < 100",
      t.holderCount != null && t.holderCount < 100
    );

    return { score: Math.min(100, score), forced: false, reasons };
  }

  function band(score) {
    if (score <= 20) return "safe";
    if (score <= 60) return "warning";
    return "critical";
  }

  const VERDICTS = {
    safe: {
      color: "#35F58E",
      glow: "rgba(53,245,142,.55)",
      border: "#1F7A4D",
      bg: "rgba(8,20,13,.95)",
      threat: "THREAT LEVEL: LOW",
      verdict: "PASS",
      sub: "Core checks pass. No major rug vectors detected — but stay sharp and DYOR.",
    },
    warning: {
      color: "#FFC24D",
      glow: "rgba(255,194,77,.5)",
      border: "#6B5417",
      bg: "rgba(22,17,5,.95)",
      threat: "THREAT LEVEL: ELEVATED",
      verdict: "WARNING",
      sub: "Anomalies detected. One or more signals look risky — proceed with extreme caution.",
    },
    critical: {
      color: "#FF5470",
      glow: "rgba(255,84,112,.55)",
      border: "#6B1F2C",
      bg: "rgba(24,8,11,.95)",
      threat: "THREAT LEVEL: CRITICAL",
      verdict: "CRITICAL",
      sub: "Multiple rug vectors active. This contract shows classic rug-pull behaviour. Do not buy.",
    },
  };

  // ---------- formatting ----------
  function fmtNum(n) {
    if (n == null || !Number.isFinite(Number(n))) return "—";
    return Number(n).toLocaleString("en-US");
  }
  function fmtUsd(n) {
    if (n == null || !Number.isFinite(n)) return "—";
    if (n >= 1e6) return "$" + (n / 1e6).toFixed(1) + "M";
    if (n >= 1e3) return "$" + Math.round(n / 1e3) + "K";
    return "$" + Math.round(n);
  }
  function fmtPct(n) {
    if (n == null || !Number.isFinite(n)) return "—";
    return n.toFixed(1) + "%";
  }
  function pctColor(v, a, b) {
    if (v == null) return "#8FB6A1";
    return v <= a ? "#35F58E" : v <= b ? "#FFC24D" : "#FF5470";
  }
  function usdColor(v) {
    if (v == null) return "#8FB6A1";
    return v >= 500000 ? "#35F58E" : v >= 50000 ? "#FFC24D" : "#FF5470";
  }

  // ---------- rendering result ----------
  function renderResult(t, meta) {
    const risk = computeRisk(t);
    const b = band(risk.score);
    const V = VERDICTS[b];
    const ringDeg = Math.round((risk.score / 100) * 360);

    const badge = (ok, unknown) => {
      if (unknown)
        return { icon: "?", color: "#5C8C72", bg: "rgba(92,140,114,.12)" };
      return ok
        ? { icon: "✓", color: "#35F58E", bg: "rgba(53,245,142,.12)" }
        : { icon: "✕", color: "#FF5470", bg: "rgba(255,84,112,.14)" };
    };

    const infoRows = [
      {
        label: "Name / Symbol",
        value: `${t.name || "Unknown"}  ${t.symbol ? "$" + t.symbol : ""}`,
        color: "#CFE9DA",
      },
      { label: "Total Supply", value: fmtNum(t.totalSupply), color: "#CFE9DA" },
      { label: "Holder Count", value: fmtNum(t.holderCount), color: "#CFE9DA" },
    ];

    const secRows = [
      { label: "Mint Authority Renounced", ...badge(t.mintActive === false, t.mintActive == null) },
      meta.kind === "evm"
        ? { label: "Ownership Renounced", ...badge(t.ownerRenounced === true, t.ownerRenounced == null) }
        : { label: "Freeze Authority Renounced", ...badge(t.freezeActive === false, t.freezeActive == null) },
      { label: "Liquidity Locked", ...badge(t.lpLockedPct != null && t.lpLockedPct >= 50, t.lpLockedPct == null) },
      { label: "Not a Honeypot (can sell)", ...badge(!t.isHoneypot && !t.cannotSellAll, meta.kind === "solana") },
    ];

    const distRows = [
      { label: "Top 10 Holders", value: fmtPct(t.top10Pct), color: pctColor(t.top10Pct, 20, 45) },
      { label: "Dev / Creator Wallet", value: fmtPct(t.devPct), color: pctColor(t.devPct, 5, 15) },
    ];

    const liqRows = [
      { label: "Total Liquidity (USD)", value: fmtUsd(t.liquidityUsd), color: usdColor(t.liquidityUsd) },
    ];

    const html = `
      <div class="threat-banner" style="background:${V.bg};border:1px solid ${V.border};box-shadow:0 0 40px -14px ${V.glow};">
        <div class="score-ring" style="background:conic-gradient(${V.color} ${ringDeg}deg, #122E1F ${ringDeg}deg); box-shadow:0 0 26px -6px ${V.glow};">
          <div class="score-ring-inner">
            <span class="score-num" style="color:${V.color};text-shadow:0 0 16px ${V.glow};">${risk.score}</span>
            <span class="score-sub">RISK / 100</span>
          </div>
        </div>
        <div class="threat-info">
          <div class="threat-level" style="color:${V.color};">${V.threat}</div>
          <div class="threat-verdict" style="text-shadow:0 0 18px ${V.glow};">${V.verdict}</div>
          <div class="threat-sub">${V.sub}</div>
        </div>
      </div>

      <div class="checklist">
        <div class="checklist-head">
          <div class="checklist-addr">${shortAddr(meta.address)} · ${meta.chainLabel}</div>
        </div>

        <div class="section-tag">// Token Info</div>
        ${infoRows
          .map(
            (r) =>
              `<div class="row"><div class="row-label">${r.label}</div><div class="row-value" style="color:${r.color}">${r.value}</div></div>`
          )
          .join("")}

        <div class="section-tag">// Security Checks</div>
        ${secRows
          .map(
            (r) =>
              `<div class="sec-row"><div class="sec-label">${r.label}</div><div class="sec-icon" style="background:${r.bg};color:${r.color};border-color:${r.color}">${r.icon}</div></div>`
          )
          .join("")}

        <div class="section-tag">// Holder Distribution</div>
        ${distRows
          .map(
            (r) =>
              `<div class="row"><div class="row-label">${r.label}</div><div class="row-value" style="color:${r.color}">${r.value}</div></div>`
          )
          .join("")}

        <div class="section-tag">// Liquidity</div>
        ${liqRows
          .map(
            (r) =>
              `<div class="row"><div class="row-label">${r.label}</div><div class="row-value" style="color:${r.color}">${r.value}</div></div>`
          )
          .join("")}

        <div class="checklist-footer">
          <button class="new-scan-btn" id="newScanBtn">&gt; NEW SCAN</button>
          <div class="dyor-note">Signals read on-chain at scan time via the GoPlus Security API. This is not financial advice — always DYOR before aping in.</div>
        </div>
      </div>
    `;

    resultBox.innerHTML = html;
    resultBox.hidden = false;
    document.getElementById("newScanBtn").addEventListener("click", reset);
  }

  function showError(msg) {
    errorBox.textContent = msg;
    errorBox.hidden = false;
  }

  function reset() {
    errorBox.hidden = true;
    checkingBox.hidden = true;
    resultBox.hidden = true;
    resultBox.innerHTML = "";
    addressInput.value = "";
    scanBtn.disabled = false;
    state.checking = false;
  }

  // ---------- run ----------
  let stepTimer = null;

  async function runCheck() {
    if (state.checking) return;
    const address = addressInput.value.trim();
    errorBox.hidden = true;
    resultBox.hidden = true;
    resultBox.innerHTML = "";

    if (!address) {
      showError("Enter a contract address first.");
      return;
    }

    const chain = CHAINS.find((c) => c.id === state.chainId);

    if (!isValidAddress(address, chain.kind)) {
      showError(
        chain.kind === "evm"
          ? "That doesn't look like a valid EVM address (expected 0x + 40 hex characters)."
          : "That doesn't look like a valid Solana token address."
      );
      return;
    }

    state.checking = true;
    scanBtn.disabled = true;
    checkingBox.hidden = false;
    let step = 0;
    checkStepEl.textContent = STEPS[0];
    stepTimer = setInterval(() => {
      step = Math.min(step + 1, STEPS.length - 1);
      checkStepEl.textContent = STEPS[step];
    }, 340);

    try {
      const raw = await fetchTokenSecurity(chain.id, address, chain.kind);
      clearInterval(stepTimer);
      checkingBox.hidden = true;
      scanBtn.disabled = false;
      state.checking = false;

      if (!raw) {
        showError(
          "Token not found, or this chain/contract isn't supported by the security provider. Double-check the address and chain selection."
        );
        return;
      }

      const t = chain.kind === "solana" ? mapSolana(raw) : mapEvm(raw);
      renderResult(t, {
        address,
        chainLabel: chain.label,
        kind: chain.kind,
      });
    } catch (err) {
      clearInterval(stepTimer);
      checkingBox.hidden = true;
      scanBtn.disabled = false;
      state.checking = false;
      showError(
        "Couldn't reach the token security provider right now. " +
          (err && err.message ? err.message : "Please try again in a moment.")
      );
    }
  }

  // ---------- matrix rain ----------
  function startRain() {
    const cv = document.getElementById("rain");
    const ctx = cv.getContext("2d");
    const glyphs = "01<>{}[]#$%&*+=/\\アイウエオカキクABCDEF".split("");
    let cols, drops, fs;
    const resize = () => {
      cv.width = cv.clientWidth;
      cv.height = cv.clientHeight;
      fs = 15;
      cols = Math.ceil(cv.width / fs);
      drops = new Array(cols).fill(0).map(() => Math.random() * -50);
    };
    window.addEventListener("resize", resize);
    resize();
    let last = 0;
    function draw(t) {
      requestAnimationFrame(draw);
      if (t - last < 55) return;
      last = t;
      ctx.fillStyle = "rgba(4,7,5,0.22)";
      ctx.fillRect(0, 0, cv.width, cv.height);
      ctx.font = fs + "px 'Space Mono', monospace";
      for (let i = 0; i < cols; i++) {
        const y = drops[i] * fs;
        ctx.fillStyle = Math.random() > 0.97 ? "#CFFFE6" : "#1FB36A";
        ctx.fillText(glyphs[(Math.random() * glyphs.length) | 0], i * fs, y);
        if (y > cv.height && Math.random() > 0.975) drops[i] = 0;
        drops[i]++;
      }
    }
    requestAnimationFrame(draw);
  }

  startRain();
})();
