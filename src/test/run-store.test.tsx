import { act, renderHook } from "@testing-library/react";
import { expect, it } from "vitest";
import { useRunState } from "@/lib/encore/run-store";

it("keeps an array default snapshot stable when hover or selection rerenders the page", () => {
  const { result, rerender } = renderHook(() => useRunState<string[]>("snapshot-regression", []));
  const initial = result.current[0];
  rerender();
  expect(result.current[0]).toBe(initial);
  act(() => result.current[1]((old) => [...old, "contact"]));
  expect(result.current[0]).toEqual(["contact"]);
});