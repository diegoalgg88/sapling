# 🌐 Providers Guide - Sapling

## Visión General

Sapling soporta **5 providers oficiales** con diferentes métodos de autenticación:

| Provider | Tipo | Auth | Modelos Principales |
|----------|------|------|---------------------|
| **Anthropic** | Nativo | API Key | claude-sonnet-4-5, claude-opus-4-6 |
| **MiniMax** | Gateway | API Key + Base URL | MiniMax-M2.5, minimax-text-01 |
| **NVIDIA** | Gateway | API Key | qwen3-coder-480b, llama-3.1-70b |
| **Qwen** | Gateway | OAuth Automático ⭐ | coder-model, qwen-2.5-72b |
| **Gemini** | Gateway | OAuth Automático ⭐ | gemini-2.0-flash, gemma-7b |

---

## 1. Anthropic (Nativo)

### Configuración

```bash
# Método 1: CLI
sapling auth set anthropic --key sk-ant-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Método 2: Env Var
export ANTHROPIC_API_KEY="sk-ant-xxx"

# Método 3: ~/.sapling/auth.json
{
  "providers": {
    "anthropic": {
      "apiKey": "sk-ant-xxx"
    }
  }
}
```

### Modelos

| Modelo | Alias | Uso | Input/Output | Costo/1M tokens |
|--------|-------|-----|--------------|-----------------|
| `claude-sonnet-4-5` | `sonnet` | General | 200K / 64K | $3 / $15 |
| `claude-opus-4-6` | `opus` | Complejo | 200K / 64K | $15 / $75 |
| `claude-haiku-4-5` | `haiku` | Rápido | 200K / 64K | $0.25 / $1.25 |

### Uso

```bash
# Usar alias
sapling run "Fix bug" --model sonnet

# Usar nombre completo
sapling run "Refactor" --model claude-opus-4-6
```

---

## 2. MiniMax (Gateway)

### Configuración

**⚠️ Requiere `baseUrl` explícito**

```bash
# Método 1: CLI (con base-url obligatorio)
sapling auth set minimax --key sk-mm-xxx --base-url https://api.minimax.io/anthropic

# Método 2: Env Var
export MINIMAX_API_KEY="sk-mm-xxx"

# Método 3: ~/.sapling/auth.json
{
  "providers": {
    "minimax": {
      "apiKey": "sk-mm-xxx",
      "baseUrl": "https://api.minimax.io/anthropic"
    }
  }
}
```

### Modelos

| Modelo | Uso | Input/Output | Costo/1M tokens |
|--------|-----|--------------|-----------------|
| `MiniMax-M2.5` | General | 256K / 64K | ~$2 / $10 |
| `minimax-text-01` | Texto | 256K / 32K | ~$1.5 / $8 |

### Uso

```bash
# MiniMax requiere backend sdk
sapling run "Add docs" --model MiniMax-M2.5 --backend sdk
```

---

## 3. NVIDIA (Gateway - NIM)

### Configuración

```bash
# Método 1: CLI
sapling auth set nvidia --key nvapi-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Método 2: Env Var
export NVIDIA_API_KEY="nvapi-xxx"

# Método 3: ~/.sapling/auth.json
{
  "providers": {
    "nvidia": {
      "apiKey": "nvapi-xxx"
    }
  }
}
```

**Base URL automática:** `https://integrate.api.nvidia.com/v1`

### Modelos

| Modelo | Tipo | Uso | Costo/1M tokens |
|--------|------|-----|-----------------|
| `qwen/qwen3-coder-480b-a35b-instruct` | Código | Coding | ~$1.5 / $3 |
| `meta/llama-3.1-70b-instruct` | General | Chat | ~$1 / $2 |
| `mistralai/mistral-large-2411` | General | Enterprise | ~$2 / $4 |
| `moonshotai/kimi-k2-instruct` | Razoning | Complex | ~$1.5 / $3 |

### Uso

```bash
# NVIDIA NIM usa backend sdk
sapling run "Add tests" --model qwen/qwen3-coder-480b-a35b-instruct --backend sdk
```

---

## 4. Qwen (OAuth Automático) ⭐

### Configuración Automática

**No requiere configuración manual!**

Los tokens OAuth se cargan automáticamente desde:
```
~/.qwen/oauth_creds.json
```

### Verificar OAuth

```bash
# Verificar si existe el archivo
cat ~/.qwen/oauth_creds.json

# Ver estado en Sapling
sapling auth status
# Debería mostrar: ✓ qwen: xxx...xxx [env] (OAuth)
```

### Modelos

| Modelo | Uso | Input/Output | Costo |
|--------|-----|--------------|-------|
| `coder-model` | Código | 256K / 64K | Gratis (OAuth) |
| `qwen-2.5-72b` | General | 128K / 32K | Gratis (OAuth) |
| `qwen-max` | Premium | 256K / 64K | Gratis (OAuth) |

### Uso

```bash
# Usar modelo coder (auto-resuelve a Qwen)
sapling run "Fix bug" --model coder-model

# Usar nombre explícito
sapling run "Refactor" --model qwen-2.5-72b
```

### API Key Alternativa (sin OAuth)

