/** O motivo que o admin digitou ao suspender aparece no banner; sem ele, o aviso de sempre. */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SuspendedBanner } from "./SuspendedBanner";

describe("SuspendedBanner", () => {
  it("mostra o motivo gravado", () => {
    render(<SuspendedBanner suspendedAt={new Date().toISOString()} reason="Empresa de teste, pagamento reembolsado" />);
    expect(screen.getByText("Empresa de teste, pagamento reembolsado")).toBeTruthy();
    expect(screen.queryByText("Sem razão registrada.")).toBeNull();
  });

  it("sem motivo, diz que não há razão registrada", () => {
    render(<SuspendedBanner suspendedAt={new Date().toISOString()} />);
    expect(screen.getByText("Sem razão registrada.")).toBeTruthy();
  });
});
