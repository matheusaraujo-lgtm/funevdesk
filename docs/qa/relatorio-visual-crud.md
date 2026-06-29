# Relatório de Auditoria Visual + CRUD — FunevDesk

> Auditor: agente auditor-visual-crud. Data: 2026-06-27. Ambiente: dev server :3000.
> Peles testadas: admin (admin@local), técnico (tecnico@local), usuário final (usuario@local).
> Viewports: 375 / 768 / 1366 / 1920. Medições por getComputedStyle / getBoundingClientRect / canvas (contraste WCAG).
> Método: navegação real + pointer events (base-ui), CRUD exercido com preview_fill/eval, persistência conferida por reload e por GET/DELETE de API.

---

## 1. Resumo executivo

- **Nota visual geral: 8,0/10.** Design system maduro e consistente (h1 28px/700, subtítulo 14px/400, cards radius 16px, padding de página 32/36px, contrastes WCAG aprovados). Perde pontos em pequenos órfãos de escala (badge 9px, card 14px no portal) e em inconsistências de padrão de ação entre telas.
- **Nota de robustez do CRUD: 7,5/10.** O núcleo (chamado, usuário, equipe, unidade, localização, problema, mudança, KB, documentação, modelo de termo, automação, webhook, estoque, rede, perfil) cria/lê/edita/persiste de verdade no servidor. Perde pontos por: (a) listas que não refrescam após Update/Delete; (b) `window.confirm()` nativo em 8 telas; (c) ausência de exclusão em Situações e Itens de estoque; (d) feedback de sucesso inconsistente.
- **Os 5 problemas que mais saltam:**
  1. `window.confirm()` nativo na exclusão de KB/Documentação/Termos/Rede/Impressoras (bloqueou a própria sessão de teste) — inconsistente com o AlertDialog estilizado do resto.
  2. Refresh de lista ausente após Update/Delete (Usuários, Equipes, Localizações, Categorias, Problemas) — o dado persiste, mas a tela só atualiza no reload.
  3. Redundância de "Abrir chamado" no PORTAL DO COLABORADOR: na tela "Abrir chamado", a aba de navegação e o botão de submit são ambos azuis primários com o mesmo texto.
  4. Situações de chamado e Itens de estoque não têm exclusão (DELETE de estoque retorna 405); registros de teste acumulam (16 webhooks, 19 monitores de rede na base).
  5. Validação de KB/Modelo de termo mostra toast genérico ("Artigo inválido."/"Dados inválidos.") sem indicar inline o campo faltante.

---

## 2. Erros visuais (medidos)

| Tela | Elemento | Problema | Valor atual → proposto | Categoria | Sev |
|---|---|---|---|---|---|
| Fila de chamados | Badge "Você" no avatar do responsável | Fonte minúscula | **9px** → 11–12px | Tipografia | Baixo |
| Portal · Abrir chamado | Cards de tipo de chamado | Padding fora do grid 4/8 | **14px** → 12 ou 16px | Espaçamento | Baixo |
| Geral (admin+portal) | Título de página (h1) | 28px fora da escala sugerida 24/26, mas usado de forma consistente como token único | **28px/700** | Tipografia | Baixo |
| Forms (Nova equipe, KB, Documentação) | inputs | Rótulo em `<p>` solto, sem `<label htmlFor>` — leitor de tela não associa | sem rótulo semântico → `<label>` | A11y | Médio |
| Meus chamados (portal) | Badge de contagem "1" | Estilizado como botão primário azul (compete visualmente com o CTA) | bg azul → badge neutro | Cor | Baixo |

**Contrastes medidos (todos aprovados AA):** subtítulo/muted rgb(96,103,110) sobre branco = **5,73:1**; botão primário branco sobre azul rgb(36,98,245) = **5,07:1**. Sem problema de contraste detectado.

**Responsivo:** 375 (mobile) e 1366 sem overflow horizontal (scrollWidth = clientWidth); a tabela densa de chamados é trocada por cards < md, sem elementos estourando. Sem sobreposições detectadas.

---

## 3. Excesso de botões & CTAs

