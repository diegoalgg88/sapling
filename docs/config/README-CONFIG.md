# ⚡ Configuración Rápida - Sapling Multi-Provider

## 🎯 Objetivo

Configurar Sapling para usar **5 providers oficiales** (Anthropic, MiniMax, NVIDIA, Qwen, Gemini) con soporte para OAuth automático.

---

## 📋 1. Archivos Creados

| Archivo | Propósito |
|---------|-----------|
| `docs/config/README-CONFIG.md` | Esta guía rápida |
| `docs/config/PROVIDERS-GUIDE.md` | Guía completa de providers |
| `docs/config/config.yaml.example` | Ejemplo de configuración |
| `docs/config/.env.example` | Plantilla de variables de entorno |

---

## 🚀 2. Configuración en 3 Pasos

### **Paso 1: Obtener API Keys / OAuth**

| Provider | URL | Auth Type |
|----------|-----|-----------|
| **Anthropic** | [console.anthropic.com](https://console.anthropic.com) | API Key |
| **MiniMax** | [api.minimax.io](https://api.minimax.io) | API Key + Base URL |
| **NVIDIA** | [build.nvidia.com](https://build.nvidia.com) | API Key |
| **Qwen** | [platform.z.ai](https://platform.z.ai) | OAuth Automático ⭐ |
| **Gemini** | [Google OAuth](https://accounts.google.com) | OAuth Automático ⭐ |

---

### **Paso 2: Configurar Autenticación**

#### **Opción A: OAuth Automático (Qwen y Gemini)** ⭐

Para Qwen y Gemini, **no necesitas configurar nada**. Los tokens OAuth se cargan automáticamente desde:

```
~/.qwen/oauth_creds.json    → Qwen
~/.gemini/oauth_creds.json  → Gemini
```

#### **Opción B: API Keys (Anthropic, MiniMax, NVIDIA)**

**Método 1: Usando el CLI (Recomendado)**
```bash
# Anthropic
sapling auth set anthropic --key sk-ant-xxx

# MiniMax (requiere base-url)
sapling auth set minimax --key sk-mm-xxx --base-url https://api.minimax.io/anthropic

# NVIDIA
sapling auth set nvidia --key nvapi-xxx

# Qwen (si no usas OAuth)
sapling auth set qwen --key sk-xxx

# Gemini (si no usas OAuth)
sapling auth set gemini --key ya29-xxx
```

**Método 2: Variables de Entorno**
```bash
# Agregar a ~/.bashrc o ~/.zshrc
export ANTHROPIC_API_KEY="sk-ant-xxx"
export MINIMAX_API_KEY="sk-mm-xxx"
export NVIDIA_API_KEY="nvapi-xxx"
export GEMINI_API_KEY="ya29-xxx"
```

**Método 3: Archivo ~/.sapling/auth.json**
```json
{
  "providers": {
    "anthropic": {
      "apiKey": "sk-ant-xxx"
    },
    "minimax": {
      "apiKey": "sk-mm-xxx",
      "baseUrl": "https://api.minimax.io/anthropic"
    },
    "nvidia": {
      "apiKey": "nvapi-xxx"
    },
    "gemini": {
      "apiKey": "ya29-xxx"
    }
  }
}
```

---

### **Paso 3: Verificar Configuración**

```bash
# Ver estado de autenticación
sapling auth status

# Ejecutar tarea de prueba
sapling run "Hello world" --model claude-sonnet-4-5
```

---

## 🎯 3. Modelos por Provider

### **Anthropic** (Nativo)
| Modelo | Uso | Costo/1M tokens |
|--------|-----|-----------------|
| `claude-sonnet-4-5` | General | $3 / $15 |
| `claude-opus-4-6` | Complejo | $15 / $75 |
| `claude-haiku-4-5` | Rápido | $0.25 / $1.25 |

---

### **MiniMax** (Gateway - requiere base-url)
| Modelo | Uso | Costo/1M tokens |
|--------|-----|-----------------|
| `MiniMax-M2.5` | General | ~$2 / $10 |
| `minimax-text-01` | Texto | ~$1.5 / $8 |

**Base URL requerida:** `https://api.minimax.io/anthropic`

---

### **NVIDIA** (Gateway - NIM)
| Modelo | Uso | Costo/1M tokens |
|--------|-----|-----------------|
| `qwen/qwen3-coder-480b` | Código | ~$1.5 / $3 |
| `meta/llama-3.1-70b` | General | ~$1 / $2 |
| `mistralai/mistral-large` | General | ~$2 / $4 |

---

### **Qwen** (OAuth Automático) ⭐
| Modelo | Uso | Costo |
|--------|-----|-------|
| `coder-model` | Código | Gratis con OAuth |
| `qwen-2.5-72b` | General | Gratis con OAuth |
| `qwen-max` | Premium | Gratis con OAuth |

**OAuth File:** `~/.qwen/oauth_creds.json`

---

### **Gemini** (OAuth Automático) ⭐
| Modelo | Uso | Costo |
|--------|-----|-------|
| `gemini-2.0-flash` | Rápido | Gratis con OAuth |
| `gemini-2.5-pro` | Premium | Gratis con OAuth |
| `gemma-3b` | Ligero | Gratis con OAuth |
| `gemma-7b` | Balanceado | Gratis con OAuth |

**OAuth File:** `~/.gemini/oauth_creds.json`

---

## 💰 4. Comparativa de Costos

| Provider | Modelo Económico | Modelo Premium |
|----------|------------------|----------------|
| **Anthropic** | haiku ($0.25/$1.25) | opus ($15/$75) |
| **MiniMax** | minimax-text-01 (~$1.5/$8) | MiniMax-M2.5 (~$2/$10) |
| **NVIDIA** | meta/llama-3.1-70b (~$1/$2) | qwen3-coder-480b (~$1.5/$3) |
| **Qwen** | coder-model (OAuth gratis) | qwen-max (OAuth gratis) |
| **Gemini** | gemini-2.0-flash (OAuth gratis) | gemini-2.5-pro (OAuth gratis) |

---

## 🎯 5. Configuraciones Recomendadas

### **Configuración Económica (Máximo Ahorro)**

```bash
# Usar Qwen y Gemini con OAuth automático
sapling run "Fix this bug" --model coder-model
sapling run "Refactor database" --model gemini-2.0-flash
```

**Costo:** $0 (OAuth gratis)

---

### **Configuración Balanceada (Recomendada)**

```bash
# NVIDIA para código (económico y rápido)
sapling run "Add unit tests" --model qwen/qwen3-coder-480b --backend sdk

# Gemini para tareas generales
sapling run "Explain this code" --model gemini-2.0-flash
```

**Costo:** ~$1.50 por 1M tokens

---

### **Configuración Premium (Máxima Calidad)**

```bash
# Anthropic para tareas críticas
sapling run "Refactor authentication" --model claude-opus-4-6

# MiniMax para tareas generales
sapling run "Add documentation" --model MiniMax-M2.5 --backend sdk
```

**Costo:** ~$15 por 1M tokens (Anthropic), ~$2 por 1M tokens (MiniMax)

---

## 🛠️ 6. Troubleshooting

### **Error: `Provider not configured`**

```bash
# Verificar autenticación
sapling auth status

# Si no está configurado
sapling auth set <provider> --key <api-key>
```

---

### **Error: `OAuth token not found` (Qwen/Gemini)**

```bash
# Verificar archivos OAuth
cat ~/.qwen/oauth_creds.json
cat ~/.gemini/oauth_creds.json

# Si no existen, autenticar con CLI de Qwen/Gemini
```

---

### **Error: `Unknown model`**

```bash
# Verificar formato del modelo
# Correcto: "claude-sonnet-4-5", "qwen/qwen3-coder-480b", "gemini-2.0-flash"

# Listar modelos disponibles
sapling run --help
```

---

### **Error: `MiniMax requires base-url`**

```bash
# Configurar con base-url
sapling auth set minimax --key sk-mm-xxx --base-url https://api.minimax.io/anthropic
```

---

## 📊 7. Priority de Autenticación

Sapling carga credenciales en este orden (mayor a menor prioridad):

```
1. CLI flags (--key argumento)
   ↓
2. Variables de entorno (ANTHROPIC_API_KEY, etc.)
   ↓
3. OAuth files (~/.qwen/oauth_creds.json, ~/.gemini/oauth_creds.json) ⭐
   ↓
4. Auth file (~/.sapling/auth.json)
```

---

## 🔗 8. Recursos Adicionales

| Recurso | URL |
|---------|-----|
| **Guía de providers** | `docs/config/PROVIDERS-GUIDE.md` |
| **Ejemplo de config** | `docs/config/config.yaml.example` |
| **Documentación Sapling** | `README.md` |
| **NVIDIA NIM modelos** | [build.nvidia.com/explore](https://build.nvidia.com/explore) |
| **Anthropic modelos** | [docs.anthropic.com](https://docs.anthropic.com) |

---

## ✅ 9. Checklist Final

- [ ] **1. Obtener API keys** de providers seleccionados
- [ ] **2. Configurar autenticación** (CLI, env vars, o auth.json)
- [ ] **3. Verificar OAuth** para Qwen y Gemini (automático)
- [ ] **4. Ejecutar `sapling auth status`**
- [ ] **5. Test con `sapling run "Hello world"`**

---

**¡Listo! Tu configuración multi-provider está activa.** 🚀

**Última actualización:** 2026-03-14
