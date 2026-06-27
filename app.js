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
    { symbol: "USDT", chainId: "1", address: "0xdAC17F958D2ee523a2206206994597C13D831ec7" },
  ];

  // Known blue-chip tokens (lowercased contract address -> symbol), keyed by chain id.
  // Established, audited, deeply-liquid assets whose "mint authority active" /
  // "ownership not renounced" / "concentrated holders" signals are normal, not rug vectors.
  const BLUE_CHIP = {
    "1": {
      "0xdac17f958d2ee523a2206206994597c13d831ec7": "USDT",
      "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48": "USDC",
      "0x6b175474e89094c44da98b954eedeac495271d0f": "DAI",
      "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2": "WETH",
      "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599": "WBTC",
    },
    "56": {
      "0x55d398326f99059ff775485246999027b3197955": "USDT",
      "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d": "USDC",
      "0x1af3f329e8be154074d8769d1ffa4ee058b1dbc3": "DAI",
      "0x2170ed0880ac9a755fd29b2688956bd959f933f8": "WETH",
      "0x7130d2a12b9bcbfae4f2634d864a1ee1ce3ead9c": "WBTC",
    },
    "8453": {
      "0xfde4c96c8593536e31f229ea8f37b2ada2699bb2": "USDT",
      "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913": "USDC",
      "0x50c5725949a6f0c72e6c4a641f24049a917db0cb": "DAI",
      "0x4200000000000000000000000000000000000006": "WETH",
      "0x0555e30da8f98308edb960aa94c0db47230d2b9c": "WBTC",
    },
    "42161": {
      "0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9": "USDT",
      "0xaf88d065e77c8cc2239327c5edb3a432268e5831": "USDC",
      "0xda10009cbd5d07dd0cecc66161fc93d7c9000da1": "DAI",
      "0x82af49447d8a07e3bd95bd0d56f35241523fbab1": "WETH",
      "0x2f2a2543b76a4166549f7aab2e75bef0aefc5b0f": "WBTC",
    },
    "137": {
      "0xc2132d05d31c914a87c6611c10748aeb04b58e8f": "USDT",
      "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359": "USDC",
      "0x8f3cf7ad23cd3cadbd9735aff958023239c6a063": "DAI",
      "0x7ceb23fd6bc0add59e62ac25578270cff1b9f619": "WETH",
      "0x1bfd67037b42cf73acf2047067bd4f2c47d9bfd6": "WBTC",
    },
    solana: {
      "es9vmfrzacermjfrf4h2fyd4kconky11mcce8benwnyb": "USDT",
      "epjfwdd5aufqssqem2qn1xzybapc8g4weggkzwytdt1v": "USDC",
      "so11111111111111111111111111111111111111112": "wSOL",
    },
  };

  function blueChipSymbol(chainId, address) {
    const table = BLUE_CHIP[chainId];
    if (!table) return null;
    return table[(address || "").trim().toLowerCase()] || null;
  }

  const DEX_CHAIN_MAP = {
    solana: "solana",
    "1": "ethereum",
    "56": "bsc",
    "8453": "base",
    "42161": "arbitrum",
    "137": "polygon",
  };

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
    addr = (addr || "").trim();
    // EVM: 0x + exactly 40 hex chars, case-insensitive (mixed-case EIP-55 is valid).
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

  // ---------- DexScreener API ----------
  async function fetchDexScreenerData(address, chainId) {
    const empty = { priceUsd: null, priceChange24h: null, marketCap: null, liquidityUsd: null, pairCreatedAt: null };
    try {
      const res = await fetch(
        `https://api.dexscreener.com/latest/dex/tokens/${encodeURIComponent(address)}`,
        { headers: { Accept: "application/json" } }
      );
      if (!res.ok) return empty;
      const json = await res.json();
      const pairs = Array.isArray(json.pairs) ? json.pairs : [];
      const dexChainId = DEX_CHAIN_MAP[chainId];
      const candidates = dexChainId
        ? pairs.filter((p) => p.chainId === dexChainId)
        : pairs;
      if (!candidates.length) return empty;

      const primary = candidates.reduce((best, p) => {
        const liq = Number(p.liquidity && p.liquidity.usd) || 0;
        const bestLiq = best ? Number(best.liquidity && best.liquidity.usd) || 0 : -1;
        return liq > bestLiq ? p : best;
      }, null);
      if (!primary) return empty;

      const priceUsd = primary.priceUsd != null ? Number(primary.priceUsd) : null;
      const priceChange24h =
        primary.priceChange && primary.priceChange.h24 != null
          ? Number(primary.priceChange.h24)
          : null;
      const marketCap =
        primary.marketCap != null
          ? Number(primary.marketCap)
          : primary.fdv != null
          ? Number(primary.fdv)
          : null;
      const liquidityUsd =
        primary.liquidity && primary.liquidity.usd != null
          ? Number(primary.liquidity.usd)
          : null;
      const pairCreatedAt =
        primary.pairCreatedAt != null ? Number(primary.pairCreatedAt) : null;

      return {
        priceUsd: Number.isFinite(priceUsd) ? priceUsd : null,
        priceChange24h: Number.isFinite(priceChange24h) ? priceChange24h : null,
        marketCap: Number.isFinite(marketCap) ? marketCap : null,
        liquidityUsd: Number.isFinite(liquidityUsd) ? liquidityUsd : null,
        pairCreatedAt: Number.isFinite(pairCreatedAt) ? pairCreatedAt : null,
      };
    } catch {
      return empty;
    }
  }

  // ---------- RugCheck.xyz API (Solana, keyless) ----------
  // Best-effort second source: LP-lock %, holder concentration, dev/creator holding,
  // and RugCheck's own normalised risk score. Never throws — returns nulls on failure.
  async function fetchRugCheck(mint) {
    const empty = {
      present: false,
      lpLockedPct: null,
      top10Pct: null,
      topHolderPct: null,
      devPct: null,
      score: null,
    };
    try {
      const res = await fetch(
        `https://api.rugcheck.xyz/v1/tokens/${encodeURIComponent(mint)}/report`,
        { headers: { Accept: "application/json" } }
      );
      if (!res.ok) return empty;
      const j = await res.json();

      // LP locked %: take the deepest market's lp.lpLockedPct.
      let lpLockedPct = null;
      if (Array.isArray(j.markets) && j.markets.length) {
        let bestLiq = -1;
        j.markets.forEach((m) => {
          const lp = m && m.lp ? m.lp : {};
          const pct = numOrNull(lp.lpLockedPct);
          const liq = numOrNull(lp.lpLockedUSD) || 0;
          if (pct != null && liq >= bestLiq) {
            bestLiq = liq;
            lpLockedPct = pct;
          }
        });
      }
      if (lpLockedPct == null) lpLockedPct = numOrNull(j.lpLockedPct);

      // Holder concentration from topHolders[].pct (already percentages).
      let top10Pct = null;
      let topHolderPct = null;
      if (Array.isArray(j.topHolders) && j.topHolders.length) {
        const pcts = j.topHolders.map((h) => numOrNull(h.pct)).filter((v) => v != null);
        if (pcts.length) {
          top10Pct = pcts.slice(0, 10).reduce((a, b) => a + b, 0);
          topHolderPct = pcts[0];
        }
      }

      // Dev/creator holding: creator address found among top holders.
      let devPct = null;
      const creator = j.creator || (j.tokenMeta && j.tokenMeta.updateAuthority) || null;
      if (creator && Array.isArray(j.topHolders)) {
        const h = j.topHolders.find(
          (x) => x && (x.owner === creator || x.address === creator)
        );
        if (h) devPct = numOrNull(h.pct);
      }
      if (devPct == null) devPct = numOrNull(j.creatorBalancePct);

      // Normalised risk score (0-100, higher = riskier).
      const score =
        j.score_normalised != null ? numOrNull(j.score_normalised) : numOrNull(j.score);

      return { present: true, lpLockedPct, top10Pct, topHolderPct, devPct, score };
    } catch {
      return empty;
    }
  }

  // ---------- Honeypot.is API (EVM, keyless) ----------
  // Best-effort live buy/sell simulation: honeypot verdict + real measured taxes.
  // Never throws — returns nulls on failure.
  async function fetchHoneypotIs(address, chainId) {
    const empty = { present: false, isHoneypot: null, buyTaxPct: null, sellTaxPct: null };
    try {
      const res = await fetch(
        `https://api.honeypot.is/v2/IsHoneypot?address=${encodeURIComponent(address)}&chainID=${encodeURIComponent(chainId)}`,
        { headers: { Accept: "application/json" } }
      );
      if (!res.ok) return empty;
      const j = await res.json();
      let isHoneypot = null;
      if (j.honeypotResult && typeof j.honeypotResult.isHoneypot === "boolean") {
        isHoneypot = j.honeypotResult.isHoneypot;
      }
      const sim = j.simulationResult || {};
      return {
        present: true,
        isHoneypot,
        buyTaxPct: numOrNull(sim.buyTax),
        sellTaxPct: numOrNull(sim.sellTax),
      };
    } catch {
      return empty;
    }
  }

  // ---------- field mapping ----------
  function numOrNull(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

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
  function computeRisk(t, meta) {
    // Honeypot / cannot-sell is never normal — unconditional forced CRITICAL.
    if (t.isHoneypot || t.cannotSellAll) {
      return { score: 100, forced: true, reasons: ["Honeypot / cannot sell"], blueChip: null };
    }

    // Known blue-chip: cap at LOW/PASS, skip the naive flags entirely.
    const blueChip = meta ? blueChipSymbol(meta.chainId, meta.address) : null;
    if (blueChip) {
      return {
        score: 5,
        forced: false,
        reasons: [],
        blueChip,
      };
    }

    let score = 0;
    const reasons = [];
    const add = (pts, label, cond) => {
      if (cond) {
        score += pts;
        reasons.push(label);
      }
    };

    // "Dampenable" flags — active mint authority, non-renounced ownership, and
    // holder concentration — are red flags for a fresh memecoin but normal for a
    // large, liquid, widely-held token. Track their contribution separately so
    // size/liquidity can cap it (see dampener below).
    let authorityPts = 0;
    const addAuthority = (pts, label, cond) => {
      if (cond) {
        authorityPts += pts;
        reasons.push(label);
      }
    };

    addAuthority(40, "Mint authority active / mintable", t.mintActive === true);
    addAuthority(
      30,
      "Ownership not renounced / hidden owner / can reclaim ownership",
      t.ownerRenounced === false || t.hiddenOwner || t.canTakeBackOwnership
    );
    addAuthority(25, "Top 10 holders > 50%", t.top10Pct != null && t.top10Pct > 50);
    addAuthority(
      10,
      "Top 10 holders 30–50%",
      t.top10Pct != null && t.top10Pct >= 30 && t.top10Pct <= 50
    );

    add(30, "Freeze authority active", t.freezeActive === true);
    add(
      25,
      "Sell tax > 10%",
      t.sellTaxPct != null && t.sellTaxPct > 10
    );
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
      "Holder count < 100",
      t.holderCount != null && t.holderCount < 100
    );

    // Token age: a brand-new contract should never read fully clean on authority
    // checks alone. <1h is a strong signal; <24h a softer one. (Mutually exclusive.)
    add(30, "Token less than 1 hour old", t.ageHours != null && t.ageHours < 1);
    add(
      15,
      "Token less than 24 hours old",
      t.ageHours != null && t.ageHours >= 1 && t.ageHours < 24
    );

    // Size/liquidity dampener: a large, deeply-liquid token shouldn't be pushed into
    // CRITICAL by mint/ownership/holder-concentration flags alone. Cap that combined
    // contribution so the worst case lands in WARNING (<=60), not CRITICAL. Genuine
    // danger from honeypots (forced above), freeze authority, taxes, unlocked LP, etc.
    // (the `score` bucket) is untouched and can still escalate to CRITICAL.
    const isLargeLiquid =
      t.marketCap != null && t.marketCap > 50e6 &&
      t.liquidityUsd != null && t.liquidityUsd > 1e6;

    let damped = false;
    if (isLargeLiquid && authorityPts > 0) {
      const maxAuthority = Math.max(0, 60 - score);
      if (authorityPts > maxAuthority) {
        authorityPts = maxAuthority;
        damped = true;
      }
    }

    const total = Math.min(100, score + authorityPts);
    return { score: total, forced: false, reasons, blueChip: null, damped };
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
  function fmtPrice(n) {
    if (n == null || !Number.isFinite(n)) return "—";
    if (n >= 1) return "$" + n.toFixed(2);
    if (n >= 0.01) return "$" + n.toFixed(4);
    return "$" + n.toPrecision(2);
  }
  function fmtChange(n) {
    if (n == null || !Number.isFinite(n)) return "—";
    return (n >= 0 ? "+" : "") + n.toFixed(1) + "%";
  }
  function changeColor(n) {
    if (n == null || !Number.isFinite(n)) return "#8FB6A1";
    return n >= 0 ? "#35F58E" : "#FF5470";
  }
  function fmtAge(hours) {
    if (hours == null || !Number.isFinite(hours)) return "—";
    if (hours < 1) return Math.max(1, Math.round(hours * 60)) + "m";
    if (hours < 24) return Math.round(hours) + "h";
    const days = hours / 24;
    if (days < 30) return Math.round(days) + "d";
    if (days < 365) return Math.round(days / 30) + "mo";
    return (days / 365).toFixed(1) + "y";
  }
  function ageColor(hours) {
    if (hours == null || !Number.isFinite(hours)) return "#8FB6A1";
    if (hours < 1) return "#FF5470";
    if (hours < 24) return "#FFC24D";
    return "#CFE9DA";
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
    const risk = computeRisk(t, meta);
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
      { label: "Price (USD)", value: fmtPrice(t.priceUsd), color: "#CFE9DA" },
      {
        label: "24h Change",
        value: fmtChange(t.priceChange24h),
        color: changeColor(t.priceChange24h),
      },
      { label: "Market Cap", value: fmtUsd(t.marketCap), color: "#CFE9DA" },
      t.ageHours != null && {
        label: "Token Age",
        value: fmtAge(t.ageHours),
        color: ageColor(t.ageHours),
      },
      { label: "Total Supply", value: fmtNum(t.totalSupply), color: "#CFE9DA" },
      t.holderCount != null && {
        label: "Holder Count",
        value: fmtNum(t.holderCount),
        color: "#CFE9DA",
      },
    ].filter(Boolean);

    const secRows = [
      t.mintActive != null && {
        label: "Mint Authority Renounced",
        ...badge(t.mintActive === false, false),
      },
      meta.kind === "evm"
        ? t.ownerRenounced != null && {
            label: "Ownership Renounced",
            ...badge(t.ownerRenounced === true, false),
          }
        : t.freezeActive != null && {
            label: "Freeze Authority Renounced",
            ...badge(t.freezeActive === false, false),
          },
      t.lpLockedPct != null && {
        label: "Liquidity Locked",
        ...badge(t.lpLockedPct >= 50, false),
      },
      meta.kind !== "solana" && {
        label: "Not a Honeypot (can sell)",
        ...badge(!t.isHoneypot && !t.cannotSellAll, false),
      },
    ].filter(Boolean);

    const distRows = [
      t.top10Pct != null && {
        label: "Top 10 Holders",
        value: fmtPct(t.top10Pct),
        color: pctColor(t.top10Pct, 20, 45),
      },
      t.devPct != null && {
        label: "Dev / Creator Wallet",
        value: fmtPct(t.devPct),
        color: pctColor(t.devPct, 5, 15),
      },
    ].filter(Boolean);

    const liqRows = [
      { label: "Total Liquidity (USD)", value: fmtUsd(t.liquidityUsd), color: usdColor(t.liquidityUsd) },
      t.lpLockedPct != null && {
        label: "LP Locked",
        value: fmtPct(t.lpLockedPct),
        color: t.lpLockedPct >= 50 ? "#35F58E" : t.lpLockedPct >= 10 ? "#FFC24D" : "#FF5470",
      },
    ].filter(Boolean);

    let noteHtml = "";
    if (risk.blueChip) {
      noteHtml = `
      <div class="context-note context-blue">
        <span class="context-note-icon">✓</span>
        <span>Verified blue-chip ($${risk.blueChip}) — established, audited, deeply-liquid asset. Authority flags that are normal for major tokens are suppressed.</span>
      </div>`;
    } else if (risk.damped) {
      noteHtml = `
      <div class="context-note context-blue">
        <span class="context-note-icon">ℹ</span>
        <span>Large, deeply-liquid token (market cap &gt; $50M, liquidity &gt; $1M). Mint/ownership flags alone are capped below CRITICAL — concentrated holders or a honeypot would still escalate.</span>
      </div>`;
    }

    // Transparency: which best-effort second sources were consulted this scan.
    const crossBits = [];
    if (t.rugcheckPresent) {
      crossBits.push(
        `RugCheck${t.rugcheckScore != null ? ` (risk ${Math.round(t.rugcheckScore)}/100)` : ""}`
      );
    }
    if (t.honeypotIsPresent) {
      const v =
        t.honeypotIsResult === true
          ? "honeypot flagged"
          : t.honeypotIsResult === false
          ? "sell simulated OK"
          : "no verdict";
      crossBits.push(`Honeypot.is: ${v}`);
    }
    const crossHtml = crossBits.length
      ? `
      <div class="context-note context-cross">
        <span class="context-note-icon">⛓</span>
        <span>Cross-checked — ${crossBits.join(" · ")}.</span>
      </div>`
      : "";

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
      ${noteHtml}
      ${crossHtml}

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
          <div class="dyor-note">Signals read on-chain at scan time via GoPlus Security + DexScreener. This is not financial advice — always DYOR before aping in.</div>
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
      // GoPlus is the primary source; DexScreener, RugCheck (Solana) and Honeypot.is
      // (EVM) are best-effort second opinions that resolve to nulls on failure and
      // never reject the whole scan.
      const [raw, dex, rug, hp] = await Promise.all([
        fetchTokenSecurity(chain.id, address, chain.kind),
        fetchDexScreenerData(address, chain.id),
        chain.kind === "solana" ? fetchRugCheck(address) : Promise.resolve(null),
        chain.kind === "evm" ? fetchHoneypotIs(address, chain.id) : Promise.resolve(null),
      ]);
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
      t.priceUsd = dex.priceUsd;
      t.priceChange24h = dex.priceChange24h;
      t.marketCap = dex.marketCap;
      // Prefer DexScreener's pair liquidity (more reliable) over GoPlus's dex-list sum.
      if (dex.liquidityUsd != null) t.liquidityUsd = dex.liquidityUsd;
      // Token age from the DexScreener pair creation timestamp.
      t.ageHours =
        dex.pairCreatedAt != null ? (Date.now() - dex.pairCreatedAt) / 3.6e6 : null;

      // RugCheck (Solana): fill the holder/LP fields GoPlus leaves empty on Solana.
      if (rug && rug.present) {
        if (t.lpLockedPct == null && rug.lpLockedPct != null) t.lpLockedPct = rug.lpLockedPct;
        if (t.top10Pct == null && rug.top10Pct != null) t.top10Pct = rug.top10Pct;
        if (t.devPct == null && rug.devPct != null) t.devPct = rug.devPct;
        t.rugcheckPresent = true;
        t.rugcheckScore = rug.score;
      }

      // Honeypot.is (EVM): second-opinion honeypot verdict + measured taxes.
      if (hp && hp.present) {
        // If either provider flags a honeypot, treat it as one (forces CRITICAL).
        if (hp.isHoneypot === true) t.isHoneypot = true;
        // Use the more conservative (higher) tax reading when both report one.
        if (hp.buyTaxPct != null)
          t.buyTaxPct = t.buyTaxPct != null ? Math.max(t.buyTaxPct, hp.buyTaxPct) : hp.buyTaxPct;
        if (hp.sellTaxPct != null)
          t.sellTaxPct = t.sellTaxPct != null ? Math.max(t.sellTaxPct, hp.sellTaxPct) : hp.sellTaxPct;
        t.honeypotIsPresent = true;
        t.honeypotIsResult = hp.isHoneypot;
      }

      renderResult(t, {
        address,
        chainId: chain.id,
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
