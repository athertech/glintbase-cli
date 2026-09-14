from fastapi import FastAPI

app = FastAPI(title="FastAPI Agent Service")

@app.get("/")
def read_root():
    return {"status": "healthy"}

@app.post("/auth/token")
def authenticate():
    return {"access_token": "agent_token", "token_type": "bearer"}

@app.get("/api/v1/items")
def list_items():
    return [{"id": 1, "title": "First Item"}]
