import { describe, expect, it } from "vitest";

import { ponteDeVolta } from "@/lib/http/ponte-de-volta";

describe("ponteDeVolta", () => {
  it("responde 200 (não 302) e navega por location.replace", async () => {
    const res = ponteDeVolta("https://crm.exemplo/app/x?a=1&b=2");
    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
    expect(await res.text()).toContain('location.replace("https://crm.exemplo/app/x?a=1&b=2")');
  });

  it("escapa o destino no HTML do noscript", async () => {
    const corpo = await ponteDeVolta('https://x/?a=1&b="<"').text();
    expect(corpo).toContain("a=1&amp;b=&quot;&lt;&quot;");
    expect(corpo).not.toContain('url=https://x/?a=1&b="');
  });
});
