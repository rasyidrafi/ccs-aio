#!/usr/bin/env python3
"""Temporary helper for Codex reset credits until CLI support is available."""

from __future__ import annotations

import argparse
import base64
import json
import os
import sys
import time
import urllib.error
import urllib.request
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Any


BACKEND_BASE_URL = "https://chatgpt.com/backend-api"
CONFIRMATION_PHRASE = "use my codex reset"
USER_AGENT = "codex-cli"


class CodexResetError(Exception):
    """Raised for failures that should be shown without a traceback."""


@dataclass(frozen=True)
class CodexAuth:
    access_token: str
    account_id: str | None
    is_fedramp_account: bool

    def headers(self) -> dict[str, str]:
        headers = {
            "Authorization": f"Bearer {self.access_token}",
            "User-Agent": USER_AGENT,
        }
        if self.account_id:
            headers["ChatGPT-Account-ID"] = self.account_id
        if self.is_fedramp_account:
            headers["X-OpenAI-Fedramp"] = "true"
        return headers


def main() -> int:
    args = parse_args()
    try:
        auth = load_codex_auth(args.codex_home)
        usage_status = request_json("GET", usage_url(), auth)

        if args.json:
            print(json.dumps(usage_status, indent=2, sort_keys=True))
            return 0

        print_usage_status(usage_status)

        if args.use_reset:
            consume_reset_after_confirmation(auth, usage_status, skip_confirmation=args.yes)

        return 0
    except CodexResetError as error:
        print(f"error: {error}", file=sys.stderr)
        return 1


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Show Codex reset credit information. With --use-reset, consume one "
            "available reset credit after confirmation."
        )
    )
    parser.add_argument(
        "--use-reset",
        action="store_true",
        help="consume one available Codex rate-limit reset credit",
    )
    parser.add_argument(
        "--yes",
        action="store_true",
        help="skip the confirmation prompt when used with --use-reset",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="print the raw usage response and do not consume a reset",
    )
    parser.add_argument(
        "--codex-home",
        type=Path,
        default=default_codex_home(),
        help="directory containing auth.json (default: $CODEX_HOME or ~/.codex)",
    )
    args = parser.parse_args()
    if args.json and args.use_reset:
        parser.error("--json cannot be used with --use-reset")
    if args.yes and not args.use_reset:
        parser.error("--yes can only be used with --use-reset")
    return args


def default_codex_home() -> Path:
    codex_home = os.environ.get("CODEX_HOME")
    if codex_home:
        return Path(codex_home).expanduser()
    return Path.home() / ".codex"


def usage_url() -> str:
    return f"{BACKEND_BASE_URL}/wham/usage"


def consume_url() -> str:
    return f"{BACKEND_BASE_URL}/wham/rate-limit-reset-credits/consume"


def load_codex_auth(codex_home: Path) -> CodexAuth:
    auth_path = codex_home / "auth.json"
    auth_json = read_auth_json(auth_path)

    token_data = auth_json.get("tokens")
    if not isinstance(token_data, dict):
        raise CodexResetError(
            f"{auth_path} does not contain ChatGPT token auth; run `codex login` with ChatGPT auth"
        )

    access_token = token_data.get("access_token")
    if not isinstance(access_token, str) or not access_token.strip():
        raise CodexResetError(f"{auth_path} does not contain an access token")

    account_id = string_or_none(token_data.get("account_id"))
    id_token_claims = decode_jwt_payload(token_data.get("id_token"))
    access_token_claims = decode_jwt_payload(access_token)
    auth_claims = first_dict(
        nested_get(id_token_claims, "https://api.openai.com/auth"),
        nested_get(access_token_claims, "https://api.openai.com/auth"),
    )

    account_id = first_non_empty(
        account_id,
        nested_get(auth_claims, "chatgpt_account_id"),
    )
    is_fedramp_account = bool(nested_get(auth_claims, "chatgpt_account_is_fedramp"))

    return CodexAuth(
        access_token=access_token.strip(),
        account_id=account_id,
        is_fedramp_account=is_fedramp_account,
    )


def read_auth_json(auth_path: Path) -> dict[str, Any]:
    try:
        with auth_path.open("r", encoding="utf-8") as auth_file:
            auth_json = json.load(auth_file)
    except FileNotFoundError as error:
        raise CodexResetError(f"auth file not found: {auth_path}") from error
    except json.JSONDecodeError as error:
        raise CodexResetError(f"auth file is not valid JSON: {auth_path}") from error

    if not isinstance(auth_json, dict):
        raise CodexResetError(f"auth file must contain a JSON object: {auth_path}")
    return auth_json


def request_json(
    method: str,
    url: str,
    auth: CodexAuth,
    payload: dict[str, Any] | None = None,
) -> dict[str, Any]:
    request_body = None
    headers = auth.headers()
    if payload is not None:
        request_body = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"

    request = urllib.request.Request(url, data=request_body, headers=headers, method=method)
    try:
        response_body = urllib.request.urlopen(request, timeout=30).read()
    except urllib.error.HTTPError as error:
        body = error.read().decode("utf-8", errors="replace")
        if error.code == 401:
            raise CodexResetError(
                f"{method} {url} failed: HTTP 401. Your stored Codex auth may be stale; "
                "run `codex login` again or open Codex once to refresh auth."
            ) from error
        raise CodexResetError(f"{method} {url} failed: HTTP {error.code}: {body}") from error
    except urllib.error.URLError as error:
        raise CodexResetError(f"{method} {url} failed: {error}") from error

    try:
        decoded = json.loads(response_body.decode("utf-8"))
    except json.JSONDecodeError as error:
        body = response_body.decode("utf-8", errors="replace")
        raise CodexResetError(f"{method} {url} returned invalid JSON: {body}") from error

    if not isinstance(decoded, dict):
        raise CodexResetError(f"{method} {url} returned a non-object JSON response")
    return decoded


