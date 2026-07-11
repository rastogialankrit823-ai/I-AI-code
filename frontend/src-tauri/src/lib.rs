use serde::Serialize;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use tauri::{Emitter, Manager};

/// Handles for spawned sidecars — used on shutdown.
struct SidecarHandles {
    llama: Option<Child>,
    backend: Option<Child>,
}

/// Status broadcast to the splash screen.
#[derive(Serialize, Clone)]
struct StatusEvent {
    stage: String,        // "llama" | "backend" | "ready" | "error"
    message: String,
    progress: u8,         // 0..100
}

fn home() -> PathBuf {
    std::env::var("HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from("/tmp"))
}

/// Project root resolution, in priority order:
/// 1. IANDAI_ROOT env var
/// 2. ~/.iandai/config.json  {"root": "/path/to/repo"}  (written by install.sh)
/// 3. Walk up from the executable looking for a dir containing backend/main.py
///    (covers `npm run tauri dev` where the exe lives in src-tauri/target/…)
fn project_root() -> Result<PathBuf, String> {
    if let Ok(root) = std::env::var("IANDAI_ROOT") {
        let p = PathBuf::from(root);
        if p.join("backend").join("main.py").exists() {
            return Ok(p);
        }
    }

    let cfg = home().join(".iandai").join("config.json");
    if let Ok(raw) = std::fs::read_to_string(&cfg) {
        // Minimal parse — value of "root" key. Avoids a JSON dependency.
        if let Some(root) = raw
            .split("\"root\"")
            .nth(1)
            .and_then(|s| s.split('"').nth(1))
        {
            let p = PathBuf::from(root);
            if p.join("backend").join("main.py").exists() {
                return Ok(p);
            }
        }
    }

    if let Ok(mut dir) = std::env::current_exe() {
        while dir.pop() {
            if dir.join("backend").join("main.py").exists() {
                return Ok(dir);
            }
        }
    }

    Err("Could not locate the I&AI Code install. Run scripts/install.sh, or set IANDAI_ROOT.".into())
}

/// First .gguf in {root}/models/, or a "model" key in ~/.iandai/config.json.
fn find_model(root: &Path) -> Result<PathBuf, String> {
    let cfg = home().join(".iandai").join("config.json");
    if let Ok(raw) = std::fs::read_to_string(&cfg) {
        if let Some(model) = raw
            .split("\"model\"")
            .nth(1)
            .and_then(|s| s.split('"').nth(1))
        {
            let p = PathBuf::from(model);
            if p.exists() {
                return Ok(p);
            }
        }
    }

    let models_dir = root.join("models");
    if let Ok(entries) = std::fs::read_dir(&models_dir) {
        for e in entries.flatten() {
            let p = e.path();
            if p.extension().map(|x| x == "gguf").unwrap_or(false) {
                return Ok(p);
            }
        }
    }

    Err(format!(
        "No .gguf model found in {}. Run scripts/download-model.sh.",
        models_dir.display()
    ))
}

/// llama-server binary: repo-local build first, then system installs, then PATH.
fn find_llama_server(root: &Path) -> PathBuf {
    let candidates = [
        root.join("llama.cpp/build/bin/llama-server"),
        PathBuf::from("/usr/local/bin/llama-server"),
        PathBuf::from("/opt/homebrew/bin/llama-server"),
    ];
    for c in &candidates {
        if c.exists() {
            return c.clone();
        }
    }
    PathBuf::from("llama-server") // hope it's on PATH
}

fn spawn_llama(root: &Path) -> Result<Child, String> {
    let model = find_model(root)?;
    Command::new(find_llama_server(root))
        .args([
            "-m", &model.to_string_lossy(),
            "--host", "127.0.0.1",
            "--port", "8081",
            "-c", "8192",
            "-t", "4",
        ])
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| format!("llama-server spawn failed: {e}"))
}

fn spawn_backend(root: &Path) -> Result<Child, String> {
    let venv_uvicorn = root.join("backend/.venv/bin/uvicorn");
    let uvicorn = if venv_uvicorn.exists() {
        venv_uvicorn
    } else {
        PathBuf::from("uvicorn")
    };
    Command::new(uvicorn)
        .args([
            "main:app",
            "--host", "127.0.0.1",
            "--port", "8000",
        ])
        .current_dir(root.join("backend"))
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| format!("backend spawn failed: {e}"))
}

/// Poll a URL until it returns 2xx or attempts exhausted.
fn wait_for_url(url: &str, attempts: u32) -> bool {
    for _ in 0..attempts {
        if let Ok(resp) = ureq::get(url).timeout(std::time::Duration::from_secs(1)).call() {
            if resp.status() < 500 {
                return true;
            }
        }
        std::thread::sleep(std::time::Duration::from_secs(1));
    }
    false
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let handles: Mutex<SidecarHandles> = Mutex::new(SidecarHandles { llama: None, backend: None });

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(handles)
        .setup(|app| {
            let app_handle = app.handle().clone();
            std::thread::spawn(move || {
                let emit = |stage: &str, msg: &str, progress: u8| {
                    let _ = app_handle.emit(
                        "boot-status",
                        StatusEvent {
                            stage: stage.into(),
                            message: msg.into(),
                            progress,
                        },
                    );
                };

                let root = match project_root() {
                    Ok(r) => r,
                    Err(e) => {
                        emit("error", &e, 0);
                        return;
                    }
                };

                // ── llama.cpp ───────────────────────────────────────────────
                emit("llama", "Starting llama.cpp server…", 5);
                match spawn_llama(&root) {
                    Ok(child) => {
                        if let Some(state) = app_handle.try_state::<Mutex<SidecarHandles>>() {
                            state.lock().unwrap().llama = Some(child);
                        }
                        emit("llama", "Loading model…", 20);
                        if !wait_for_url("http://127.0.0.1:8081/v1/models", 60) {
                            emit("error", "llama.cpp failed to become ready in 60s", 20);
                            return;
                        }
                        emit("llama", "llama.cpp ready", 50);
                    }
                    Err(e) => {
                        emit("error", &format!("Could not start llama-server: {e}"), 5);
                        return;
                    }
                }

                // ── Backend ─────────────────────────────────────────────────
                emit("backend", "Starting FastAPI backend…", 60);
                match spawn_backend(&root) {
                    Ok(child) => {
                        if let Some(state) = app_handle.try_state::<Mutex<SidecarHandles>>() {
                            state.lock().unwrap().backend = Some(child);
                        }
                        if !wait_for_url("http://127.0.0.1:8000/", 30) {
                            emit("error", "Backend failed to become ready in 30s", 60);
                            return;
                        }
                        emit("backend", "Backend ready", 95);
                    }
                    Err(e) => {
                        emit("error", &format!("Could not start backend: {e}"), 60);
                        return;
                    }
                }

                emit("ready", "All services ready", 100);
            });
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                if let Some(state) = window.app_handle().try_state::<Mutex<SidecarHandles>>() {
                    let mut h = state.lock().unwrap();
                    if let Some(mut c) = h.llama.take()   { let _ = c.kill(); }
                    if let Some(mut c) = h.backend.take() { let _ = c.kill(); }
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
