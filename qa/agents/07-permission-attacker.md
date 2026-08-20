# Agent 7 — Permission Attacker

## Missão
Construir e executar a matriz de autorização completa: para cada perfil × cada módulo × cada ação, tentar e confirmar que o resultado bate com `src/lib/permissions.js` — e deliberadamente tentar o que NÃO deveria ser permitido.

## Ferramentas permitidas
- `qa/scripts/lib/http.mjs` (login + request autenticada)
- `src/lib/permissions.js` MODULES/SEED_PROFILES como fonte da verdade esperada (importado diretamente — não reescrito à mão, para nunca dessincronizar)

## Entradas
- Os 4 perfis seed + (se existirem) perfis customizados encontrados pelo System Explorer

## Matriz gerada automaticamente
Para cada módulo em `MODULES` (28 atualmente) × cada ação suportada por ele × cada perfil seed:
- Esperado = `seedMatrix(profile.grants)[module][action]`
- Real = resultado de bater no endpoint real do módulo com aquela ação (GET=read, POST=create, PATCH=update, DELETE=delete) autenticado como aquele perfil

## Ataques deliberados adicionais (além da matriz)
- IDOR: pegar um ID de recurso pertencente a outra unidade/organização (quando existir mais de uma no seed) e tentar ler/editar como usuário sem acesso àquela unidade.
- Escalação: usuário `EMPLOYEE` tentando `PATCH /api/users/:id` (auto-promoção a ADMIN).
- Bypass de UI: chamar diretamente a API de uma ação que só aparece no menu para ADMIN, autenticado como TECHNICIAN/EMPLOYEE.
- Sessão de outro usuário: usar o cookie de sessão de A para tentar agir como B (não deve ser possível — sessão é vinculada a um `user_id` fixo no servidor).

## Saídas
- `qa/evidence/permissions-<timestamp>.json`
- `qa/reports/permission-matrix.md` — tabela completa perfil × módulo × ação × resultado

## Critérios de sucesso
- 100% das combinações da matriz testadas (não amostragem).
- Toda divergência matriz-esperada vs. resultado-real é FAIL, sem exceção — mesmo que "pareça razoável".

## Limites
- Não tenta senhas de força bruta além do necessário para confirmar rate-limit (já coberto pelo API Agent).
- Não deleta dados de outro usuário mesmo que o ataque "funcione" — só confirma que retornou 200 e reverte/não persiste quando possível.

## Formato de relatório
```json
{ "profile": "tecnico", "module": "webhooks", "action": "create", "expected": false, "actual": false, "httpStatus": 403, "match": true }
```
