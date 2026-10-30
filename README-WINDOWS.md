# Liquid Agent for Windows 11 / x64

Port nativo de **Liquid Agent** para Windows 11, optimizado para ejecución local con aceleración por hardware en GPUs NVIDIA RTX y procesadores x64.

---

## 📋 Requisitos del Sistema

- **Sistema Operativo:** Windows 11 o Windows 10 (x64)
- **Entorno de Ejecución:** Node >= 20 (Node.js v20+)
- **GPU Acelerada:** NVIDIA RTX (ej. RTX 2070 Max-Q con 8 GB VRAM) o aceleración universal Vulkan
- **Directorio de Datos (`DATA`):** `%LOCALAPPDATA%\LiquidAgent`

---

## 🚀 Opciones de Ejecución

### Opción A: Aplicación Nativa de Escritorio (Tauri 2.0 / Rust — Cero Electron) 🏆
Ejecuta la app como un binario nativo independiente con ventana dedicada acelerada por WebView2 (<40 MB RAM):
* **Ejecutar binario ya compilado:**
  Haz doble clic en:
  👉 **`dist-native\Liquid Agent.exe`**
* **Recompilar binario nativo desde el código:**
  ```powershell
  powershell -ExecutionPolicy Bypass -File scripts/build-windows-exe.ps1
  # o vía npm:
  npm run build:native
  ```

---

### Opción B: Modo Servidor Web en Navegador
1. **Doble clic** en `Liquid Agent.bat` (o ejecuta `powershell -ExecutionPolicy Bypass -File scripts/start.ps1`).
2. Se abrirá automáticamente en tu navegador en:  
   👉 **`http://127.0.0.1:8170`**
3. En la interfaz web, ve a **Settings → Downloads** y haz clic en descargar los modelos:
   - **AI engine:** Descarga automática de `llama-server.exe` con aceleración CUDA.
   - **Everyday brain:** LFM3 1.7B (chat, razonamiento, herramientas).
   - **Eyes and ears:** LFM3 Omni 2B (voz en tiempo real bidireccional a 16/24 kHz, imágenes y audio).

---

## ⚡ Aceleración de Hardware (GPU NVIDIA & CUDA)

El motor detecta automáticamente Windows y prioriza:
1. **CUDA 13.4 / 12.4 (`llama-server.exe` + `cudart`):** Offloading completo de capas (`-ngl 99`) a la VRAM de tu GPU NVIDIA RTX.
2. **Vulkan (`bin-win-vulkan`):** Fallback acelerado por GPU universal para Intel Iris / AMD / NVIDIA.
3. **CPU AVX2:** Fallback para procesadores sin GPU dedicada.

---

## 🌐 Puertos y Arquitectura Local

Liquid Agent se ejecuta completamente en local en `127.0.0.1`:

| Puerto | Componente | Descripción |
|---|---|---|
| **`8170`** | Servidor Web / API | Interfaz web React + endpoints HTTP/WebSocket |
| **`8180`** | LFM3 1.7B | Motor `llama-server.exe` para texto y tool-calling |
| **`8181`** | LFM3 Omni 2B | Motor `llama-server.exe` para voz `/realtime` y multimodal |
| **`8766`** | Guardian | Sidecar Python Auto 200M (clasificador de seguridad) |
| **`8767`** | Betterwright | Bridge del navegador automatizado |

---

## 🛠️ Herramientas de Sistema Soportadas en Windows

- **Shell:** Comandos de terminal ejecutados mediante PowerShell nativo en UTF-8 forzado.
- **Portapapeles:** Lectura (`Get-Clipboard`) y copia (`clip.exe`).
- **Captura de Pantalla (`look_at_screen`):** Captura nativa mediante `.NET System.Drawing` sin dependencias externas pesadas.
- **Redimensionado de Imagen (`look_at_image`):** Escalado automático manteniendo relación de aspecto hasta 1280 px.
- **Apertura de Aplicaciones y Enlaces (`open`):** Apertura segura de URLs, carpetas y ejecutables con `cmd.exe /c start`.
- **Navegador Automatizado:** Integración con Betterwright / Playwright para navegación autónoma.

---

## 🧪 Verificación de Tests Unitarios

Puedes ejecutar la suite de pruebas nativa (sin dependencias adicionales) en cualquier momento:

```powershell
# Ejecutar suite completa
npm test

# Test individual del núcleo y rutas
node --test tests/test_core_windows.js

# Test de herramientas de sistema
node --test tests/test_tools_windows.js

# Test de motores y backends
node --test tests/test_backends_windows.js
```
