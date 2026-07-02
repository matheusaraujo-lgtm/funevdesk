// Converte o `logo_url` ARMAZENADO (forma canônica "/uploads/<arquivo>", ou um link
// externo "https://...") na URL que o NAVEGADOR deve usar para carregar a logo.
//
// Por que existe: no modo `output: "standalone"` do Next, arquivos gravados em
// public/uploads/ em runtime NÃO são servidos estaticamente — e o servidor estático
// ainda "captura" /uploads/* antes de qualquer route handler. Então a logo é entregue
// por /api/branding/logo/<arquivo>, que nunca colide com public/.
export function toServableLogoUrl(stored) {
  if (!stored) return "";
  if (stored.startsWith("/uploads/")) {
    return `/api/branding/logo/${stored.slice("/uploads/".length)}`;
  }
  return stored; // já é /api/branding/logo/... ou um link externo
}
