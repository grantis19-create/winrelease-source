import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ScrollToHash } from "./ScrollToHash";

describe("ScrollToHash", () => {
  afterEach(() => vi.restoreAllMocks());

  it("scrolls the element named by the fragment into view", async () => {
    const target = document.createElement("section");
    target.id = "testing";
    const scroll = vi.fn();
    target.scrollIntoView = scroll;
    document.body.appendChild(target);
    render(
      <MemoryRouter initialEntries={["/help#testing"]}>
        <ScrollToHash />
      </MemoryRouter>,
    );
    await vi.waitFor(() =>
      expect(scroll).toHaveBeenCalledWith({ block: "start" }),
    );
    target.remove();
  });

  it("does nothing without a fragment", () => {
    const spy = vi.spyOn(window, "setInterval");
    render(
      <MemoryRouter initialEntries={["/help"]}>
        <ScrollToHash />
      </MemoryRouter>,
    );
    expect(spy).not.toHaveBeenCalled();
  });
});
