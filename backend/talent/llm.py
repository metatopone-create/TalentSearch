"""Thin wrapper over the Anthropic SDK: structured JSON calls, web search, and cost accounting."""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any

import anthropic

from .config import settings

FALLBACK_BETA = "server-side-fallback-2026-07-01"


class LLMError(RuntimeError):
    pass


class LLMRefusal(LLMError):
    pass


@dataclass
class CallResult:
    data: Any
    cost: float
    web_searches: int = 0
    urls: list[str] = field(default_factory=list)


def strict_object(properties: dict[str, Any], required: list[str] | None = None) -> dict[str, Any]:
    """JSON-schema object in the shape structured outputs needs: every property required, no extras."""
    return {
        "type": "object",
        "properties": properties,
        "required": required if required is not None else list(properties),
        "additionalProperties": False,
    }


def usage_cost(usage: Any) -> tuple[float, int]:
    """Dollar cost of one response's usage, and the number of web searches it ran."""
    if usage is None:
        return 0.0, 0
    tokens_in = usage.input_tokens or 0
    cache_write = getattr(usage, "cache_creation_input_tokens", 0) or 0
    cache_read = getattr(usage, "cache_read_input_tokens", 0) or 0
    tokens_out = usage.output_tokens or 0
    dollars = (
        tokens_in * settings.price_in
        + cache_write * settings.price_in * 1.25
        + cache_read * settings.price_in * 0.1
        + tokens_out * settings.price_out
    ) / 1_000_000
    server = getattr(usage, "server_tool_use", None)
    searches = (getattr(server, "web_search_requests", 0) or 0) if server else 0
    return dollars + searches * settings.price_web_search, searches


def _text_of(content: list[Any]) -> str:
    return "".join(block.text for block in content if getattr(block, "type", None) == "text")


def extract_json(text: str) -> Any:
    """Parse the last JSON object or array in free text (used where structured output can't be forced)."""
    text = text.strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    for opener, closer in (("[", "]"), ("{", "}")):
        start, end = text.find(opener), text.rfind(closer)
        if start != -1 and end > start:
            try:
                return json.loads(text[start : end + 1])
            except json.JSONDecodeError:
                continue
    raise LLMError("Model reply did not contain JSON")


class Claude:
    def __init__(self, client: anthropic.AsyncAnthropic | None = None):
        self.client = client or anthropic.AsyncAnthropic()

    async def structured(
        self,
        system: str,
        user: str,
        schema: dict[str, Any],
        effort: str = "low",
        max_tokens: int = 16000,
    ) -> CallResult:
        """One request whose reply is JSON matching `schema`."""
        try:
            response = await self.client.beta.messages.create(
                model=settings.model,
                max_tokens=max_tokens,
                system=system,
                messages=[{"role": "user", "content": user}],
                output_config={"effort": effort, "format": {"type": "json_schema", "schema": schema}},
                betas=[FALLBACK_BETA],
                fallbacks="default",
            )
        except anthropic.APIConnectionError as exc:
            raise LLMError(f"Could not reach the Claude API: {exc}") from exc
        except anthropic.APIStatusError as exc:
            raise LLMError(f"Claude API error {exc.status_code}: {exc.message}") from exc
        cost, _ = usage_cost(response.usage)
        if response.stop_reason == "refusal":
            raise LLMRefusal("The model declined this request")
        if response.stop_reason == "max_tokens":
            raise LLMError("The model ran out of output tokens")
        text = _text_of(response.content)
        try:
            data = json.loads(text)
        except json.JSONDecodeError as exc:
            raise LLMError("Structured reply was not valid JSON") from exc
        return CallResult(data=data, cost=cost)

    async def web_search(self, system: str, user: str, max_uses: int = 3, effort: str = "low") -> CallResult:
        """Let Claude run web searches, then return its final answer parsed as JSON plus the result URLs."""
        messages: list[dict[str, Any]] = [{"role": "user", "content": user}]
        tools = [{"type": "web_search_20260209", "name": "web_search", "max_uses": max_uses}]
        total_cost, total_searches, urls = 0.0, 0, []
        for _ in range(4):  # a server-tool turn may pause; resume a few times at most
            try:
                response = await self.client.beta.messages.create(
                    model=settings.model,
                    max_tokens=16000,
                    system=system,
                    messages=messages,
                    tools=tools,
                    output_config={"effort": effort},
                    betas=[FALLBACK_BETA],
                    fallbacks="default",
                )
            except anthropic.APIConnectionError as exc:
                raise LLMError(f"Could not reach the Claude API: {exc}") from exc
            except anthropic.APIStatusError as exc:
                raise LLMError(f"Claude API error {exc.status_code}: {exc.message}") from exc
            cost, searches = usage_cost(response.usage)
            total_cost += cost
            total_searches += searches
            for block in response.content:
                if getattr(block, "type", None) == "web_search_tool_result":
                    content = block.content
                    if isinstance(content, list):  # an error result is a single object, not a list
                        urls.extend(item.url for item in content if getattr(item, "url", None))
                    else:
                        raise LLMError(f"Web search unavailable ({getattr(content, 'error_code', 'error')})")
            if response.stop_reason == "refusal":
                raise LLMRefusal("The model declined this request")
            if response.stop_reason == "pause_turn":
                messages = [*messages, {"role": "assistant", "content": response.content}]
                continue
            data = extract_json(_text_of(response.content))
            return CallResult(data=data, cost=total_cost, web_searches=total_searches, urls=urls)
        raise LLMError("Web search did not finish")
