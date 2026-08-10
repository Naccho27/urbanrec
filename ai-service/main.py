from fastapi import FastAPI
from routers import optimize, predict

app = FastAPI(
    title="Sistema Residuos VM — AI Service",
    description="Microservicio de IA: optimización de rutas y predicción de demanda",
    version="1.0.0"
)

app.include_router(optimize.router, prefix="/optimize", tags=["Optimización"])
app.include_router(predict.router,  prefix="/predict",  tags=["Predicción"])

@app.get("/health")
def health():
    return {"status": "ok", "service": "ai-service"}