| Tela | Ação | Nº na viewport | Manter como primário | Rebaixar/Remover |
|---|---|---|---|---|
| Dashboard (admin) | Abrir chamado | 1 (topbar) | topbar | — (sem excesso) |
| Fila de chamados (admin) | Abrir chamado | 1 (topbar) | topbar | — |
| **Portal · Abrir chamado** | Abrir chamado | **2 azuis primários** (aba de nav + botão submit, mesmo texto) | botão submit do formulário | rebaixar a **aba de nav**: renomear p/ "Novo chamado" ou tirar o azul primário (deixar só ativo) |
| Portal · Meus chamados | Abrir chamado | 1 primário no main (+ aba de nav não-primária) | CTA do main | ok |
| Portal · Central de Ajuda | Abrir chamado | 0 no main (só aba de nav) | — | ok |

> **Veredito sobre o foco do dono:** nas peles admin/técnico, "Abrir chamado" aparece **uma única vez** por viewport (topbar contextual) — o receio NÃO se confirma ali. O excesso real está **no portal do colaborador**, na tela "Abrir chamado", onde a aba de navegação e o botão de envio usam **o mesmo verbo e o mesmo azul primário**. Recomendo diferenciar (aba = "Novo chamado" sem preenchimento azul; submit = "Abrir chamado" azul). Nenhuma outra tela apresentou 2+ primários disputando no main.

---

## 4. CRUD por módulo

| Módulo | Create | Read | Update | Delete | Validação |
|---|---|---|---|---|---|
| Chamado | ✅ #1047 (toast "Chamado #1047 criado.") | ✅ detalhe c/ conversa, abas Público/Interno/Histórico | ✅ Assumir→"Em atendimento"; resposta pública no thread; Resolver→Concluídos (persistiu após reload) | n/d (fluxo é resolver/fechar) | ✅ inline pt-BR ("título ≥5 caracteres", local obrigatório) |
| Usuário | ✅ "Usuário criado." + senha temporária | ✅ Editar prefilla nome/e-mail | ✅ nome editado persiste (sem toast no save) | ✅ confirm c/ aviso de vínculos; removido no servidor (lista só refresca após reload) | ✅ inline + toast "Revise os campos destacados." |
| Equipe | ✅ "Equipe criada." | ✅ prefilla nome/descrição | ✅ "Equipe atualizada." | ✅ "Equipe excluída." (confirm c/ vínculos) | ⚠️ inputs sem rótulo; dup não testado |
| Unidade | ✅ aparece na lista | ✅ prefilla | ✅ persiste (refresca) | ✅ confirm c/ vínculos | ✅ selects obrigatórios |
| Localização | ✅ (server ok; lista refresca só após reload) | ✅ prefilla (loc-edit-name) | ✅ persiste no servidor | ✅ confirm; removido | ⚠️ sem toast no create |
| Categoria | ✅ "Categoria criada." | n/d (sem form de leitura) | ⚠️ via toggle "Desativar" | ✅ "Categoria removida." | ⚠️ dup não testado |
| Situação | ✅ "Situação criada." | inline | ✅ inline autosave ("Salvo") | ⛔ **SEM controle de exclusão** (acumulam) | ⚠️ |
| Problema | ✅ "Problema registrado." | ✅ #103 prefilla | ✅ persiste (server) | ✅ "Problema excluído." | ⚠️ dup não testado |
| Mudança | ✅ "Mudança registrada." | ✅ #104 prefilla | ✅ persiste (server) | ✅ "Mudança excluída." | ⚠️ |
| Artigo KB | ✅ "Artigo publicado." | ✅ detalhe (Editar dados/conteúdo) | ✅ "Artigo atualizado." | ⚠️ DELETE 200 mas **window.confirm() nativo** | ⚠️ toast genérico "Artigo inválido." SEM inline |
| Documentação | ✅ "Documentação salva." | ✅ detalhe | ✅ "Documentação atualizada." | ⚠️ DELETE 200 mas **window.confirm() nativo** | ⚠️ |
| Modelo de termo | ✅ "Modelo criado." | ✅ detalhe | ✅ "Modelo atualizado." | ✅ DELETE 200 (UI usa confirm) | ⚠️ toast genérico "Dados inválidos." SEM inline |
| Automação | ✅ "Regra criada." | ✅ dialog edição prefilla | ✅ dialog de edição abre | ✅ DELETE 200 | ✅ "Defina ao menos uma ação (equipe ou responsável)." |
| Webhook | ✅ "Webhook criado." | ✅ Editar prefilla | ✅ "Webhook atualizado." | ✅ DELETE 200 (menu tem Excluir) | ✅ "Preencha nome, URL e ao menos um evento." |
| Item de estoque | ✅ "Item cadastrado." + Movimentar (entrada 25→35, "Entrada registrada.") | ✅ | ✅ "Item atualizado." | ⛔ **DELETE 405** — sem exclusão | ⚠️ |
| Perfil | ✅ "Perfil criado. Ajuste as permissões e salve." | ✅ matriz por tela | ✅ (salvar permissões) | ✅ DELETE 200 | ⚠️ |
| Ativo / Impressora | n/d (inventariados pelo agente) | ✅ lista/detalhe; Importar/Exportar/Modelo | n/d | n/d | n/d |
| Configurações gerais | n/d | ✅ abas Marca/SLA & horário/Sistema/Agente Windows | ✅ "Configurações salvas." | n/d | — |
| Auditoria | n/d | ✅ 51 registros, refletindo as ações de QA (ex.: "Excluiu name: Atendente QA") | n/d | n/d | — |

