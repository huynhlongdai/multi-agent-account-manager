use std::sync::Arc;
use std::time::Duration;
use tauri::AppHandle;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;
use serde_json::{json, Value};
use crate::session_manager::SessionManager;

pub async fn start_extension_server(app: AppHandle, mgr: Arc<SessionManager>) {
  let port = 28888;
  let listener = match TcpListener::bind(format!("127.0.0.1:{}", port)).await {
    Ok(l) => l,
    Err(e) => {
      eprintln!("[ExtensionServer] Failed to bind to 127.0.0.1:{}: {}", port, e);
      match TcpListener::bind("127.0.0.1:28889").await {
        Ok(l) => l,
        Err(e2) => {
          eprintln!("[ExtensionServer] Failed to bind fallback port 28889: {}", e2);
          return;
        }
      }
    }
  };

  if let Ok(addr) = listener.local_addr() {
    println!("[ExtensionServer] Local sync server active on {}", addr);
  }

  loop {
    let Ok((mut socket, _)) = listener.accept().await else {
      continue;
    };

    let app_clone = app.clone();
    let mgr_clone = Arc::clone(&mgr);

    tokio::spawn(async move {
      let mut buf = Vec::with_capacity(16384);
      let mut temp = [0u8; 4096];
      let mut content_length: Option<usize> = None;
      let mut header_end_pos: Option<usize> = None;

      let read_timeout = Duration::from_secs(10);
      let read_start = tokio::time::Instant::now();

      while read_start.elapsed() < read_timeout {
        let Ok(Ok(n)) = tokio::time::timeout(Duration::from_millis(500), socket.read(&mut temp)).await else {
          if buf.is_empty() {
            return;
          }
          if let Some(pos) = header_end_pos {
            if let Some(cl) = content_length {
              if buf.len() >= pos + cl {
                break;
              }
            } else {
              break;
            }
          }
          continue;
        };

        if n == 0 {
          break;
        }

        buf.extend_from_slice(&temp[..n]);

        if header_end_pos.is_none() {
          if let Some(pos) = buf.windows(4).position(|w| w == b"\r\n\r\n") {
            header_end_pos = Some(pos + 4);
            let headers_str = String::from_utf8_lossy(&buf[..pos]);
            for line in headers_str.lines() {
              if let Some((k, v)) = line.split_once(':') {
                if k.trim().eq_ignore_ascii_case("content-length") {
                  if let Ok(len) = v.trim().parse::<usize>() {
                    content_length = Some(len);
                  }
                }
              }
            }
          }
        }

        if let Some(pos) = header_end_pos {
          let needed = pos + content_length.unwrap_or(0);
          if buf.len() >= needed {
            break;
          }
        }

        if buf.len() > 10 * 1024 * 1024 {
          break;
        }
      }

      if buf.is_empty() {
        return;
      }

      let req_str = String::from_utf8_lossy(&buf);
      let mut lines = req_str.lines();
      let req_line = lines.next().unwrap_or("");
      let mut parts = req_line.split_whitespace();
      let method = parts.next().unwrap_or("GET");
      let path_raw = parts.next().unwrap_or("/");
      let path = path_raw.split('?').next().unwrap_or(path_raw);

      let cors_headers = "Access-Control-Allow-Origin: *\r\nAccess-Control-Allow-Methods: GET, POST, OPTIONS\r\nAccess-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With\r\n";

      if method == "OPTIONS" {
        let resp = format!("HTTP/1.1 204 No Content\r\n{}Content-Length: 0\r\nConnection: close\r\n\r\n", cors_headers);
        let _ = socket.write_all(resp.as_bytes()).await;
        return;
      }

      if method == "GET" && (path == "/api/status" || path == "/status") {
        let body = json!({
          "status": "ok",
          "app": "Multi-Agent Account Manager",
          "version": "0.2.1"
        }).to_string();
        let resp = format!(
          "HTTP/1.1 200 OK\r\n{}Content-Type: application/json; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
          cors_headers, body.len(), body
        );
        let _ = socket.write_all(resp.as_bytes()).await;
        return;
      }

      if method == "GET" && (path == "/api/providers" || path == "/providers") {
        let providers: Vec<Value> = crate::providers::all_provider_infos()
          .into_iter()
          .map(|p| json!({
            "id": p.id.as_str(),
            "name": p.name,
            "shortName": p.short_name,
            "enabled": p.enabled,
            "entryUrl": p.entry_url
          }))
          .collect();

        let body = json!({ "providers": providers }).to_string();
        let resp = format!(
          "HTTP/1.1 200 OK\r\n{}Content-Type: application/json; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
          cors_headers, body.len(), body
        );
        let _ = socket.write_all(resp.as_bytes()).await;
        return;
      }

      if method == "GET" && (path == "/api/accounts" || path == "/accounts") {
        let snap = mgr_clone.get_snapshot().await;
        let accounts: Vec<Value> = snap.accounts.into_iter().map(|a| json!({
          "providerId": a.provider_id.as_str(),
          "uuid": a.uuid,
          "alias": a.alias
        })).collect();

        let body = json!({ "accounts": accounts }).to_string();
        let resp = format!(
          "HTTP/1.1 200 OK\r\n{}Content-Type: application/json; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
          cors_headers, body.len(), body
        );
        let _ = socket.write_all(resp.as_bytes()).await;
        return;
      }

      if method == "POST" && (path == "/api/sync-account" || path == "/api/import-account") {
        let body_str = if let Some(h_end) = header_end_pos {
          String::from_utf8_lossy(&buf[h_end..]).to_string()
        } else {
          String::new()
        };

        let parsed: Value = match serde_json::from_str(&body_str) {
          Ok(v) => v,
          Err(e) => {
            let err_body = json!({ "success": false, "error": format!("Invalid JSON: {e}") }).to_string();
            let resp = format!(
              "HTTP/1.1 400 Bad Request\r\n{}Content-Type: application/json; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
              cors_headers, err_body.len(), err_body
            );
            let _ = socket.write_all(resp.as_bytes()).await;
            return;
          }
        };

        let raw_provider = parsed.get("provider")
          .or_else(|| parsed.get("providerId"))
          .and_then(|v| v.as_str())
          .unwrap_or("")
          .trim();

        let raw_alias = parsed.get("alias")
          .and_then(|v| v.as_str())
          .unwrap_or("")
          .trim();

        let raw_cookies = match parsed.get("cookies") {
          Some(Value::String(s)) => s.clone(),
          Some(other) => other.to_string(),
          None => String::new(),
        };

        if raw_provider.is_empty() || raw_cookies.is_empty() {
          let err_body = json!({ "success": false, "error": "Missing 'provider' or 'cookies' in payload" }).to_string();
          let resp = format!(
            "HTTP/1.1 400 Bad Request\r\n{}Content-Type: application/json; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
            cors_headers, err_body.len(), err_body
          );
          let _ = socket.write_all(resp.as_bytes()).await;
          return;
        }

        match mgr_clone.import_or_add_account_from_extension(&app_clone, raw_provider, raw_alias, &raw_cookies).await {
          Ok((action, final_alias)) => {
            let ok_body = json!({
              "success": true,
              "action": action,
              "provider": raw_provider,
              "alias": final_alias,
              "message": format!("Successfully {} account: {}", action, final_alias)
            }).to_string();
            let resp = format!(
              "HTTP/1.1 200 OK\r\n{}Content-Type: application/json; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
              cors_headers, ok_body.len(), ok_body
            );
            let _ = socket.write_all(resp.as_bytes()).await;
          }
          Err(err) => {
            let err_body = json!({ "success": false, "error": err }).to_string();
            let resp = format!(
              "HTTP/1.1 400 Bad Request\r\n{}Content-Type: application/json; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
              cors_headers, err_body.len(), err_body
            );
            let _ = socket.write_all(resp.as_bytes()).await;
          }
        }
        return;
      }

      let nf_body = json!({ "error": "Not Found" }).to_string();
      let resp = format!(
        "HTTP/1.1 404 Not Found\r\n{}Content-Type: application/json; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
        cors_headers, nf_body.len(), nf_body
      );
      let _ = socket.write_all(resp.as_bytes()).await;
    });
  }
}
