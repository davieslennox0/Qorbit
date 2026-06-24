from fastapi import FastAPI

app = FastAPI(title="Quatripe Quantum Services")


@app.get("/health")
def health():
    return {"status": "ok", "service": "quatripe-quantum-services"}