**Resumo CRUD:** módulos exercitados com mutação = 16. Com ciclo aplicável **100% verde** (Create/Read/Update/Delete + Validação, dentro do que faz sentido): Chamado, Usuário, Equipe, Unidade, Localização, Problema, Mudança, Automação, Webhook, Perfil → **10**. Com falha/lacuna: Categoria (sem form de leitura), Situação (sem delete), Artigo KB (confirm nativo + validação genérica), Documentação (confirm nativo), Modelo de termo (validação genérica), Item de estoque (sem delete/405) → **6**.

---

## 5. Bugs

- **[Médio] `window.confirm()` nativo na exclusão** — 8 componentes (knowledge-detail-view.jsx:66, documentation-detail-view.jsx, term-detail-view.jsx, terms-view.jsx, knowledge-view.jsx, documentation-view.jsx, network-view.jsx, printers-view.jsx). É o diálogo do navegador, inconsistente com o `AlertDialog` estilizado do restante; **bloqueou o event loop** durante o teste (precisei reiniciar o preview). Reproduzir: KB → abrir artigo → Excluir. Esperado: AlertDialog estilizado. Obtido: confirm() nativo do Chrome.
- **[Médio] Lista não refresca após Update/Delete** — Usuários (linha deletada permanece até reload), Equipes (update mantém nome antigo), Localizações/Categorias/Problemas (item criado/editado só aparece após reload). Servidor persiste corretamente (conferido por GET). Provável: falta refetch pós-mutação (vide hook useReloadableData citado no MEMORY). Sistêmico.
- **[Médio] Sem exclusão em Situações e Itens de estoque** — Situação de chamado não tem botão de excluir (situações de testes antigos como "QA Auditoria Situação" acumulam); Item de estoque: `DELETE /api/inventory/:id` → **405**. Webhooks (16) e monitores de rede (19) também acumulam lixo de teste por não haver limpeza.
- **[Médio] Validação genérica sem inline** — KB ("Artigo inválido.") e Modelo de termo ("Dados inválidos.") retornam só toast, sem marcar qual campo (categoria/título/conteúdo) está faltando. Diverge dos demais forms, que mostram erro inline.
- **[Baixo] Resolver chamado sem feedback** — ao confirmar a resolução, o diálogo fecha sem toast de sucesso e a sidebar não atualiza o status na hora (só após reload aparece em "Concluídos"). Esperado: toast "Chamado resolvido" + pill atualizado.
- **[Baixo] Feedback de sucesso inconsistente** — create dá toast em quase tudo; update/delete às vezes não (Usuário, Localização, Unidade no save sem toast).
- **[Baixo] Copy de confirmação de exclusão inconsistente** — Localização/Problema/KB dizem "Esta ação não pode ser desfeita"; Unidade/Equipe/Usuário dizem "só será concluída se não houver registros vinculados" (mais informativo). Padronizar para a versão que avisa sobre vínculos.

