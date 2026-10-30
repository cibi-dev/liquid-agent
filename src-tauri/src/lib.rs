use std::process::{Child, Command};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{Manager, WindowEvent};

#[cfg(windows)]
use std::os::windows::process::CommandExt;

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

struct ServerState {
    #[allow(dead_code)]
    child: Arc<Mutex<Option<Child>>>,
}

fn is_server_ready() -> bool {
    std::net::TcpStream::connect("127.0.0.1:8170").is_ok()
}

fn start_server(app_handle: &tauri::AppHandle) -> Option<Child> {
    if is_server_ready() {
        log::info!("Liquid Agent server is already running on port 8170.");
        return None;
    }

    let resource_dir = app_handle
        .path()
        .resource_dir()
        .unwrap_or_else(|_| std::env::current_dir().unwrap_or_default());

    let candidates = [
        std::env::current_dir().unwrap_or_default(),
        resource_dir,
    ];

    let mut server_dir = std::env::current_dir().unwrap_or_default();
    for dir in &candidates {
        if dir.join("server").join("index.js").exists() {
            server_dir = dir.clone();
            break;
        }
    }

    log::info!("Starting Liquid Agent server in {:?}", server_dir);

    #[cfg(windows)]
    let mut cmd = Command::new("node");
    cmd.arg("server/index.js");
    cmd.current_dir(&server_dir);
    cmd.env("LIQUID_AGENT_ACTIVE", "1");
    cmd.creation_flags(CREATE_NO_WINDOW);

    #[cfg(not(windows))]
    let mut cmd = Command::new("node");
    cmd.arg("server/index.js");
    cmd.current_dir(&server_dir);
    cmd.env("LIQUID_AGENT_ACTIVE", "1");

    match cmd.spawn() {
        Ok(child) => {
            log::info!("Spawned server process PID {}", child.id());
            Some(child)
        }
        Err(e) => {
            log::error!("Failed to spawn server: {}", e);
            None
        }
    }
}

fn stop_server(child_arc: &Arc<Mutex<Option<Child>>>) {
    if let Ok(mut lock) = child_arc.lock() {
        if let Some(mut child) = lock.take() {
            log::info!("Terminating server child process PID {}", child.id());
            let _ = child.kill();
            let _ = child.wait();
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let server_child: Arc<Mutex<Option<Child>>> = Arc::new(Mutex::new(None));
    let server_child_clone = server_child.clone();

    tauri::Builder::default()
        .manage(ServerState {
            child: server_child.clone(),
        })
        .setup(move |app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            let child = start_server(&app.handle());
            if let Some(c) = child {
                if let Ok(mut lock) = server_child_clone.lock() {
                    *lock = Some(c);
                }
            }

            // Wait for server to respond
            for _ in 0..50 {
                if is_server_ready() {
                    break;
                }
                std::thread::sleep(Duration::from_millis(100));
            }

            if let Some(window) = app.get_webview_window("main") {
                let _ = window.eval("window.location.href = 'http://127.0.0.1:8170'");
            }

            Ok(())
        })
        .on_window_event(move |window, event| {
            if let WindowEvent::CloseRequested { .. } = event {
                let app = window.app_handle();
                app.exit(0);
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(move |_app_handle, event| {
            if let tauri::RunEvent::Exit = event {
                stop_server(&server_child);
            }
        });
}
