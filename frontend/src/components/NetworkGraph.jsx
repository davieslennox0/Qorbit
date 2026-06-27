import { useEffect, useMemo, useRef, useState } from 'react';
import { forceSimulation, forceLink, forceManyBody, forceCenter, forceCollide } from 'd3-force';

const WIDTH = 900;
const HEIGHT = 560;
const PULSE_MS = 2600;
const AGENT_R = 34;

function shortAddr(addr) {
  if (!addr) return '?';
  return `${addr.slice(0, 6)}`;
}

function splitLabel(label = '') {
  const words = label.split(' ');
  if (words.length === 1) return [label, null];
  const mid = Math.ceil(words.length / 2);
  return [words.slice(0, mid).join(' '), words.slice(mid).join(' ')];
}

/// Force-directed graph: one node per agent (sized by reputation) plus any wallet seen in
/// recent payments that isn't a registered agent, one edge per recent payment. New edges
/// (payments not seen on a previous render) pulse briefly with a traveling dot along the
/// edge and a halo on both endpoint nodes. D3 only computes the physics (forceSimulation);
/// React owns the DOM via SVG bound to simulation tick state, so the two never fight over
/// the same nodes.
function NetworkGraph({ agents = [], payments = [], labels = {} }) {
  const simulationRef = useRef(null);
  const nodesMapRef = useRef(new Map());
  const seenTxRef = useRef(new Set());
  const [tick, setTick] = useState({ nodes: [], links: [] });
  const [pulsing, setPulsing] = useState(() => new Map());

  function labelFor(addr) {
    return labels[addr?.toLowerCase()] || shortAddr(addr);
  }

  const { nodes, links } = useMemo(() => {
    const nodeById = new Map();
    for (const agent of agents) {
      const addr = agent.owner || agent.address;
      nodeById.set(addr, {
        id: addr,
        label: labelFor(addr),
        reputation: agent.reputation ?? 0,
        isAgent: true,
      });
    }
    const linkList = [];
    for (const p of payments) {
      for (const addr of [p.from, p.to]) {
        if (!nodeById.has(addr)) {
          nodeById.set(addr, { id: addr, label: labelFor(addr), reputation: 0, isAgent: false });
        }
      }
      linkList.push({ source: p.from, target: p.to, txHash: p.txHash, amount: p.amount });
    }
    return { nodes: [...nodeById.values()], links: linkList };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agents, payments, labels]);

  useEffect(() => {
    const fresh = links.filter((l) => l.txHash && !seenTxRef.current.has(l.txHash));
    if (fresh.length > 0) {
      fresh.forEach((l) => seenTxRef.current.add(l.txHash));
      setPulsing((prev) => {
        const next = new Map(prev);
        fresh.forEach((l) => next.set(l.txHash, l));
        return next;
      });
      fresh.forEach((l) => {
        setTimeout(() => {
          setPulsing((prev) => {
            const next = new Map(prev);
            next.delete(l.txHash);
            return next;
          });
        }, PULSE_MS);
      });
    }
  }, [links]);

  useEffect(() => {
    const merged = nodes.map((n) => {
      const prev = nodesMapRef.current.get(n.id);
      return prev ? { ...n, x: prev.x, y: prev.y, vx: prev.vx, vy: prev.vy } : { ...n };
    });

    const collideR = (d) => (d.isAgent ? AGENT_R + 10 : 18);

    if (!simulationRef.current) {
      simulationRef.current = forceSimulation(merged)
        .force('link', forceLink(links).id((d) => d.id).distance(180).strength(0.25))
        .force('charge', forceManyBody().strength(-320))
        .force('center', forceCenter(WIDTH / 2, HEIGHT / 2))
        .force('collide', forceCollide(collideR))
        .on('tick', () => {
          setTick({
            nodes: simulationRef.current.nodes().map((n) => ({ ...n })),
            links: simulationRef.current.force('link').links().map((l) => ({ ...l })),
          });
        });
    } else {
      simulationRef.current.nodes(merged);
      simulationRef.current.force('link', forceLink(links).id((d) => d.id).distance(180).strength(0.25));
      simulationRef.current.force('collide', forceCollide(collideR));
      simulationRef.current.alpha(0.5).restart();
    }

    merged.forEach((n) => nodesMapRef.current.set(n.id, n));
    return () => {};
  }, [nodes, links]);

  useEffect(() => {
    return () => simulationRef.current?.stop();
  }, []);

  const activeNodeIds = useMemo(() => {
    const set = new Set();
    for (const l of pulsing.values()) {
      set.add(typeof l.source === 'object' ? l.source.id : l.source);
      set.add(typeof l.target === 'object' ? l.target.id : l.target);
    }
    return set;
  }, [pulsing]);

  return (
    <svg width="100%" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="rounded-lg border border-border bg-surface">
      <defs>
        <filter id="netGlow" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="3.2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* edges */}
      <g>
        {tick.links.map((l, i) => {
          const isPulsing = l.txHash && pulsing.has(l.txHash);
          const sx = l.source?.x ?? 0;
          const sy = l.source?.y ?? 0;
          const tx = l.target?.x ?? 0;
          const ty = l.target?.y ?? 0;
          const mx = (sx + tx) / 2;
          const my = (sy + ty) / 2;
          return (
            <g key={l.txHash || i}>
              <path
                d={`M ${sx} ${sy} L ${tx} ${ty}`}
                fill="none"
                stroke={isPulsing ? '#111111' : '#d4d4d4'}
                strokeWidth={isPulsing ? 2.5 : 1}
                opacity={isPulsing ? 0.95 : 0.6}
                filter={isPulsing ? 'url(#netGlow)' : undefined}
                style={{ transition: 'stroke 0.3s, stroke-width 0.3s, opacity 0.3s' }}
              />
              {isPulsing && (
                <>
                  <circle r={4} fill="#111111" filter="url(#netGlow)">
                    <animateMotion dur="1.1s" repeatCount="indefinite" path={`M ${sx} ${sy} L ${tx} ${ty}`} />
                  </circle>
                  <text x={mx} y={my - 8} textAnchor="middle" fontFamily="monospace" fontSize="11" fill="#111111">
                    {l.amount} USDC
                  </text>
                </>
              )}
            </g>
          );
        })}
      </g>

      {/* nodes */}
      <g>
        {tick.nodes.map((n) => {
          const isActive = activeNodeIds.has(n.id);
          const x = n.x ?? WIDTH / 2;
          const y = n.y ?? HEIGHT / 2;

          if (n.isAgent) {
            const r = AGENT_R;
            const [line1, line2] = splitLabel(n.label);
            return (
              <g key={n.id} transform={`translate(${x}, ${y})`}>
                <circle
                  r={r}
                  fill={isActive ? 'rgba(17,17,17,0.10)' : 'rgba(17,17,17,0.05)'}
                  stroke="#111111"
                  strokeWidth={isActive ? 2.5 : 1.5}
                  style={{ transition: 'stroke-width 0.2s, fill 0.2s' }}
                />
                <text textAnchor="middle" fontFamily="'JetBrains Mono', monospace" fontSize="10" fontWeight="500" fill="#111111" pointerEvents="none">
                  {line2 ? (
                    <>
                      <tspan x="0" dy="-5">{line1}</tspan>
                      <tspan x="0" dy="13">{line2}</tspan>
                    </>
                  ) : (
                    <tspan x="0" dy="4">{line1}</tspan>
                  )}
                </text>
              </g>
            );
          }

          return (
            <g key={n.id} transform={`translate(${x}, ${y})`}>
              <circle
                r={8}
                fill="rgba(17,17,17,0.02)"
                stroke={isActive ? '#111111' : '#a3a3a3'}
                strokeWidth={isActive ? 2 : 1}
                style={{ transition: 'stroke-width 0.2s' }}
              />
              <text y={20} textAnchor="middle" fontFamily="monospace" fontSize="10" fill="#737373">
                {n.label}
              </text>
            </g>
          );
        })}
      </g>
    </svg>
  );
}

export default NetworkGraph;
