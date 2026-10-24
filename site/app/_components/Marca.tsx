/**
 * O símbolo do Verdash (o V com as duas barras), com a mesma geometria do CRM
 * (`lib/branding/desenho.ts`, que a LP não pode importar). Os degradês moram em
 * `SimboloDefs`, montado uma vez no layout, para o mesmo `id` não repetir no
 * cabeçalho e no rodapé.
 */
const CAMINHOS = [
  "M64.4429 190L3.44288 68.5C-2.79251 57.7 0.844801 55.3333 3.44288 55.5H39.9429C47.1429 55.5 50.9429 62.5 51.9429 66C66.4429 96.6666 96.1429 159.4 98.9429 165C101.743 170.6 105.11 168.667 106.443 167C128.943 147.5 176.143 106.5 184.943 98.5C193.743 90.5 193.61 98.1666 192.443 103C178.086 131 147.985 189.4 142.443 199C136.9 208.6 128.133 211.667 124.443 212H88.9429C75.3429 212 66.9429 197.333 64.4429 190Z",
  "M139.443 5C139.443 2.23857 141.681 0 144.443 0H187.443C190.204 0 192.443 2.23858 192.443 5V71.644C192.443 73.0722 191.832 74.4322 190.765 75.3811L147.765 113.603C144.54 116.469 139.443 114.18 139.443 109.866V5Z",
  "M82.4429 51C82.4429 48.2386 84.6814 46 87.4429 46H121.443C124.204 46 126.443 48.2386 126.443 51V128.763C126.443 130.186 125.836 131.542 124.775 132.491L107.94 147.534C105.447 149.762 101.511 148.962 100.086 145.937L82.92 109.512C82.6058 108.846 82.4429 108.118 82.4429 107.381V51Z",
] as const;

export function SimboloDefs() {
  return (
    <svg width="0" height="0" className="absolute" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient
          id="vg0"
          gradientUnits="userSpaceOnUse"
          x1="0"
          y1="133.746"
          x2="193.007"
          y2="133.746"
        >
          <stop offset="0" stopColor="#1042F6" />
          <stop offset="1" stopColor="#00FFB0" />
        </linearGradient>
        <linearGradient
          id="vg1"
          gradientUnits="userSpaceOnUse"
          x1="139.443"
          y1="0"
          x2="165.943"
          y2="121"
        >
          <stop offset="0.331731" stopColor="#FF3871" />
          <stop offset="1" stopColor="#FF6F1B" />
        </linearGradient>
        <linearGradient
          id="vg2"
          gradientUnits="userSpaceOnUse"
          x1="82.4429"
          y1="46"
          x2="104.443"
          y2="152"
        >
          <stop offset="0.456731" stopColor="#FF3871" />
          <stop offset="1" stopColor="#FF6F1B" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export function Simbolo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 193 212" className={className} aria-hidden="true" focusable="false">
      {CAMINHOS.map((d, i) => (
        <path key={i} d={d} fill={`url(#vg${i})`} />
      ))}
    </svg>
  );
}

export function Logotipo({ className }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 sm:gap-2.5 ${className ?? ""}`}>
      <Simbolo className="h-6 w-auto sm:h-7" />
      <span className="text-base leading-none tracking-tight whitespace-nowrap text-text-muted sm:text-[1.15rem]">
        <b className="font-bold text-text">Verdash</b> CRM
      </span>
    </span>
  );
}
