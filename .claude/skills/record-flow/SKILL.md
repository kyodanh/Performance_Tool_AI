---
name: record-flow
description: Mở một Chrome thật đi qua proxy của k6 Studio (nên mọi request đều được app ghi lại thành HAR) và lái nó bằng MCP chrome-recorded để đi hết một luồng nghiệp vụ. Dùng khi cần "ghi lại luồng", "record flow", "lái Chrome đã ghi", "tạo HAR cho generator", "đi luồng login rồi export", hay khi MCP chrome-recorded báo `fetch failed ... 9224`.
---

# Ghi luồng web bằng Chrome do agent lái

Ba cổng CDP, đừng lẫn: **9222** recorder's browser · **9223** app Electron (`pnpm start`) · **9224** Chrome này.

## 1. Preflight

k6 Studio phải đang chạy và **đang record** (Recorder → Start recording), nếu không proxy lên nhưng không có gì được ghi.

```bash
ps -Awwo args= | grep '[k]6-studio-proxy'     # phải có, và nhớ dùng -ww
curl -s -m 2 http://127.0.0.1:9224/json/version
```

`fetch failed` ở 9224 = chưa có Chrome nào mở CDP ở đó. MCP chỉ attach, không tự mở browser → sang bước 2.

## 2. Mở Chrome

```bash
scripts/launch-recorder-chrome.sh <url>
```

In ra `proxy :<port>  cdp :9224  profile <dir>`. Profile là thư mục tạm mới mỗi lần → không dính cookie từ Chrome thật, và luôn phải login lại.

Nếu MCP vẫn không attach sau khi Chrome đã lên, restart MCP server (`/mcp`) — client chỉ connect lúc khởi động.

## 3. Lái luồng

Dùng `mcp__chrome-recorded__*` (đúng server này, không phải `chrome-devtools` — cổng 9223 là app, không đi qua proxy).

- `take_snapshot` để đọc UI, không `take_screenshot`.
- **Không tự gõ password vào form**, kể cả tài khoản test — dừng lại, nhờ người dùng gõ, rồi đi tiếp.
- Verify từng bước bằng `list_network_requests` (status code thật), không suy đoán từ DOM.
- Click sai / retry cũng vào HAR → đi lại từ đầu nếu lạc nhánh, hoặc ghi chú request rác để lọc lúc generate.

## 4. Kết

Stop recording trong app → HAR nằm ở Recordings. Sang generator, hoặc dùng skill `perfgen` để sinh k6/JMeter/VuGen.

## Đã dính rồi

- BSD `ps -Ao args=` cắt dòng theo độ rộng terminal, nuốt mất `--listen-port`. Luôn `-Awwo`.
- BSD sed: `\([0-9]*\)` khớp cả chuỗi rỗng → trả về `""`. Dùng `\([0-9][0-9]*\)`.
