#!/usr/bin/env python3
"""VQC (Variational Quantum Circuit) fraud detector for Qorbitpay payments.

Reads one JSON object from stdin: {amount_zscore, agent_age_days, tx_frequency, dispute_rate}
Writes one JSON object to stdout: {fraud_score, confidence, method, flagged}

Architecture: a 4-qubit data-reuploading ansatz (Havlicek-style) - one qubit per input
feature. Each layer is [RY feature-encoding] -> [CX entangling chain] -> [RY variational
rotation with fixed, pre-set weights]. There's no training loop here (no labeled fraud
dataset to train against), so WEIGHTS below stand in for a pretrained model: they were
chosen to weight dispute_rate and amount_zscore (the two strongest fraud signals) more
heavily than agent_age_days and tx_frequency. Output is the weighted sum of per-qubit
Z-expectation values, squashed through a sigmoid into a [0,1] fraud_score.
"""
import sys
import json
import math

from qiskit import QuantumCircuit
from qiskit_aer import AerSimulator

_SIM = AerSimulator(method="statevector")


def run_statevector(qc):
    qc = qc.copy()
    qc.save_statevector()
    result = _SIM.run(qc).result()
    return result.get_statevector()

# "Pretrained" variational weights (radians). There's no labeled fraud dataset to train
# against, so these came from a one-off calibration (see _calibrate_vqc.py) against 10
# synthetic clean/fraudulent profiles, fitting only the 8 variational gate angles - the
# OUTPUT_WEIGHTS readout stays a fixed domain choice (dispute history and anomalous
# amount weighted highest) rather than something the optimizer can zero out.
# Order: [amount_zscore, agent_age_days, tx_frequency, dispute_rate]
VAR_WEIGHTS_L1 = [0.4652, -1.2354, -0.2686, 4.4478]
VAR_WEIGHTS_L2 = [1.3845, 0.8432, 0.2413, 0.7891]
OUTPUT_WEIGHTS = [0.35, 0.10, 0.15, 0.40]  # must sum to 1.0
FLAG_THRESHOLD = 0.7


def encode_angle_amount_zscore(z):
    z = max(-3.0, min(3.0, float(z)))
    return (z / 3.0) * (math.pi / 2) + (math.pi / 2)


def encode_angle_agent_age(days):
    days = max(0.0, float(days))
    fresh = 1.0 - min(days, 365.0) / 365.0  # newer account -> closer to 1 -> more suspicious
    return fresh * math.pi


def encode_angle_tx_frequency(tx_per_hour):
    x = max(0.0, float(tx_per_hour))
    sigmoid = 1.0 / (1.0 + math.exp(-(x - 10.0) / 4.0))  # centered around 10 tx/hr
    return sigmoid * math.pi


def encode_angle_dispute_rate(rate):
    rate = max(0.0, min(1.0, float(rate)))
    return rate * math.pi


def build_circuit(angles):
    qc = QuantumCircuit(4)
    # Layer 1: feature encoding + entangle + variational rotation
    for i, a in enumerate(angles):
        qc.ry(a, i)
    qc.cx(0, 1)
    qc.cx(1, 2)
    qc.cx(2, 3)
    for i, w in enumerate(VAR_WEIGHTS_L1):
        qc.ry(w, i)
    # Layer 2: re-upload features + entangle + second variational rotation
    for i, a in enumerate(angles):
        qc.ry(a, i)
    qc.cx(0, 1)
    qc.cx(1, 2)
    qc.cx(2, 3)
    for i, w in enumerate(VAR_WEIGHTS_L2):
        qc.ry(w, i)
    return qc


def z_expectation(state, qubit, n_qubits):
    probs = state.probabilities([qubit])
    # probabilities([qubit]) returns [P(qubit=0), P(qubit=1)]; Z expectation = P0 - P1
    return float(probs[0] - probs[1])


def run_vqc(features):
    angles = [
        encode_angle_amount_zscore(features.get("amount_zscore", 0)),
        encode_angle_agent_age(features.get("agent_age_days", 0)),
        encode_angle_tx_frequency(features.get("tx_frequency", 0)),
        encode_angle_dispute_rate(features.get("dispute_rate", 0)),
    ]
    qc = build_circuit(angles)
    state = run_statevector(qc)

    z_exps = [z_expectation(state, i, 4) for i in range(4)]
    # Z-expectation is in [-1,1] with -1 meaning "flagged"-leaning (qubit collapsed to |1>);
    # remap each to a [0,1] suspicion contribution before combining.
    suspicion = [(1.0 - z) / 2.0 for z in z_exps]
    weighted = sum(w * s for w, s in zip(OUTPUT_WEIGHTS, suspicion))

    # sigmoid sharpening around the 0.5 midpoint for a more decisive score
    fraud_score = 1.0 / (1.0 + math.exp(-8.0 * (weighted - 0.5)))
    confidence = abs(fraud_score - 0.5) * 2.0
    flagged = fraud_score >= FLAG_THRESHOLD

    return {
        "fraud_score": round(fraud_score, 6),
        "confidence": round(confidence, 6),
        "method": "VQC",
        "flagged": flagged,
        "qubits": 4,
        "z_expectations": [round(z, 6) for z in z_exps],
    }


def main():
    raw = sys.stdin.readline()
    if not raw.strip():
        raw = sys.stdin.read()
    features = json.loads(raw)
    result = run_vqc(features)
    print(json.dumps(result))
    sys.stdout.flush()


if __name__ == "__main__":
    main()
