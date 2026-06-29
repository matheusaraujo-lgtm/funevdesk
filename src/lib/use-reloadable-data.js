"use client";

import { useCallback, useEffect, useState } from "react";

// Encapsula o padrão de carregamento de dados via fetch usado nas telas de lista:
// dispara o fetcher na montagem (e quando ele muda) e expõe reload().
// O fetcher deve ser estável — envolva-o em useCallback no componente, declarando
// ali as dependências reais (ex.: branchId). A telona de loading inicia em true.
export function useReloadableData(fetcher) {
  const [loading, setLoading] = useState(true);

  const reload = useCallback(() => {
    setLoading(true);
    return Promise.resolve(fetcher()).finally(() => setLoading(false));
  }, [fetcher]);

  useEffect(() => {
    // Data-fetching client-side intencional: dispara o carregamento na montagem.
    // O setLoading(true) síncrono é aceitável aqui e fica centralizado neste hook,
    // evitando a mesma supressão repetida em dezenas de telas de lista.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    reload();
  }, [reload]);

  return { loading, reload };
}
