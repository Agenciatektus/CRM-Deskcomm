/** Menu "+" do composer: galeria e câmera são entradas distintas (só a câmera leva `capture`). */
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AttachMenu } from "./AttachMenu";

vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (s: string) => s }));

describe("AttachMenu", () => {
  it("a galeria não tem capture e a câmera tem", () => {
    const { container } = render(<AttachMenu onPick={vi.fn()} />);
    const midia = [...container.querySelectorAll<HTMLInputElement>('input[accept="image/*,video/*"]')];
    expect(midia).toHaveLength(2);
    expect(midia.filter((i) => i.hasAttribute("capture"))).toHaveLength(1);
    expect(midia.find((i) => i.hasAttribute("capture"))?.getAttribute("capture")).toBe("environment");
  });
});
