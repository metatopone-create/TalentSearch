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
    assert csv_text.lstrip("\ufeff").splitlines()[0].startswith("name,status,score")
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


def _finished_search(client) -> str:
    plan = client.post("/api/plan", json={"query": "LLM inference optimization engineers in the US"}).json()
    search_id = client.post("/api/searches", json=plan).json()["id"]
    for _ in range(300):
        if client.get(f"/api/searches/{search_id}").json()["status"] != "running":
            return search_id
        time.sleep(0.1)
    raise AssertionError("search did not finish")


def test_followup_chat_shortlist_profile_and_email(client):
    search_id = _finished_search(client)
    state = client.get(f"/api/searches/{search_id}").json()
    by_name = {c["name"]: c for c in state["candidates"]}

    answer = client.post(f"/api/searches/{search_id}/ask", json={"message": "Who are the strongest matches?"}).json()
    assert answer["kind"] == "answer" and answer["highlights"]
    refusal = client.post(f"/api/searches/{search_id}/ask", json={"message": "他们有华人吗"}).json()
    assert refusal["kind"] == "clarify" and not refusal["highlights"] and refusal["options"]
    refine = client.post(f"/api/searches/{search_id}/ask", json={"message": "Expand to Canada"}).json()
    assert refine["kind"] == "refine" and "Canada" in refine["new_query"]
    assert len(client.get(f"/api/searches/{search_id}").json()["messages"]) == 6

    priya, marcus = by_name["Priya Raman"], by_name["Marcus Feld"]
    found = client.post(f"/api/searches/{search_id}/emails",
                        json={"candidate_ids": [priya["id"], marcus["id"], by_name["Aisha Bello"]["id"]]}).json()
    emails = {c["name"]: (c["email"], c["email_source"], c["email_checked"]) for c in found}
    assert emails["Priya Raman"] == ("priya@priyaraman.dev", "https://priyaraman.dev", True)
    assert emails["Marcus Feld"] == ("marcus@halcyon.example", "https://github.com/mfeld", True)
    assert emails["Aisha Bello"] == ("", "", True)

    prof = client.post(f"/api/searches/{search_id}/candidates/{priya['id']}/profile?lang=zh").json()["profile"]
    ids = {e["id"] for e in priya["evidence"]}
    assert prof["lang"] == "zh" and prof["experience"]
    assert all(set(s["refs"]) <= ids for s in prof["summary"] + prof["experience"])

    keys = client.post("/api/shortlist", json={"search_id": search_id, "candidate_ids": [priya["id"]]}).json()
    assert keys["shortlisted"] == [priya["id"]]
    entries = client.get("/api/shortlist").json()
    assert entries[0]["candidate"]["name"] == "Priya Raman"
    assert client.patch(f"/api/shortlist/{entries[0]['id']}", json={"note": "Call Tue"}).json() == {"ok": True}
    csv_text = client.get("/api/shortlist/export.csv").text
    assert "priya@priyaraman.dev" in csv_text and "Call Tue" in csv_text
    assert client.delete(f"/api/shortlist/{search_id}/{priya['id']}").json()["shortlisted"] == []

    selected = client.get(f"/api/searches/{search_id}/export.csv?ids={marcus['id']}").text
    assert "Marcus Feld" in selected and "Priya Raman" not in selected
