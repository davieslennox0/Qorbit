import { useEffect, useMemo, useRef, useState } from 'react';
import { forceSimulation, forceLink, forceManyBody, forceCenter, forceCollide } from 'd3-force';

const WIDTH = 900;
const HEIGHT = 560;
const PULSE_MS = 2600;

function shortAddr(addr) {
  if (!addr) return '?';
  return `${addr.slice(0, 6)}`;
}

/// Force-directed graph: one node per agent (sized by reputation) plus any wallet seen in
/// recent payments that isn't a registered agent, one edge per recent payment. New edges
/// (payments not seen on a previous render) pulse briefly with a traveling dot along the
/// edge and a halo on both endpoint nodes. D3 only computes the physics (forceSimulation);
/// React owns the DOM via SVG bound to simulation tick state, so the two never fight over
/// the same nodes.
function NetworkGraph({ agents = [], payments = [], labels = {} }) {
  const simulationRef = useRef(null);
  const nodesMapRef = useRef(new Map()); // id -> persisted {x,y,vx,vy}
  const seenTxRef = useRef(new Set());
  const [tick, setTick] = useState({ nodes: [], links: [] });
  const [pulsing, setPulsing] = useState(() => new Map()); // txHash -> link snapshot (amount, etc.)

  function labelFor(addr) {
    return labels[addr?.toLowerCase()] || shortAddr(addr);
  }

  const { nodes, links } = useMemo(() => {
    const nodeById = new Map();
    for (const agent of agents) {
      nodeById.set(agent.address, {
        id: agent.address,
        label: labelFor(agent.address),
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
    // Detect genuinely new payments (by txHash) and pulse their edge briefly.
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
    // Merge new node list with persisted positions so the layout doesn't jump on poll.
    const merged = nodes.map((n) => {
      const prev = nodesMapRef.current.get(n.id);
      return prev ? { ...n, x: prev.x, y: prev.y, vx: prev.vx, vy: prev.vy } : { ...n };
    });

    if (!simulationRef.current) {
      simulationRef.current = forceSimulation(merged)
        .force('link', forceLink(links).id((d) => d.id).distance(160).strength(0.25))
        .force('charge', forceManyBody().strength(-260))
        .force('center', forceCenter(WIDTH / 2, HEIGHT / 2))
        .force('collide', forceCollide((d) => 16 + Math.sqrt(d.reputation || 4)))
        .on('tick', () => {
          setTick({
            nodes: simulationRef.current.nodes().map((n) => ({ ...n })),
            links: simulationRef.current.force('link').links().map((l) => ({ ...l })),
          });
        });
    } else {
      simulationRef.current.nodes(merged);
      simulationRef.current.force('link', forceLink(links).id((d) => d.id).distance(160).strength(0.25));
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

      <g>
        {tick.links.map((l, i) => {
          const isPulsing = l.txHash && pulsing.has(l.txHash);
          const sx = l.source?.x ?? 0;
          const sy = l.source?.y ?? 0;
          const tx = l.target?.x ?? 0;
          const ty = l.target?.y ?? 0;
          const mx = (sx + tx) / 2;
          const my = (sy + ty) / 2;
          const pathId = `path-${l.txHash || i}`;
          return (
            <g key={l.txHash || i}>
              <path
                id={pathId}
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
                    <animateMotion key={l.txHash} dur="1.1s" repeatCount="indefinite" path={`M ${sx} ${sy} L ${tx} ${ty}`} />
                  </circle>
                  <text
                    x={mx}
                    y={my - 8}
                    textAnchor="middle"
                    className="font-mono font-medium"
                    fontSize="11"
                    fill="#111111"
                  >
                    {l.amount} USDC
                  </text>
                </>
              )}
            </g>
          );
        })}
      </g>
      <g>
        {tick.nodes.map((n) => {
          const isActive = activeNodeIds.has(n.id);
          const r = (8 + Math.sqrt(n.reputation || 4)) * (isActive ? 1.18 : 1);
          return (
            <g
              key={n.id}
              transform={`translate(${n.x ?? WIDTH / 2}, ${n.y ?? HEIGHT / 2})`}
              style={{ transition: 'transform 0.1s linear' }}
            >
              {isActive && <circle r={r + 6} fill="rgba(17,17,17,0.08)" filter="url(#netGlow)" />}
              <circle
                r={r}
                fill={n.isAgent ? (isActive ? 'rgba(17,17,17,0.12)' : 'rgba(17,17,17,0.06)') : 'rgba(17,17,17,0.02)'}
                stroke={n.isAgent ? '#111111' : '#a3a3a3'}
                strokeWidth={isActive ? 2.25 : 1.5}
                style={{ transition: 'stroke-width 0.2s, fill 0.2s' }}
              />
              <text
                y={r + 16}
                textAnchor="middle"
                className="font-mono font-medium"
                fontSize="11"
                fill={n.isAgent ? '#111111' : '#737373'}
              >
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
