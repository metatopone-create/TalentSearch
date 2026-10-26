import json
import os
import time

os.environ["TS_DEMO"] = "1"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("TS_DATA_DIR", str(tmp_path))
    import importlib

    import talent.config
    import talent.api

    importlib.reload(talent.config)
    importlib.reload(talent.api)
    with TestClient(talent.api.app) as c:
        yield c


def test_plan_then_search_then_report(client):
    plan = client.post("/api/plan", json={"query": "LLM inference optimization engineers in the US"}).json()
    assert plan["conditions"] and plan["clarifying"]["question"]
    plan["focus"] = "Serving systems"
    search_id = client.post("/api/searches", json=plan).json()["id"]

    with client.stream("GET", f"/api/searches/{search_id}/events") as stream:
        kinds = []
        for line in stream.iter_lines():
            if line.startswith("event: "):
                kinds.append(line[7:])
            if line.startswith("data: ") and kinds[-1] == "status":
                if json.loads(line[6:])["status"] in {"done", "stopped", "budget", "failed"}:
                    break
    assert kinds[0] == "snapshot" and "candidate" in kinds and "trace" in kinds

    state = client.get(f"/api/searches/{search_id}").json()
    assert state["status"] == "done"
    assert state["plan"]["focus"] == "Serving systems"

    csv_text = client.get(f"/api/searches/{search_id}/export.csv").text
    assert csv_text.splitlines()[0].startswith("name,status,score")
    assert "Priya Raman" in csv_text

    history = client.get("/api/history").json()
    assert history[0]["id"] == search_id and history[0]["verified"] > 0

    report = client.get("/api/cost").json()
    assert report["searches"] == 1 and report["total"] > 0
    assert report["by_source"]["github"] == 0


def test_stop(client):
    plan = client.post("/api/plan", json={"query": "LLM inference engineers"}).json()
    search_id = client.post("/api/searches", json=plan).json()["id"]
    time.sleep(0.3)
    assert client.post(f"/api/searches/{search_id}/stop").json() == {"ok": True}
    for _ in range(100):
        if client.get(f"/api/searches/{search_id}").json()["status"] != "running":
            break
        time.sleep(0.1)
    assert client.get(f"/api/searches/{search_id}").json()["status"] == "stopped"


def test_rejects_empty_request(client):
    assert client.post("/api/plan", json={"query": "  "}).status_code == 400
