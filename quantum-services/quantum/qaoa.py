#!/usr/bin/env python3
"""QAOA (Quantum Approximate Optimization Algorithm) payment router for Qorbitpay.

Reads one JSON object from stdin: {"providers": [{id, price, latency, reputation}, ...]}
Writes one JSON object to stdout:
  {optimal_route, quantum_cost, classical_cost, baseline_cost, savings_pct, method}

Models "pick the best of N agent service providers" as a constrained combinatorial
search (exactly one provider selected) using the Quantum Alternating Operator Ansatz
(Hadfield et al., 2019): instead of a penalty term forcing the one-hot constraint (which
wastes circuit depth enforcing feasibility instead of ranking candidates), the search
starts in a one-hot basis state and uses a Hamming-weight-preserving "ring XY" mixer
(exp(-i*beta*(XX+YY)) across qubit pairs (i, i+1 mod n), built from native RXX/RYY gates,
which commute) so every state explored throughout the p=2 QAOA circuit stays a valid
single-provider selection. The cost unitary is then just a per-qubit RZ phase from each
provider's weighted price/latency/reputation cost - no quadratic penalty terms needed.
Qubit count = number of providers, clamped to [4,6] by padding with dummy high-cost
providers or truncating to the cheapest-looking 6.
"""
import sys
import json

import numpy as np
from scipy.optimize import minimize
from qiskit import QuantumCircuit
from qiskit_aer import AerSimulator

MIN_QUBITS = 4
MAX_QUBITS = 6
PRICE_WEIGHT = 0.45
LATENCY_WEIGHT = 0.25
REPUTATION_WEIGHT = 0.30
QAOA_LAYERS = 2
RESTARTS = 4

_SIM = AerSimulator(method="statevector")


def run_statevector(qc):
    qc = qc.copy()
    qc.save_statevector()
    result = _SIM.run(qc).result()
    return result.get_statevector()


def normalize(values):
    lo, hi = min(values), max(values)
    if hi - lo < 1e-9:
        return [0.0 for _ in values]
    return [(v - lo) / (hi - lo) for v in values]


def provider_costs(providers):
    prices = normalize([p["price"] for p in providers])
    latencies = normalize([p["latency"] for p in providers])
    reputations = normalize([p["reputation"] for p in providers])
    costs = []
    for price_n, latency_n, rep_n in zip(prices, latencies, reputations):
        cost = PRICE_WEIGHT * price_n + LATENCY_WEIGHT * latency_n + REPUTATION_WEIGHT * (1.0 - rep_n)
        costs.append(cost)
    return costs


def pad_or_truncate(providers):
    n = len(providers)
    if n < MIN_QUBITS:
        dummy_price = max(p["price"] for p in providers) * 10 + 1
        dummy_latency = max(p["latency"] for p in providers) * 10 + 1
        while len(providers) < MIN_QUBITS:
            providers = providers + [{
                "id": f"__dummy_{len(providers)}",
                "price": dummy_price,
                "latency": dummy_latency,
                "reputation": 0.0,
            }]
    elif n > MAX_QUBITS:
        providers = sorted(providers, key=lambda p: p["price"])[:MAX_QUBITS]
    return providers


def ring_mixer(qc, beta, n):
    for i in range(n):
        j = (i + 1) % n
        qc.rxx(beta, i, j)
        qc.ryy(beta, i, j)


def qaoa_circuit(n, params, linear_z):
    gammas = params[0::2]
    betas = params[1::2]
    qc = QuantumCircuit(n)
    qc.x(0)  # start in a valid one-hot state: provider 0 selected
    for gamma, beta in zip(gammas, betas):
        for i, coeff in enumerate(linear_z):
            qc.rz(2 * gamma * coeff, i)
        ring_mixer(qc, beta, n)
    return qc


def run_qaoa(providers_in):
    providers = pad_or_truncate(providers_in)
    n = len(providers)
    costs = provider_costs(providers)
    linear_z = [-c / 2.0 for c in costs]  # x_i=(1-z_i)/2 => cost_i*x_i = const - (cost_i/2)*z_i

    def objective(params):
        qc = qaoa_circuit(n, params, linear_z)
        state = run_statevector(qc)
        z_exps = [state.probabilities([q])[0] - state.probabilities([q])[1] for q in range(n)]
        return sum(c * (1.0 - z) / 2.0 for c, z in zip(costs, z_exps))

    rng = np.random.default_rng(42)
    best_result = None
    for _ in range(RESTARTS):
        x0 = rng.uniform(0, np.pi, size=2 * QAOA_LAYERS)
        result = minimize(objective, x0, method="COBYLA", options={"maxiter": 100})
        if best_result is None or result.fun < best_result.fun:
            best_result = result

    final_qc = qaoa_circuit(n, best_result.x, linear_z)
    final_state = run_statevector(final_qc)
    probs = final_state.probabilities_dict()

    # The ring-XY mixer confines the search to one-hot states by construction, so we
    # expect (numerically, up to floating point) only one-hot bitstrings with nonzero
    # probability; pick the most probable one.
    best_bitstring, best_prob = None, -1.0
    for bitstring, p in probs.items():
        if bitstring.count("1") == 1 and p > best_prob:
            best_bitstring, best_prob = bitstring, p

    if best_bitstring is None:
        chosen_idx = int(np.argmin(costs))
    else:
        chosen_idx = len(best_bitstring) - 1 - best_bitstring.index("1")

    quantum_cost = costs[chosen_idx]
    classical_idx = int(np.argmin(costs))
    classical_cost = costs[classical_idx]
    baseline_cost = costs[0]
    savings_pct = 0.0 if baseline_cost <= 1e-12 else (baseline_cost - quantum_cost) / baseline_cost * 100.0

    real_providers = [p for p in providers if not str(p.get("id", "")).startswith("__dummy_")]
    chosen_provider = providers[chosen_idx]
    optimal_route = chosen_provider.get("id") if not str(chosen_provider.get("id", "")).startswith("__dummy_") else None

    return {
        "optimal_route": optimal_route,
        "quantum_cost": round(quantum_cost, 6),
        "classical_cost": round(classical_cost, 6),
        "baseline_cost": round(baseline_cost, 6),
        "savings_pct": round(savings_pct, 4),
        "method": "QAOA",
        "qubits": n,
        "layers": QAOA_LAYERS,
        "selection_confidence": round(float(best_prob), 6) if best_prob >= 0 else None,
        "matched_classical_optimum": chosen_idx == classical_idx,
        "candidates_considered": len(real_providers),
    }


def main():
    raw = sys.stdin.readline()
    if not raw.strip():
        raw = sys.stdin.read()
    payload = json.loads(raw)
    providers = payload.get("providers", [])
    if len(providers) < 1:
        print(json.dumps({"error": "providers list must be non-empty"}))
        sys.exit(1)
    result = run_qaoa(providers)
    print(json.dumps(result))
    sys.stdout.flush()


if __name__ == "__main__":
    main()
