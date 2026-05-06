import argparse
import atexit
import os
import subprocess
import sys
import time
import urllib.request
import webbrowser
import threading

DEFAULT_URL = "http://127.0.0.1:4000"
backend_process = None


def is_healthy(base_url: str) -> bool:
  try:
    with urllib.request.urlopen(f"{base_url}/api/health", timeout=2) as response:
      return response.status == 200
  except Exception:
    return False


def start_backend(cwd: str):
  command = ["npm", "run", "start"]
  kwargs = {"cwd": cwd}

  if os.name == "nt":
    command = ["cmd", "/c", *command]
    kwargs["creationflags"] = subprocess.CREATE_NO_WINDOW

  return subprocess.Popen(command, **kwargs)


def wait_for_health(url: str, timeout_seconds: int) -> bool:
  deadline = time.time() + timeout_seconds
  while time.time() < deadline:
    if is_healthy(url):
      return True
    time.sleep(0.8)
  return False


def launch_window(url: str):
  webbrowser.open(url)


def shutdown_backend():
  global backend_process
  if backend_process and backend_process.poll() is None:
    backend_process.terminate()
    try:
      backend_process.wait(timeout=5)
    except subprocess.TimeoutExpired:
      backend_process.kill()


def is_process_alive(pid: int) -> bool:
  if pid <= 0:
    return False
  if os.name == "nt":
    try:
      import ctypes
      PROCESS_QUERY_LIMITED_INFORMATION = 0x1000
      handle = ctypes.windll.kernel32.OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, False, pid)
      if not handle:
        return False
      try:
        code = ctypes.c_ulong()
        ok = ctypes.windll.kernel32.GetExitCodeProcess(handle, ctypes.byref(code))
        if not ok:
          return False
        STILL_ACTIVE = 259
        return code.value == STILL_ACTIVE
      finally:
        ctypes.windll.kernel32.CloseHandle(handle)
    except Exception:
      return False
  try:
    os.kill(pid, 0)
    return True
  except Exception:
    return False


def start_parent_monitor(parent_pid: int):
  if parent_pid <= 0:
    return

  def _monitor():
    while True:
      if not is_process_alive(parent_pid):
        shutdown_backend()
        os._exit(0)
      time.sleep(1.0)

  t = threading.Thread(target=_monitor, daemon=True)
  t.start()


def main():
  parser = argparse.ArgumentParser(description="Launch MCP Project Manager desktop window")
  parser.add_argument("--url", default=DEFAULT_URL, help="Base URL for web app")
  parser.add_argument("--start-backend", action="store_true", help="Start backend if not running")
  parser.add_argument("--backend-cwd", default=os.path.abspath(os.path.join(os.path.dirname(__file__), "..")), help="Working dir for backend start")
  parser.add_argument("--timeout", type=int, default=60, help="Startup wait timeout seconds")
  parser.add_argument("--parent-pid", type=int, default=0, help="Optional parent PID; launcher exits when parent exits")
  args = parser.parse_args()

  global backend_process

  if args.parent_pid > 0:
    start_parent_monitor(args.parent_pid)

  if not is_healthy(args.url):
    if not args.start_backend:
      print(f"Backend not healthy at {args.url}. Use --start-backend to auto start.")
      sys.exit(1)
    backend_process = start_backend(args.backend_cwd)
    if not wait_for_health(args.url, args.timeout):
      print("Backend failed to become healthy in time.")
      shutdown_backend()
      sys.exit(1)

  atexit.register(shutdown_backend)
  launch_window(args.url)


if __name__ == "__main__":
  main()
