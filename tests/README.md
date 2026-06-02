# Testes - opencode-qwencode-auth

Este diretório contém todos os testes do plugin, organizados por categoria.

## 📁 Estrutura

```
tests/
├── unit/                    # Testes unitários formais (bun test)
│   ├── auth-integration.test.ts
│   ├── errors.test.ts
│   ├── file-lock.test.ts
│   ├── oauth.test.ts
│   ├── request-queue.test.ts
│   └── token-manager.test.ts
│
├── integration/             # Testes de integração manuais
│   ├── debug.ts             # End-to-end com API Qwen real
│   └── race-condition.ts    # Concorrência entre processos
│
└── robust/                  # Stress tests
    ├── runner.ts            # Orquestrador de testes robustos
    └── worker.ts            # Worker para testes multi-processo
```

## 🧪 Testes Unitários

**Execução:**
```bash
bun test                    # Todos os testes
bun test --watch            # Watch mode
bun test unit/              # Apenas testes unitários
bun test <arquivo>          # Teste específico
```

**Cobertura:**
- `errors.test.ts` - Sistema de erros e classificação (30+ testes)
- `oauth.test.ts` - PKCE, OAuth helpers, constants (20+ testes)
- `request-queue.test.ts` - Throttling e rate limiting (15+ testes)
- `token-manager.test.ts` - Gerenciamento de tokens (10+ testes)
- `file-lock.test.ts` - File locking mechanism (20+ testes)
- `auth-integration.test.ts` - Integração de componentes (15+ testes)

**Total:** 100+ testes automatizados

## 🔬 Testes de Integração (Manuais)

### Debug (End-to-End)

Testa o sistema completo com a API Qwen real.

**Pré-requisitos:**
- Login realizado (`opencode auth login`)
- Credenciais válidas

**Execução:**
```bash
bun run test:integration
# OU
bun run tests/integration/debug.ts full
```

**Testes incluídos:**
- PKCE generation
- Base URL resolution
- Credentials persistence
- Token expiry check
- Token refresh
- Retry mechanism
- Throttling
- TokenManager
- 401 recovery
- **Real Chat API call** (requer login)

### Race Condition

Testa concorrência entre múltiplos processos do plugin.

**Execução:**
```bash
bun run test:race
# OU
bun run tests/integration/race-condition.ts
```

**O que testa:**
- Dois processos tentando refresh simultâneo
- File locking previne race conditions
- Recuperação de locks stale

## 💪 Stress Tests (Robust)

Testes de alta concorrência e cenários extremos.

**Execução:**
```bash
bun run test:robust
# OU
bun run tests/robust/runner.ts
```

**Testes incluídos:**
1. **Race Condition (2 processos)** - Concorrência básica
2. **Stress Concurrency (10 processos)** - Alta concorrência
3. **Stale Lock Recovery** - Recuperação de locks abandonados
4. **Corrupted File Recovery** - Arquivo de credenciais corrompido

**Duração:** ~30-60 segundos

## 📊 Scripts package.json

```json
{
  "scripts": {
    "test": "bun test",
    "test:watch": "bun test --watch",
    "test:integration": "bun run tests/integration/debug.ts full",
    "test:race": "bun run tests/integration/race-condition.ts",
    "test:robust": "bun run tests/robust/runner.ts"
  }
}
```

## 🎯 Quando usar cada tipo

| Tipo | Quando usar | Requer login? | Automatizado? |
|------|-------------|---------------|---------------|
| **Unitários** | CI/CD, desenvolvimento diário | ❌ Não | ✅ Sim |
| **Integration (debug)** | Validação manual, troubleshooting | ✅ Sim | ❌ Não |
| **Race Condition** | Desenvolvimento de features novas | ❌ Não | ❌ Não |
| **Robust** | Validação pré-release | ❌ Não | ❌ Não |

## 🔍 Debug de Testes

**Habilitar logs detalhados:**
```bash
OPENCODE_QWEN_DEBUG=1 bun test
```

**Verbose mode no debug.ts:**
```bash
OPENCODE_QWEN_DEBUG=1 bun run tests/integration/debug.ts full
```

## 📝 Adicionando Novos Testes

1. **Testes unitários:** Crie `tests/unit/<nome>.test.ts`
2. **Testes de integração:** Crie `tests/integration/<nome>.ts`
3. **Use `bun:test`:**
   ```typescript
   import { describe, it, expect, mock } from 'bun:test';
   ```

## ⚠️ Notas Importantes

1. **Testes unitários** não modificam credenciais reais
2. **Testes de integração** podem modificar credenciais (usam cópias de teste)
3. **Stress tests** criam locks temporários e os limpam automaticamente
4. **Sempre rode** `bun test` antes de commitar
