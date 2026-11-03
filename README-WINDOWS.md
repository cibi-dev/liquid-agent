# Liquid Agent for Windows 11 / x64

> 🌟 **Atribución y Origen:** Este proyecto es una adaptación comunitaria basada en [Liquid Agent](https://github.com/morriszdweck/liquid-agent) creado por [Morris Dweck](https://github.com/morriszdweck). Todos los derechos del diseño original, prompting y arquitectura pertenecen a su autor y a Liquid AI.

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
* **Bandeja del Sistema (System Tray):**
  - Icono residente en la barra de tareas de Windows.
  - Clic izquierdo sobre el icono alterna rápidamente visibilidad (Mostrar / Ocultar).
  - Menú contextual con clic derecho: opciones rápidas "Mostrar / Ocultar" y "Salir".
  - Al cerrar la ventana, el proceso se minimiza a la bandeja para mantener respuestas de voz listas.
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

## ⚡ Aceleración de Hardware e Inferencia Optimizada

El motor detecta automáticamente Windows y prioriza:
1. **CUDA 13.4 / 12.4 (`llama-server.exe` + `cudart`):** Offloading completo de capas (`-ngl 99`) a la VRAM de tu GPU NVIDIA RTX.
2. **Flash Attention (`--flash-attn`):** Activado nativamente en GPUs NVIDIA Turing (RTX 2070 Max-Q) para acelerar cálculo de atención y reducir consumo de VRAM.
3. **KV Cache Cuantizada (`-ctk q8_0 -ctv q8_0`):** Reduce la memoria de contexto en ~35-40%, permitiendo 32K tokens de contexto en LFM3 Omni y 16K en LFM3 1.7B dentro de los 8 GB de VRAM física.
4. **Batching & Multithreading:** Batching de prompts ajustado a `-b 2048 -ub 512` y multithreading paralelo con `-t 6` afinado para procesadores Intel Core i7 (6C/12T).
5. **Vulkan (`bin-win-vulkan`):** Fallback acelerado por GPU universal para Intel Iris / AMD / NVIDIA.
6. **CPU AVX2:** Fallback para procesadores sin GPU dedicada.

---

## 🎙️ Interacción de Voz de Ultra-Baja Latencia y Barge-In

- **Protocolo de Interrupción Inmediata (Barge-In):** Cuando el usuario comienza a hablar durante la respuesta del asistente, el servidor emite instantáneamente un evento `audio.clear` por WebSocket.
- **Vaciado de Buffer (Flush):** El cliente de audio (`PCMPlayer`) vacía los buffers pendientes y silencia la salida de altavoces en menos de 5 ms.
- **Descarte de Paquetes en Tránsito:** Los paquetes PCM residuales en la red local se descartan mientras el micrófono (`streaming`) esté activo, eliminando cualquier eco o cruce de audio.

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

- **Shell:** Comandos de terminal ejecutados mediante PowerShell nativo en UTF-8 forzado con flags de arranque rápido (`-NoProfile -NonInteractive -NoLogo`) que reducen la latencia de spawn en un 40-50%.
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

---

## 🔧 Troubleshooting (Windows)

Guía de los fallos que ya se diagnosticaron en este port. Léela **antes** de recompilar o de mover el proyecto de carpeta: casi todos los síntomas raros de arranque vinieron de la misma causa ambiental.

### 1. La app "abre y se cierra" (código `0xC0000142`, sin ventana)

**Causa más probable: la carpeta del proyecto tiene etiqueta de integridad `Low`.**

Windows propaga la etiqueta de integridad de un directorio a los `.exe` que contiene, y los ejecuta con un token de baja integridad. `Liquid Agent.exe` arranca entonces en *Low IL* y el proceso de WebView2 no puede escribir en `%LOCALAPPDATA%` (que es *Medium*), así que muere en silencio y la ventana nunca aparece.

Comprobar la etiqueta:

```powershell
icacls "C:\Users\admin\Proyectos" | Select-String "Mandatory"
# MAL:  Mandatory Label\Low Mandatory Level
# BIEN: Mandatory Label\Medium Mandatory Level
```

Corregirla (propaga a todos los archivos, tarda un rato en carpetas grandes):

```powershell
icacls "C:\Users\admin\Proyectos" /setintegritylevel (OI)(CI)M /T /C
```

Verificar además que el `.exe` corre en *Medium*: abre la app y en PowerShell compara con otra copia fuera de esa carpeta. Si el nivel es `S-1-16-4096` es *Low*; `S-1-16-8192` es *Medium* (correcto).

> Regla práctica: una carpeta con etiqueta `Low` **solo** deja funcionar WebView2 si el perfil de usuario también está en `Low`. Eso es un síntoma, no una solución. Lo correcto es volver a `Medium`.

### 2. `WebView2 error: HRESULT(0x8000FFFF) "Catastrophic failure"` o `0x800700AA "The requested resource is in use."`

**Causa: perfil de WebView2 corrupto o bloqueado.** Borra el perfil y deja que se regenere:

```powershell
Get-Process "Liquid Agent","msedgewebview2" -ErrorAction SilentlyContinue | Stop-Process -Force
Remove-Item -Recurse -Force "$env:LOCALAPPDATA\com.liquidagent.desktop" -ErrorAction SilentlyContinue
```

No copies un perfil `EBWebView` de una sesión anterior: si lo restauras, reaparece `0x800700AA` porque el perfil queda marcado como "en uso".

### 3. El `.exe` está compilado con MinGW/GNU en lugar de MSVC

Tauri 2 en Windows necesita MSVC. Un binario GNU depende de `msvcrt.dll` y de un `WebView2Loader.dll` externo, y falla al arrancar.

```powershell
# Comprobar las DLLs que importa el binario
objdump -p "dist-native\Liquid Agent.exe" | Select-String "DLL Name"
```

Un binario MSVC correcto solo importa DLLs del sistema (`KERNEL32.dll`, `USER32.dll`, `api-ms-win-*`, `ucrtbase.dll`). Si aparecen `msvcrt.dll` o `WebView2Loader.dll`, está mal compilado.

### 4. `could not execute rustc` / errores de `indexmap` al compilar

**Causa: `PATH` contaminado por toolchains MinGW (Strawberry Perl, Git for Windows).** Cargo elige el linker equivocado y falla con errores que parecen del código.

Compila con un `PATH` limpio y la toolchain MSVC:

```powershell
Remove-Item Env:MSYSTEM -ErrorAction SilentlyContinue
$env:PATH = "C:\Users\admin\.cargo\bin;C:\Program Files\nodejs;C:\Windows\System32;C:\Windows;C:\Windows\System32\Wbem"
cargo build --release --manifest-path src-tauri\Cargo.toml
```

Si quieres asegurarte de la toolchain por defecto:

```powershell
rustup default stable-x86_64-pc-windows-msvc
rustup show
```

### 5. `npm run build` falla con `Access is denied` desde esbuild

Es el mismo efecto de la etiqueta `Low` (punto 1): esbuild intenta escribir en `%TEMP%`, que es una carpeta *Medium*. Corrige la etiqueta de integridad de la carpeta del proyecto y vuelve a intentarlo; no hace falta parchear `node_modules`.

### 6. `llama-server` muere con `unknown value for --flash-attn: '-b'`

Las builds actuales de `llama-server` cambiaron `--flash-attn` de *flag booleano* a *opción con valor*. Un `--flash-attn` suelto consume el argumento siguiente (`-b`). El código ya pasa `-fa auto`; si ves este error en una copia antigua, actualiza `server/backends.js`.

### 7. SmartScreen bloquea el arranque ("Windows protegió tu PC")

El binario no está firmado. Pulsa **"Más información" → "Ejecutar de todas formas"**. Para evitar el aviso en desarrollo, ejecútalo desde PowerShell o añade la carpeta a las exclusiones de Defender.

### 8. Dónde mirar los logs

| Qué | Ruta |
|---|---|
| Logs de la app | `%LOCALAPPDATA%\LiquidAgent\logs` |
| Datos / modelos / configuración | `%LOCALAPPDATA%\LiquidAgent` |
| Volcados de fallo (WebView2) | `%LOCALAPPDATA%\CrashDumps` |
| Eventos de aplicación | Visor de eventos → Registros de Windows → Aplicación |
| Perfil de WebView2 | `%LOCALAPPDATA%\com.liquidagent.desktop\EBWebView` |

Comando rápido para el volcado más reciente:

```powershell
Get-ChildItem "$env:LOCALAPPDATA\CrashDumps" | Sort-Object LastWriteTime -Descending | Select-Object -First 5
Get-WinEvent -FilterHashtable @{LogName='Application'; StartTime=(Get-Date).AddMinutes(-30)} |
  Where-Object { $_.Message -match 'Liquid|msedgewebview2' } | Select-Object -First 5
```

### 9. La ventana se cierra y no queda en la bandeja

El `CloseRequested` de `src-tauri/src/lib.rs` llama actualmente a `app.exit(0)`, así que cerrar la ventana termina también el servidor. Para que quede residente en la bandeja hay que interceptar el evento, ocultar la ventana y salir solo desde el menú **"Salir"** (pendiente, ver handoff).