```bash
# Si no tienes OAuth, usa API key
sapling auth set qwen --key sk-xxx

# O usa env var
export Z_AI_API_KEY="sk-xxx"
# O
export QWEN_API_KEY="sk-xxx"
```

**Base URL automática:** `https://dashscope.aliyuncs.com/compatible-mode/v1`

---

## 5. Gemini (OAuth Automático) ⭐

### Configuración Automática

**No requiere configuración manual!**

Los tokens OAuth se cargan automáticamente desde:
```
~/.gemini/oauth_creds.json
```

### Verificar OAuth

```bash
# Verificar si existe el archivo
cat ~/.gemini/oauth_creds.json

# Ver estado en Sapling
sapling auth status
# Debería mostrar: ✓ gemini: ya29...xxx [env] (OAuth)
```

### Modelos

| Modelo | Uso | Input/Output | Costo |
|--------|-----|--------------|-------|
| `gemini-2.0-flash` | Rápido | 1M / 64K | Gratis (OAuth) |
| `gemini-2.5-pro` | Premium | 2M / 128K | Gratis (OAuth) |
| `gemma-3b` | Ligero | 32K / 8K | Gratis (OAuth) |
| `gemma-7b` | Balanceado | 128K / 32K | Gratis (OAuth) |

### Uso

```bash
# Usar modelo Gemini
sapling run "Explain code" --model gemini-2.0-flash

# Usar Gemma
sapling run "Quick task" --model gemma-3b
```

### API Key Alternativa (sin OAuth)

```bash
# Si no tienes OAuth, usa API key
sapling auth set gemini --key ya29-xxx

# O usa env var
export GEMINI_API_KEY="ya29-xxx"
```

**Base URL automática:** `https://generativelanguage.googleapis.com/v1beta/openai`

---

## Comparativa de Providers

### Velocidad

| Provider | Velocidad | Latencia Típica |
|----------|-----------|-----------------|
| **Gemini** | Ultra-fast | ~100-300ms |
| **Groq** (vía NVIDIA) | Ultra-fast | ~50-200ms |
| **Qwen** | Fast | ~200-500ms |
| **Anthropic** | Fast | ~300-600ms |
| **MiniMax** | Medium | ~500-800ms |

### Costo (por 1M tokens output)

| Provider | Económico | Premium |
|----------|-----------|---------|
| **Qwen** | Gratis (OAuth) | Gratis (OAuth) |
| **Gemini** | Gratis (OAuth) | Gratis (OAuth) |
| **NVIDIA** | ~$2 (llama-3.1-70b) | ~$3 (qwen3-coder-480b) |
| **MiniMax** | ~$8 (minimax-text-01) | ~$10 (MiniMax-M2.5) |
| **Anthropic** | $1.25 (haiku) | $75 (opus) |

### Calidad de Código

| Provider | Modelo | Calidad |
|----------|--------|---------|
| **Anthropic** | claude-sonnet-4-5 | ⭐⭐⭐⭐⭐ |
| **Anthropic** | claude-opus-4-6 | ⭐⭐⭐⭐⭐+ |
| **Qwen** | coder-model | ⭐⭐⭐⭐ |
| **NVIDIA** | qwen3-coder-480b | ⭐⭐⭐⭐ |
| **Gemini** | gemini-2.5-pro | ⭐⭐⭐⭐ |
| **MiniMax** | MiniMax-M2.5 | ⭐⭐⭐ |

---

## Recomendaciones por Caso de Uso

### Desarrollo Diario (Económico)

```bash
# Qwen con OAuth (gratis)
sapling run "Add feature" --model coder-model

# Gemini con OAuth (gratis)
sapling run "Write tests" --model gemini-2.0-flash
```

### Tareas Críticas (Máxima Calidad)

```bash
# Anthropic Opus
sapling run "Refactor auth system" --model claude-opus-4-6
```

### Tareas Rápidas (Low Latency)

```bash
# Gemini Flash
sapling run "Explain this function" --model gemini-2.0-flash

# NVIDIA Llama
sapling run "Quick fix" --model meta/llama-3.1-70b-instruct
```

### Código Complejo (Balance)

```bash
# NVIDIA Qwen Coder
sapling run "Implement database layer" --model qwen/qwen3-coder-480b-a35b-instruct --backend sdk
```

---

## Troubleshooting

### Error: `Unknown provider`

```bash
# Verificar providers soportados
sapling auth status

# Providers válidos: anthropic, minimax, nvidia, qwen, gemini
```

### Error: `MiniMax requires base-url`

```bash
# Configurar con base-url explícito
sapling auth set minimax --key sk-mm-xxx --base-url https://api.minimax.io/anthropic
```

### Error: `OAuth token not found`

```bash
# Verificar archivos OAuth
ls -la ~/.qwen/oauth_creds.json
ls -la ~/.gemini/oauth_creds.json

# Si no existen, autenticar con CLI correspondiente
```

### Error: `Model not found`

```bash
# Verificar formato correcto
# Alias: sonnet, opus, haiku
# Completo: claude-sonnet-4-5, gemini-2.0-flash, qwen/qwen3-coder-480b
```

---

**Última actualización:** 2026-03-14
