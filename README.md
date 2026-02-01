# opencode-qwen-auth

Plugin de autenticação OAuth para [OpenCode CLI](https://opencode.ai) que permite usar modelos Qwen3-Coder através da sua conta [qwen.ai](https://chat.qwen.ai) com **2.000 requisições gratuitas por dia**.

## Funcionalidades

- **OAuth Device Flow** - Autenticação segura via navegador (RFC 8628)
- **Polling Automático** - Detecta automaticamente quando você autoriza no navegador
- **2.000 req/dia grátis** - Sem necessidade de cartão de crédito
- **1M de contexto** - Modelos com janela de contexto de 1 milhão de tokens
- **Auto-refresh** - Renova tokens automaticamente quando expiram
- **Compatível com qwen-code** - Reutiliza credenciais existentes de `~/.qwen/oauth_creds.json`

## Instalação

### 1. Adicione o plugin ao OpenCode

Edite `~/.opencode/package.json`:

```json
{
  "dependencies": {
    "opencode-qwen-auth": "github:gustavodiasdev/opencode-qwen-auth"
  }
}
```

Edite `~/.opencode/opencode.jsonc`:

```json
{
  "plugin": ["opencode-qwen-auth"]
}
```

### 2. Instale as dependências

```bash
cd ~/.opencode && npm install
```

### 3. Autentique

Inicie o OpenCode e selecione o provider **Qwen Code**:

```bash
opencode
```

Ou via linha de comando (selecione "Other" e digite `qwen-code`):

```bash
opencode auth login
```

Escolha **"Qwen Code (qwen.ai OAuth)"** e autorize no navegador.

### 4. Use os modelos Qwen

```bash
opencode --provider qwen-code --model qwen3-coder-plus
```

## Modelos Disponíveis

| Modelo | Contexto | Output | Descrição |
|--------|----------|--------|-----------|
| `qwen3-coder-plus` | 1M tokens | 64K tokens | Modelo mais capaz para programação |
| `qwen3-coder-flash` | 1M tokens | 64K tokens | Respostas mais rápidas |

## Como Funciona

1. **Device Flow (RFC 8628)**: Ao fazer login, o plugin abre seu navegador para `chat.qwen.ai`
2. **Polling Automático**: O plugin detecta automaticamente quando você autoriza (sem precisar pressionar Enter)
3. **Armazenamento**: Credenciais são salvas em `~/.qwen/oauth_creds.json` (compatível com qwen-code)
4. **Auto-refresh**: Tokens são renovados automaticamente 30 segundos antes de expirar

## Limites de Uso

| Plano | Rate Limit | Limite Diário |
|-------|------------|---------------|
| Gratuito (OAuth) | 60 req/min | 2.000 req/dia |

## Desenvolvimento Local

```bash
# Clone o repositório
git clone https://github.com/gustavodiasdev/opencode-qwen-auth.git
cd opencode-qwen-auth

# Instale dependências
bun install

# Verifique tipos
bun run typecheck

# Link local no OpenCode
# Edite ~/.opencode/package.json:
{
  "dependencies": {
    "opencode-qwen-auth": "file:/caminho/absoluto/para/opencode-qwen-auth"
  }
}

# Reinstale
cd ~/.opencode && npm install
```

## Estrutura do Projeto

```
src/
├── constants.ts        # Constantes (endpoints OAuth, modelos)
├── types.ts            # Interfaces TypeScript
├── index.ts            # Plugin principal
├── cli.ts              # CLI standalone (opcional)
├── qwen/
│   └── oauth.ts        # Lógica OAuth Device Flow + PKCE
└── plugin/
    ├── auth.ts         # Gerenciamento de credenciais
    ├── client.ts       # Cliente API Qwen
    └── utils.ts        # Utilitários
```

## Troubleshooting

### Token expirado

O plugin renova tokens automaticamente. Se houver problemas:

```bash
# Remova credenciais antigas
rm ~/.qwen/oauth_creds.json

# Re-autentique
opencode auth login
```

### Provider não aparece no `auth login`

O provider `qwen-code` é adicionado via plugin. No comando `opencode auth login`:
1. Selecione **"Other"**
2. Digite `qwen-code`

No TUI (interface gráfica do OpenCode), o provider aparece automaticamente.

### Rate limit excedido

Se atingir o limite diário (2.000 requisições):
- Aguarde até meia-noite UTC para reset
- Considere usar API Key do [DashScope](https://dashscope.aliyun.com) para limites maiores

## Projetos Relacionados

- [qwen-code](https://github.com/QwenLM/qwen-code) - CLI oficial do Qwen para programação
- [OpenCode](https://opencode.ai) - CLI de IA para desenvolvimento
- [opencode-gemini-auth](https://github.com/jenslys/opencode-gemini-auth) - Plugin similar para Google Gemini

## Licença

MIT
