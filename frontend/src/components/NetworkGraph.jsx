import { useEffect, useMemo, useRef, useState } from 'react';
import { forceSimulation, forceLink, forceManyBody, forceCenter, forceCollide } from 'd3-force';

const WIDTH = 760;
const HEIGHT = 420;
const PULSE_MS = 2200;

function shortAddr(addr) {
  if (!addr) return '?';
  return `${addr.slice(0, 6)}`;
}

/// Force-directed graph: one node per agent (sized by reputation) plus any wallet seen in
/// recent payments that isn't a registered agent, one edge per recent payment. New edges
/// (payments not seen on a previous render) pulse briefly. D3 only computes the physics
/// (forceSimulation); React owns the DOM via SVG bound to simulation tick state, so the
/// two never fight over the same nodes.
function NetworkGraph({ agents = [], payments = [] }) {
  const simulationRef = useRef(null);
  const nodesMapRef = useRef(new Map()); // id -> persisted {x,y,vx,vy}
  const seenTxRef = useRef(new Set());
  const [tick, setTick] = useState({ nodes: [], links: [] });
  const [pulsing, setPulsing] = useState(() => new Set());

  const { nodes, links } = useMemo(() => {
    const nodeById = new Map();
    for (const agent of agents) {
      nodeById.set(agent.address, {
        id: agent.address,
        label: shortAddr(agent.address),
        reputation: agent.reputation ?? 0,
        isAgent: true,
      });
    }
    const linkList = [];
    for (const p of payments) {
      for (const addr of [p.from, p.to]) {
        if (!nodeById.has(addr)) {
          nodeById.set(addr, { id: addr, label: shortAddr(addr), reputation: 0, isAgent: false });
        }
      }
      linkList.push({ source: p.from, target: p.to, txHash: p.txHash, amount: p.amount });
    }
    return { nodes: [...nodeById.values()], links: linkList };
  }, [agents, payments]);

  useEffect(() => {
    // Detect genuinely new payments (by txHash) and pulse their edge briefly.
    const freshHashes = links.map((l) => l.txHash).filter((h) => h && !seenTxRef.current.has(h));
    if (freshHashes.length > 0) {
      freshHashes.forEach((h) => seenTxRef.current.add(h));
      setPulsing((prev) => new Set([...prev, ...freshHashes]));
      freshHashes.forEach((h) => {
        setTimeout(() => {
          setPulsing((prev) => {
            const next = new Set(prev);
            next.delete(h);
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
        .force('link', forceLink(links).id((d) => d.id).distance(130).strength(0.25))
        .force('charge', forceManyBody().strength(-220))
        .force('center', forceCenter(WIDTH / 2, HEIGHT / 2))
        .force('collide', forceCollide((d) => 14 + Math.sqrt(d.reputation || 4)))
        .on('tick', () => {
          setTick({
            nodes: simulationRef.current.nodes().map((n) => ({ ...n })),
            links: simulationRef.current.force('link').links().map((l) => ({ ...l })),
          });
        });
    } else {
      simulationRef.current.nodes(merged);
      simulationRef.current.force('link', forceLink(links).id((d) => d.id).distance(130).strength(0.25));
      simulationRef.current.alpha(0.5).restart();
    }

    merged.forEach((n) => nodesMapRef.current.set(n.id, n));

    return () => {};
  }, [nodes, links]);

  useEffect(() => {
    return () => simulationRef.current?.stop();
  }, []);

  return (
    <svg width="100%" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="rounded-lg border border-border bg-surface">
      <g>
        {tick.links.map((l, i) => {
          const isPulsing = l.txHash && pulsing.has(l.txHash);
          const sx = l.source?.x ?? 0;
          const sy = l.source?.y ?? 0;
          const tx = l.target?.x ?? 0;
          const ty = l.target?.y ?? 0;
          return (
            <line
              key={l.txHash || i}
              x1={sx}
              y1={sy}
              x2={tx}
              y2={ty}
              stroke={isPulsing ? '#111111' : '#d4d4d4'}
              strokeWidth={isPulsing ? 2.5 : 1}
              opacity={isPulsing ? 0.9 : 0.7}
              style={{ transition: 'stroke 0.3s, stroke-width 0.3s, opacity 0.3s' }}
            />
          );
        })}
      </g>
      <g>
        {tick.nodes.map((n) => {
          const r = 8 + Math.sqrt(n.reputation || 4);
          return (
            <g key={n.id} transform={`translate(${n.x ?? WIDTH / 2}, ${n.y ?? HEIGHT / 2})`}>
              <circle
                r={r}
                fill={n.isAgent ? 'rgba(17,17,17,0.06)' : 'rgba(17,17,17,0.02)'}
                stroke={n.isAgent ? '#111111' : '#a3a3a3'}
                strokeWidth={1.5}
              />
              <text
                y={r + 14}
                textAnchor="middle"
                className="font-mono"
                fontSize="10"
                fill="#737373"
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