def print_usage_status(usage_status: dict[str, Any]) -> None:
    reset_credit_count = available_reset_credit_count(usage_status)

    print("Codex reset credits")
    print(f"  Available: {reset_credit_count}")
    print(f"  Status: {'reset available' if reset_credit_count else 'no reset available'}")

    plan_type = usage_status.get("plan_type")
    if isinstance(plan_type, str) and plan_type:
        print(f"  Plan: {plan_type}")

    rate_limit_reached = nested_get(usage_status, "rate_limit_reached_type", "type")
    if isinstance(rate_limit_reached, str) and rate_limit_reached:
        print(f"  Limit reached: {rate_limit_reached}")

    print_rate_limit("Codex rate limit", usage_status.get("rate_limit"))


def print_rate_limit(label: str, rate_limit: Any) -> None:
    if not isinstance(rate_limit, dict):
        return

    print(f"\n{label}")
    allowed = rate_limit.get("allowed")
    limit_reached = rate_limit.get("limit_reached")
    if isinstance(allowed, bool):
        print(f"  Allowed: {format_bool(allowed)}")
    if isinstance(limit_reached, bool):
        print(f"  Limit reached: {format_bool(limit_reached)}")

    print_window("Primary", rate_limit.get("primary_window"))
    print_window("Secondary", rate_limit.get("secondary_window"))


def print_window(label: str, window: Any) -> None:
    if not isinstance(window, dict):
        return

    details = []
    used_percent = window.get("used_percent")
    if isinstance(used_percent, (int, float)):
        details.append(f"{used_percent:g}% used")

    window_seconds = window.get("limit_window_seconds")
    if isinstance(window_seconds, int) and window_seconds > 0:
        details.append(f"{round_up_minutes(window_seconds)} minute window")

    reset_at = window.get("reset_at")
    if isinstance(reset_at, int) and reset_at > 0:
        details.append(f"resets at {format_epoch(reset_at)}")

    if details:
        print(f"  {label}: {', '.join(details)}")


def consume_reset_after_confirmation(
    auth: CodexAuth,
    usage_status: dict[str, Any],
    *,
    skip_confirmation: bool,
) -> None:
    reset_credit_count = available_reset_credit_count(usage_status)
    if reset_credit_count <= 0:
        raise CodexResetError("no reset credits are available")

    if not skip_confirmation:
        confirm_reset_consumption(reset_credit_count)

    consume_result = request_json(
        "POST",
        consume_url(),
        auth,
        payload={"redeem_request_id": str(uuid.uuid4())},
    )
    print_consume_result(consume_result)


def confirm_reset_consumption(reset_credit_count: int) -> None:
    print()
    print(f"This will consume 1 of your {reset_credit_count} available Codex reset credits.")
    print(f'Type "{CONFIRMATION_PHRASE}" to continue: ', end="", flush=True)
    entered_phrase = sys.stdin.readline().strip()
    if entered_phrase.casefold() != CONFIRMATION_PHRASE.casefold():
        raise CodexResetError("confirmation phrase did not match; reset was not consumed")


def print_consume_result(consume_result: dict[str, Any]) -> None:
    code = consume_result.get("code")
    windows_reset = consume_result.get("windows_reset", 0)

    if code == "reset":
        print(f"Reset consumed. Windows reset: {windows_reset}")
    elif code == "nothing_to_reset":
        print("No reset was consumed because there is nothing to reset.")
    elif code == "no_credit":
        print("No reset was consumed because no reset credits are available.")
    elif code == "already_redeemed":
        print("This reset request was already redeemed.")
    else:
        raise CodexResetError(f"unexpected consume response: {json.dumps(consume_result)}")


def available_reset_credit_count(usage_status: dict[str, Any]) -> int:
    value = nested_get(usage_status, "rate_limit_reset_credits", "available_count")
    if isinstance(value, int):
        return max(value, 0)
    if isinstance(value, str) and value.isdecimal():
        return int(value)
    return 0


def decode_jwt_payload(jwt: Any) -> dict[str, Any]:
    if not isinstance(jwt, str):
        return {}
    parts = jwt.split(".")
    if len(parts) < 2 or not parts[1]:
        return {}

    payload = parts[1]
    padding = "=" * (-len(payload) % 4)
    try:
        decoded = base64.urlsafe_b64decode(payload + padding)
        claims = json.loads(decoded.decode("utf-8"))
    except (ValueError, json.JSONDecodeError):
        return {}
    return claims if isinstance(claims, dict) else {}


def nested_get(value: Any, *keys: str) -> Any:
    current = value
    for key in keys:
        if not isinstance(current, dict):
            return None
        current = current.get(key)
    return current


def first_dict(*values: Any) -> dict[str, Any]:
    for value in values:
        if isinstance(value, dict):
            return value
    return {}


def first_non_empty(*values: Any) -> str | None:
    for value in values:
        if isinstance(value, str) and value.strip():
            return value.strip()
    return None


def string_or_none(value: Any) -> str | None:
    return value if isinstance(value, str) and value.strip() else None


def round_up_minutes(seconds: int) -> int:
    return (seconds + 59) // 60


def format_bool(value: bool) -> str:
    return "yes" if value else "no"


def format_epoch(epoch_seconds: int) -> str:
    return time.strftime("%Y-%m-%d %H:%M:%S %Z", time.localtime(epoch_seconds))


if __name__ == "__main__":
    raise SystemExit(main())
