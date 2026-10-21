import {loadingFetch} from './lib/loading.mjs';
import React, { useContext, createContext, useEffect, useState } from "react";
import TradePanel from "./TradePanel.jsx";
import {Link} from 'react-router-dom';
import { units, candleGeometry } from "./market-format.mjs";

const short = (value) => `${value.slice(0, 6)}…${value.slice(-4)}`;
const time = (seconds) =>
  new Date(seconds * 1000).toISOString().replace("T", " ").slice(0, 19) +
  " UTC";
const MarketChain = createContext(143);
function Address({ value }) {
  const chain = useContext(MarketChain);
  if (value && chain !== 143)
    return <span title={value}>{short(value)} (local fork)</span>;
  return value ? (
    <a
      href={`https://monadscan.com/address/${value}`}
      target="_blank"
      rel="noreferrer"
      title={value}
    >
      {short(value)} ↗
    </a>
  ) : (
    "Unavailable"
  );
}
async function request(path, signal) {
  const response = await loadingFetch("/api" + path, { signal, cache: "no-store" });
  const data = await response.json();
  if (!response.ok)
    throw new Error(data.error?.message || "Market data is unavailable.");
  return data;
}
function Transaction({ value }) {
  const chain = useContext(MarketChain);
  return chain === 143 ? (
    <a
      href={`https://monadscan.com/tx/${value}`}
      target="_blank"
      rel="noreferrer"
    >
      {short(value)} ↗
    </a>
  ) : (
    <span title={value}>{short(value)} (local fork)</span>
  );
}
function Candles({ candles }) {
  const visible = candles.slice(-120),
    geometry = candleGeometry(visible);
  if (!geometry)
    return (
      <div className="empty">
        No executed trades in this indexed history. No candles are fabricated.
      </div>
    );
  const { values, x, y, width } = geometry;
  return (
    <>
      <div className="chart-scroll">
        <svg
          className="candle-chart"
          viewBox="0 0 880 290"
          role="img"
          aria-label="CHOG execution price candles. Each candle has an OHLC tooltip."
        >
          {[35, 140, 245].map((row) => (
            <line
              key={row}
              x1="25"
              x2="855"
              y1={row}
              y2={row}
              stroke="var(--line)"
            />
          ))}
          {values.map((c) => (
            <g
              key={c.time}
              fill={c.c >= c.o ? "var(--buy)" : "var(--sell)"}
              stroke={c.c >= c.o ? "var(--buy)" : "var(--sell)"}
            >
              <title>
                {time(c.time)}; Open {c.open}; High {c.high}; Low {c.low}; Close{" "}
                {c.close} CHOG per token; {c.tradeCount} trades
              </title>
              <line x1={x(c.time)} x2={x(c.time)} y1={y(c.h)} y2={y(c.l)} />
              <rect
                x={x(c.time) - width / 2}
                y={Math.min(y(c.o), y(c.c))}
                width={width}
                height={Math.max(1, Math.abs(y(c.o) - y(c.c)))}
              />
            </g>
          ))}
          <text x="25" y="280" fontSize="11" fill="var(--muted)">
            {time(values[0].time)}
          </text>
          <text
            x="855"
            y="280"
            textAnchor="end"
            fontSize="11"
            fill="var(--muted)"
          >
            {time(values.at(-1).time)}
          </text>
        </svg>
      </div>
      <p className="note">
        Latest {visible.length} populated candles. Time gaps are preserved;
        empty intervals are not filled. Hover a candle for exact OHLC values.
      </p>
    </>
  );
}
export default function MarketView({
  onOpenStudio,
  wallet,
  selectedToken,
  onSelectToken,
}) {
  const [directory, setDirectory] = useState(null),
    [directoryError, setDirectoryError] = useState("");
  const [input, setInput] = useState(""),
    [token, setToken] = useState(""),
    [interval, setIntervalValue] = useState(60);
  const [data, setData] = useState(null),
    [error, setError] = useState(""),
    [status, setStatus] = useState("idle");
  const [refresh, setRefresh] = useState(0),
    [reset, setReset] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    let timer;
    setDirectory(null);
    setDirectoryError("");
    const poll=()=>request("/tokens", controller.signal)
      .then((next) => {
        if (!controller.signal.aborted) setDirectory(next);
      })
      .catch((e) => {
        if (!controller.signal.aborted){setDirectory(null);setDirectoryError(e.message);}
      }).finally(()=>{if(!controller.signal.aborted)timer=setTimeout(poll,10000);});
    poll();
    return () => {controller.abort();clearTimeout(timer);};
  }, [refresh]);
  useEffect(()=>{
    if(!selectedToken&&!token&&directory?.tokens.length){setInput(directory.tokens[0]);setToken(directory.tokens[0]);onSelectToken?.(directory.tokens[0]);}
  },[directory,selectedToken,token,onSelectToken]);
  useEffect(() => {
    setData(null);
    setError("");
    setReset(false);
    if (!token) {
      setStatus("idle");
      return;
    }
    const controller = new AbortController();
    let stream,
      active = true;
    const fail = (message) => {
      if (active) {
        setData(null);
        setError(message);
        setStatus("unavailable");
      }
    };
    const replace = (event, reorganized = false) => {
      if (!active) return;
      try {
        const next = JSON.parse(event.data);
        if (
          next.token.address.toLowerCase() !== token.toLowerCase() ||
          next.intervalSeconds !== interval
        )
          throw new Error();
        setData(next);
        setError("");
        setStatus("connected");
        setReset(reorganized);
      } catch {
        fail(
          "The market stream returned an invalid snapshot. Refresh to reconnect.",
        );
        stream?.close();
      }
    };
    setStatus("loading");
    request(`/tokens/${token}/history?interval=${interval}`, controller.signal)
      .then((initial) => {
        if (!active) return;
        setData(initial);
        setStatus("connecting");
        stream = new EventSource(
          `/api/tokens/${token}/stream?interval=${interval}`,
        );
        stream.addEventListener("snapshot", replace);
        stream.addEventListener("reset", (event) => replace(event, true));
        stream.addEventListener("unavailable", (event) => {
          let message = "Canonical market data is unavailable.";
          try {
            message = JSON.parse(event.data).error?.message || message;
          } catch {}
          fail(message);
          stream.close();
        });
        stream.onerror = () => {
          if (active) {
            setData(null);
            setStatus("reconnecting");
            setError(
              "Stream disconnected. Waiting for a fresh canonical snapshot.",
            );
          }
        };
      })
      .catch((e) => {
        if (!controller.signal.aborted) fail(e.message);
      });
    return () => {
      active = false;
      controller.abort();
      stream?.close();
    };
  }, [token, interval, refresh]);
  useEffect(() => {
    if (selectedToken) {
      setInput(selectedToken.address);
      setToken(
        /^0x[0-9a-fA-F]{40}$/.test(selectedToken.address)
          ? selectedToken.address
          : "",
      );
      if (!/^0x[0-9a-fA-F]{40}$/.test(selectedToken.address))
        setError("Invalid token address in this link.");
    } else {
      setInput("");
      setToken("");
    }
  }, [selectedToken]);
  function choose(value) {
    setInput(value);
    setToken(value);
    onSelectToken?.(value);
  }
  function lookup(event) {
    event.preventDefault();
    const value = input.trim();
    if (!/^0x[0-9a-fA-F]{40}$/.test(value)) {
      setError("Enter a complete EVM token address.");
      return;
    }
    if (token === value) setRefresh((n) => n + 1);
    else choose(value);
  }
  return (
    <section id="markets" className="market-section">
      <div className="section-heading">
        <div>
          <span className="eyebrow">MARKETS / TRADE IN CHOG</span>
          <h2>Trade Foundry tokens.</h2>
        </div>
        <button
          className="text-button"
          onClick={() => setRefresh((n) => n + 1)}
        >
          Refresh markets ↻
        </button>
      </div>
      <p className="note">
        Discover tokens launched on Chog Foundry. Select a token for its chart,
        live trades, holders and buy/sell panel. Prices are in CHOG.
      </p>
      {directoryError ? (
        <div className="message" role="status">
          Token directory unavailable: {directoryError}
        </div>
      ) : !directory ? (
        <p className="note">Reading the token directory…</p>
      ) : directory.tokens.length ? (
        <div className="nft-picker">
          {directory.tokens.map((value) => (
            <button key={value} onClick={() => choose(value)} title={value}>
              {directory.assets?.find(a=>a.token.address.toLowerCase()===value.toLowerCase())?.token.symbol||short(value)}
            </button>
          ))}
        </div>
      ) : (
        <div className="empty market-empty">
          <h3>{directory.index.caughtUp?'The first launch starts here.':'Loading launch history…'}</h3>
          <p>{directory.index.caughtUp?'No tokens have been launched on this Foundry deployment yet. Charts and trade history appear after a real token launch and its first trade.':'The market index is catching up. Tokens will appear as their launches are verified.'}</p>
          <div className="profile-actions"><Link className="primary" to="/app/launch">Launch a token ↗</Link><Link className="secondary" to="/app/studios">Your studios ↗</Link></div>
        </div>
      )}
      <details className="market-advanced"><summary>Open a market by contract address</summary>
      <form className="lookup market-lookup" onSubmit={lookup}>
        <label htmlFor="market-token">Foundry token address</label>
        <div>
          <input
            id="market-token"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="0x…"
            required
            spellCheck="false"
          />
          <button className="primary" type="submit">
            Open market ↗
          </button>
        </div>
      </form>
      </details>
      {token&&<div className="market-controls">
        <label>
          Candle interval{" "}
          <select
            value={interval}
            onChange={(e) => setIntervalValue(Number(e.target.value))}
          >
            <option value={60}>1 minute</option>
            <option value={300}>5 minutes</option>
            <option value={900}>15 minutes</option>
            <option value={3600}>1 hour</option>
          </select>
        </label>
        <span role="status">
          {status === "connected"
            ? data?.provenance.finality === "finalized"
              ? "● Finalized stream connected"
              : "● Local fork stream connected"
            : status === "idle"
              ? "Select a token"
              : status}
        </span>
      </div>}
      {error && (
        <div className="message error" role="alert">
          {error}
        </div>
      )}
      {reset && (
        <div className="message" role="status">
          Chain reorganization: the previous branch was discarded and replaced.
        </div>
      )}
      {data &&
        (!selectedToken ||
          data.token.address.toLowerCase() ===
            selectedToken.address.toLowerCase()) && (
          <MarketChain.Provider value={data.provenance.chainId}>
            <div
              className="market-card"
              data-cursor={data.cursor}
              data-block-hash={data.snapshot.blockHash}
            >
              <div className="section-heading">
                <div>
                  <span className="caption">
                    {data.launch.graduated
                      ? "OFFICIAL V4 POOL"
                      : "BONDING CURVE"}
                  </span>
                  <h3>
                    {data.token.name} / {data.token.symbol}
                  </h3>
                  <Address value={data.token.address} />
                </div>
                <button
                  className="text-button"
                  onClick={() => onOpenStudio(data.launch.nftId)}
                >
                  Open Chog #{data.launch.nftId} studio ↗
                </button>
              </div>
              <div className="stats">
                <article>
                  <span className="caption">LAST EXECUTION · CHOG / TOKEN</span>
                  <h3 className="execution-price">
                    {data.candles.at(-1)?.close ?? "Unavailable"}
                  </h3>
                </article>
                <article>
                  <span className="caption">INDEXED TRADES</span>
                  <h3>{data.tradeCount.toLocaleString("en-US")}</h3>
                </article>
                <article>
                  <span className="caption">HOLDING ADDRESSES</span>
                  <h3>
                    {data.holders?.count?.toLocaleString("en-US") ??
                      "Unavailable"}
                  </h3>
                  <p>Includes protocol contracts; addresses are not people.</p>
                </article>
              </div>
              <TradePanel
                token={data.token}
                wallet={wallet}
                cursor={data.cursor}
              />
              <p className="note">{data.priceUnit}</p>
              <Candles candles={data.candles} />
              {data.attributionSummary && (
                <p className="note">
                  {data.attributionSummary.officialV4Matched} v4 trades matched
                  to official settlement events ·{" "}
                  {data.attributionSummary.unresolvedV4} unresolved routes.{" "}
                  {data.attributionSummary.legacyV4Rows > 0
                    ? `${data.attributionSummary.legacyV4Rows} legacy rows need a reviewed history rescan to obtain new attribution.`
                    : ""}{" "}
                  {data.attributionSummary.policy}
                </p>
              )}
              <div className="market-tables">
                <div>
                  <h3>Recent trades</h3>
                  <p className="note">
                    {data.tradesTruncated
                      ? "Latest 500 trades; older history is omitted."
                      : "All trades returned in this indexed snapshot."}{" "}
                    Curve payer/recipient come from market events. V4 identities
                    require a matching official lock settlement; unsupported
                    routes remain unknown.
                  </p>
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>Time (UTC)</th>
                          <th>Side</th>
                          <th>Tokens</th>
                          <th>CHOG notional</th>
                          <th>Payer / router</th>
                          <th>Recipient</th>
                          <th>Transaction</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...data.trades].reverse().map((t) => (
                          <tr key={t.id} data-transaction={t.transactionHash}>
                            <td>{time(t.timestamp)}</td>
                            <td className={t.side}>
                              {t.side.toUpperCase()}
                              <small>{t.stage}</small>
                            </td>
                            <td title={t.tokenAmountRaw}>
                              {units(t.tokenAmountRaw, data.token.decimals)}
                            </td>
                            <td title={t.quoteBaseRaw}>
                              {units(t.quoteBaseRaw)}
                            </td>
                            <td>
                              <Address value={t.payer || t.router} />
                              <small>
                                {t.payer
                                  ? t.attribution?.method ===
                                    "foundry-lock-pool-trade"
                                    ? "Official settlement payer"
                                    : "Curve event payer"
                                  : "Callback router; payer unknown"}
                              </small>
                              {t.attribution?.evidence && (
                                <small
                                  title={`Evidence: ${t.attribution.evidence.blockHash}:${t.attribution.evidence.logIndex}`}
                                >
                                  PoolTrade log #
                                  {t.attribution.evidence.logIndex}
                                </small>
                              )}
                            </td>
                            <td>
                              <Address value={t.recipient} />
                              <small>
                                {t.recipient
                                  ? "Contract-recorded recipient"
                                  : "Unresolved route"}
                              </small>
                            </td>
                            <td>
                              <Transaction value={t.transactionHash} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {!data.trades.length && (
                    <p className="note">No executed trades yet.</p>
                  )}
                </div>
                <div>
                  <h3>Holders</h3>
                  <p className="note">
                    {data.holderStatus}. Top {data.holders?.top.length ?? 0}{" "}
                    addresses.
                  </p>
                  {data.holders && (
                    <div className="table-scroll">
                      <table>
                        <thead>
                          <tr>
                            <th>Address</th>
                            <th>Balance</th>
                            <th>Supply share</th>
                            <th>Role</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.holders.top.map((h) => (
                            <tr key={h.wallet}>
                              <td>
                                <Address value={h.wallet} />
                              </td>
                              <td title={h.balanceRaw}>
                                {units(h.balanceRaw, data.token.decimals)}
                              </td>
                              <td>{units(h.shareBps, 2)}%</td>
                              <td>{h.role}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
              <dl className="market-identity">
                <dt>Original creator</dt>
                <dd>
                  <Address value={data.launch.creator} />
                </dd>
                <dt>Fee vault</dt>
                <dd>
                  <Address value={data.launch.vault} />
                </dd>
                <dt>Indexed range</dt>
                <dd>
                  {data.range.fromBlock}–{data.range.toBlock} ·{" "}
                  {data.index.caughtUp
                    ? `Caught up to observed ${data.provenance.finality === "finalized" ? "finalized" : "local fork"} head`
                    : `Catching up to block ${data.index.observedHead ?? "unavailable"}`}
                </dd>
              </dl>
              <details className="note">
                <summary>Source and canonical snapshot</summary>
                <p>
                  {data.provenance.source} · {data.provenance.finality} · chain{" "}
                  {data.provenance.chainId}
                </p>
                <p>
                  Block {data.provenance.blockNumber} ·{" "}
                  {data.provenance.blockTime}
                </p>
                <code>{data.provenance.blockHash}</code>
                <p>
                  Read at {data.provenance.fetchedAt} ·{" "}
                  {data.provenance.rpcOrigin}
                </p>
                <p>
                  {data.candlesTruncated
                    ? "Candle history is truncated to the latest 500 populated intervals."
                    : "Returned candle history is complete to the indexed checkpoint."}
                </p>
              </details>
            </div>
          </MarketChain.Provider>
        )}
    </section>
  );
}
