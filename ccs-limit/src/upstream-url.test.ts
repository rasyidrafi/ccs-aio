import { describe, expect, test } from "bun:test";
import {
  getAbsoluteRequestTarget,
  getRequestPath,
  isUnsafeAbsoluteRequestTarget,
  resolveUpstreamUrl,
} from "./upstream-url";

describe("resolveUpstreamUrl", () => {
  test("keeps origin-form requests on the configured upstream", () => {
    expect(
      resolveUpstreamUrl("/v1/responses?stream=true", "http://127.0.0.1:8097")
        .href,
    ).toBe("http://127.0.0.1:8097/v1/responses?stream=true");
  });

  test("does not allow an absolute-form target to override the upstream", () => {
    expect(
      resolveUpstreamUrl(
        "http://attacker.example:8080/private?x=1",
        "http://127.0.0.1:8097",
      ).href,
    ).toBe("http://127.0.0.1:8097/private?x=1");
  });

  test("does not allow a scheme-relative target to override the upstream", () => {
    expect(
      resolveUpstreamUrl("//attacker.example/private", "http://127.0.0.1:8097")
        .href,
    ).toBe("http://127.0.0.1:8097/private");
  });
});

describe("getAbsoluteRequestTarget", () => {
  test("extracts origin-form path and query from an absolute URL", () => {
    expect(
      getAbsoluteRequestTarget("http://127.0.0.1:8098/v1/models?raw=true"),
    ).toBe("/v1/models?raw=true");
    expect(getAbsoluteRequestTarget("https://example.com")).toBe("/");
  });
});

describe("getRequestPath", () => {
  test("extracts a path without allocating a URL object", () => {
    expect(getRequestPath("/v1/responses?stream=true")).toBe("/v1/responses");
    expect(getRequestPath("/health#ignored")).toBe("/health");
    expect(getRequestPath(undefined)).toBe("/");
  });
});

describe("isUnsafeAbsoluteRequestTarget", () => {
  test("accepts normal reverse-proxy request targets", () => {
    expect(isUnsafeAbsoluteRequestTarget("/v1/responses?stream=true")).toBe(
      false,
    );
    expect(isUnsafeAbsoluteRequestTarget("*")).toBe(false);
  });

  test("rejects forward-proxy request targets", () => {
    expect(isUnsafeAbsoluteRequestTarget("http://attacker.example/path")).toBe(true);
    expect(isUnsafeAbsoluteRequestTarget("HTTPS://attacker.example/path")).toBe(true);
    expect(isUnsafeAbsoluteRequestTarget("//attacker.example/path")).toBe(true);
  });
});
