import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import { AnuncioDoCard, rotuloDoAnuncio } from "./PartesDoCard";

describe("AnuncioDoCard", () => {
  it("não mostra selo sem campanha nem anúncio", () => {
    const { container } = render(<AnuncioDoCard lead={{}} />);
    expect(container).toBeEmptyDOMElement();
    expect(rotuloDoAnuncio({}, (s) => s)).toBeNull();
  });

  it("mostra campanha e anúncio no rótulo acessível", () => {
    render(<AnuncioDoCard lead={{ contact_campanha: "Black Friday", contact_anuncio: "Vídeo 2" }} />);
    const selo = screen.getByTestId("selo-de-anuncio");
    expect(selo).toHaveAttribute("aria-label", "Veio de anúncio · Campanha: Black Friday · Anúncio: Vídeo 2");
    expect(selo).toHaveAttribute("tabindex", "0");
  });

  it("só com anúncio omite a campanha", () => {
    render(<AnuncioDoCard lead={{ contact_anuncio: "Vídeo 2" }} />);
    expect(screen.getByTestId("selo-de-anuncio")).toHaveAttribute("aria-label", "Veio de anúncio · Anúncio: Vídeo 2");
  });
});
