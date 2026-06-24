from fastapi import FastAPI

app = FastAPI(title="Qorbitpay Quantum Services")


@app.get("/health")
def health():
    return {"status": "ok", "service": "qorbitpay-quantum-services"}