---

## 6. Usabilidade & microcopy (pt-BR)

Pontos fortes: validações de chamado/usuário/unidade/automação/webhook em pt-BR claro e específico; placeholders com exemplos úteis ("Ex.: Filial Campinas", "172.16.3.1"); confirmações de exclusão com aviso de vínculos.

| De (atual) | Para (proposto) | Motivo |
|---|---|---|
| Toast "Artigo inválido." / "Dados inválidos." | Erro inline no campo: "Informe a categoria", "Conteúdo precisa de ao menos 5 caracteres" | Diz ao usuário o que corrigir |
| Aba de nav do portal "Abrir chamado" (azul) | "Novo chamado" (sem preenchimento azul) | Evita dois "Abrir chamado" azuis na mesma tela |
| (Resolver) sem feedback | Toast "Chamado resolvido." + atualizar pill | Confirmação visível da ação |
| "Esta ação não pode ser desfeita." (KB/Loc/Prob) | "A exclusão só é permitida se não houver registros vinculados." | Padroniza e informa o motivo de falhas |

---

## 7. Consistência entre telas

- **Coeso:** h1 28px/700, subtítulo 14px/400 rgb(96,103,110), cards radius 16px, padding de página 32/36px, primário azul rgb(36,98,245). Portal e admin compartilham o mesmo token de header.
- **Divergente — padrão de ação por linha:** menu "Ações" (Usuários, Equipes, Unidades, Problemas, Mudanças, Webhooks) vs. ícones diretos Editar/Excluir (Localizações, Categorias) vs. edição inline sem exclusão (Situações) vs. cards com botões (Automações). Unificar em um padrão (recomendo menu "Ações" em todas as listas).
- **Divergente — diálogo de exclusão:** AlertDialog estilizado na maioria, mas `window.confirm()` nativo em KB/Docs/Termos/Rede/Impressoras.
- **Divergente — feedback de mutação:** ver bugs (toast inconsistente).
- **Divergente — controles de submit:** uns dizem "Criar X", outros "Cadastrar X", outros "Salvar", "Registrar", "Publicar". Aceitável, mas poderia padronizar "Criar/Salvar".

---

## 8. Top 10 ações priorizadas (impacto × esforço)

1. **Trocar `window.confirm()` por AlertDialog** nas 8 telas (KB/Docs/Termos/Rede/Impressoras). Impacto alto (consistência + não trava UI), esforço baixo. Padrão Linear/Stripe.
2. **Refetch após Update/Delete** em todas as listas (adotar useReloadableData onde falta). Impacto alto (confiança no sistema), esforço médio.
3. **Diferenciar os dois "Abrir chamado" do portal** (aba = "Novo chamado" neutra; submit = azul). Impacto médio-alto na clareza, esforço baixo. Atende diretamente o pedido do dono.
4. **Validação inline em KB e Modelo de termo** (substituir toast genérico). Impacto médio, esforço baixo.
5. **Habilitar exclusão de Situações e Itens de estoque** (ou desativação explícita) + limpar lixo de teste acumulado. Impacto médio, esforço médio.
6. **Toast de sucesso padrão em toda mutação** (create/update/delete), incluindo Resolver chamado + atualizar pill na hora. Impacto médio, esforço baixo.
7. **Padronizar a copy de confirmação de exclusão** para a versão que avisa sobre vínculos. Impacto baixo-médio, esforço baixo.
8. **Unificar o padrão de ações por linha** (menu "Ações" em todas as listas). Impacto médio (consistência), esforço médio.
9. **Acessibilidade dos forms:** trocar rótulos `<p>` por `<label htmlFor>` (Equipe, KB, Documentação). Impacto médio (a11y), esforço baixo.
10. **Polir órfãos de escala:** badge 9px → 11–12px; card do portal 14px → 16px; remover azul primário do badge de contagem. Impacto baixo (refinamento), esforço baixo.
