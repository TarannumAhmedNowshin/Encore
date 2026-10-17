import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ACCOUNT_ORBIT_EVENT, useAccountView } from "@/hooks/use-account-view";

beforeEach(() => sessionStorage.clear());
afterEach(cleanup);

describe("Accounts session view", () => {
  it.each(["demo", "normal-analysis"])("defaults %s to Orbit without saving an automatic choice", (id) => {
    const { result } = renderHook(() => useAccountView(id));
    expect(result.current[0]).toBe("orbit");
    expect(sessionStorage.getItem(`encore:account-view:${id}`)).toBeNull();
  });

  it.each(["list", "quadrant"] as const)("remembers an explicit %s choice only in this session", (choice) => {
    const first = renderHook(() => useAccountView("demo"));
    act(() => first.result.current[1](choice));
    first.unmount();
    const next = renderHook(() => useAccountView("demo"));
    expect(next.result.current[0]).toBe(choice);
    next.unmount();
    sessionStorage.clear();
    const fresh = renderHook(() => useAccountView("demo"));
    expect(fresh.result.current[0]).toBe("orbit");
  });

  it("tour opens Orbit without saving over the user's choice", () => {
    const { result } = renderHook(() => useAccountView("demo"));
    act(() => result.current[1]("list"));
    act(() => window.dispatchEvent(new Event(ACCOUNT_ORBIT_EVENT)));
    expect(result.current[0]).toBe("orbit");
    expect(sessionStorage.getItem("encore:account-view:demo")).toBe("list");
  });
});