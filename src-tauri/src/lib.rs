use std::process::{Child, Command};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{Manager, WindowEvent};

#[cfg(windows)]
use std::os::windows::process::CommandExt;

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

#[cfg(windows)]
mod win_job {
    use std::os::windows::io::AsRawHandle;
    use std::process::Child;

    type HANDLE = *mut std::ffi::c_void;
    type BOOL = i32;
    type DWORD = u32;

    const JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE: DWORD = 0x2000;
    const JOB_OBJECT_EXTENDED_LIMIT_INFORMATION: i32 = 9;

    #[repr(C)]
    struct IO_COUNTERS {
        read_operation_count: u64,
        write_operation_count: u64,
        other_operation_count: u64,
        read_transfer_count: u64,
        write_transfer_count: u64,
        other_transfer_count: u64,
    }

    #[repr(C)]
    struct JOBOBJECT_BASIC_LIMIT_INFORMATION {
        per_process_user_time_limit: i64,
        per_job_user_time_limit: i64,
        limit_flags: DWORD,
        minimum_working_set_size: usize,
        maximum_working_set_size: usize,
        active_process_limit: DWORD,
        affinity: usize,
        priority_class: DWORD,
        scheduling_class: DWORD,
    }

    #[repr(C)]
    struct JOBOBJECT_EXTENDED_LIMIT_INFORMATION {
        basic_limit_information: JOBOBJECT_BASIC_LIMIT_INFORMATION,
        io_info: IO_COUNTERS,
        process_memory_limit: usize,
        job_memory_limit: usize,
        peak_process_memory_limit: usize,
        peak_job_memory_limit: usize,
    }

    unsafe extern "system" {
        fn CreateJobObjectW(lp_job_attributes: *mut std::ffi::c_void, lp_name: *const u16) -> HANDLE;
        fn SetInformationJobObject(
            h_job: HANDLE,
            job_object_info_class: i32,
            lp_job_object_info: *const std::ffi::c_void,
            cb_job_object_info_length: DWORD,
        ) -> BOOL;
        fn AssignProcessToJobObject(h_job: HANDLE, h_process: HANDLE) -> BOOL;
        fn CloseHandle(h_object: HANDLE) -> BOOL;
    }

    pub struct JobGuard(HANDLE);

    unsafe impl Send for JobGuard {}
    unsafe impl Sync for JobGuard {}

    impl JobGuard {
        pub fn new() -> Option<Self> {
            unsafe {
                let job = CreateJobObjectW(std::ptr::null_mut(), std::ptr::null());
                if job.is_null() {
                    return None;
                }
                let mut info = std::mem::zeroed::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>();
                info.basic_limit_information.limit_flags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
                let ok = SetInformationJobObject(
                    job,
                    JOB_OBJECT_EXTENDED_LIMIT_INFORMATION,
                    &info as *const _ as *const std::ffi::c_void,
                    std::mem::size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as DWORD,
                );
                if ok == 0 {
                    CloseHandle(job);
                    return None;
                }
                Some(JobGuard(job))
            }
        }

        pub fn assign(&self, child: &Child) -> bool {
            unsafe {
                let handle = child.as_raw_handle() as HANDLE;
                AssignProcessToJobObject(self.0, handle) != 0
            }
        }
    }

    impl Drop for JobGuard {
        fn drop(&mut self) {
            unsafe {
                if !self.0.is_null() {
                    CloseHandle(self.0);
                }
            }
        }
    }
}

#[cfg(windows)]
use win_job::JobGuard;

#[cfg(not(windows))]
pub struct JobGuard;

struct ServerState {
    #[allow(dead_code)]
    child: Arc<Mutex<Option<Child>>>,
    #[allow(dead_code)]
    job: Arc<Mutex<Option<JobGuard>>>,
}

fn is_server_ready() -> bool {
    std::net::TcpStream::connect("127.0.0.1:8170").is_ok()
}

fn start_server(app_handle: &tauri::AppHandle) -> (Option<Child>, Option<JobGuard>) {
    if is_server_ready() {
        log::info!("Liquid Agent server is already running on port 8170.");
        return (None, None);
    }

    let resource_dir = app_handle
        .path()
        .resource_dir()
        .unwrap_or_else(|_| std::env::current_dir().unwrap_or_default());

    let exe_dir = std::env::current_exe().ok().and_then(|p| p.parent().map(|p| p.to_path_buf()));
    let exe_parent = exe_dir.as_ref().and_then(|p| p.parent().map(|p| p.to_path_buf()));

    let mut candidates = vec![
        std::env::current_dir().unwrap_or_default(),
        resource_dir,
    ];
    if let Some(d) = exe_dir { candidates.push(d); }
    if let Some(p) = exe_parent { candidates.push(p); }

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

    #[cfg(windows)]
    let job = JobGuard::new();

    match cmd.spawn() {
        Ok(child) => {
            log::info!("Spawned server process PID {}", child.id());
            #[cfg(windows)]
            if let Some(ref j) = job {
                if j.assign(&child) {
                    log::info!("Assigned PID {} to Windows Job Object with KILL_ON_JOB_CLOSE", child.id());
                }
            }
            #[cfg(windows)]
            {
                (Some(child), job)
            }
            #[cfg(not(windows))]
            {
                (Some(child), None)
            }
        }
        Err(e) => {
            log::error!("Failed to spawn server: {}", e);
            (None, None)
        }
    }
}

fn stop_server(child_arc: &Arc<Mutex<Option<Child>>>, job_arc: &Arc<Mutex<Option<JobGuard>>>) {
    if let Ok(mut lock) = child_arc.lock() {
        if let Some(mut child) = lock.take() {
            log::info!("Terminating server child process PID {}", child.id());
            let _ = child.kill();
            let _ = child.wait();
        }
    }
    if let Ok(mut lock) = job_arc.lock() {
        let _ = lock.take();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let server_child: Arc<Mutex<Option<Child>>> = Arc::new(Mutex::new(None));
    let server_child_clone = server_child.clone();

    let job_guard: Arc<Mutex<Option<JobGuard>>> = Arc::new(Mutex::new(None));
    let job_guard_clone = job_guard.clone();

    tauri::Builder::default()
        .manage(ServerState {
            child: server_child.clone(),
            job: job_guard.clone(),
        })
        .setup(move |app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            let (child, job) = start_server(&app.handle());
            if let Some(c) = child {
                if let Ok(mut lock) = server_child_clone.lock() {
                    *lock = Some(c);
                }
            }
            if let Some(j) = job {
                if let Ok(mut lock) = job_guard_clone.lock() {
                    *lock = Some(j);
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
                stop_server(&server_child, &job_guard);
            }
        });
}
