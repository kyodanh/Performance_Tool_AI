#!/bin/sh
# k6 Studio load generator.
#
# Fetched from the controller, which fills in the placeholders below before
# serving it. The script therefore always matches the controller that served it
# — there is no agent version to keep in sync.
#
# Joins the controller's pool, then waits for work. Ctrl-C to leave.
set -eu

CONTROLLER='__CONTROLLER__'
KEY='__KEY__'
K6_VERSION='__K6_VERSION__'

DIR="$HOME/.k6-studio"
BIN="$DIR/bin/k6-$K6_VERSION"

case "$(uname -s)" in
Darwin) OS=macos ;;
Linux) OS=linux ;;
*)
  echo "k6 Studio: unsupported operating system $(uname -s)" >&2
  exit 1
  ;;
esac

case "$(uname -m)" in
arm64 | aarch64) ARCH=arm64 ;;
x86_64 | amd64) ARCH=amd64 ;;
*)
  echo "k6 Studio: unsupported architecture $(uname -m)" >&2
  exit 1
  ;;
esac

mkdir -p "$DIR/bin" "$DIR/run"

# Stable id for this joiner, kept on disk so a rejoin lands on the same row in
# the app rather than creating a new one.
INSTANCE_FILE="$DIR/instance"

if [ ! -s "$INSTANCE_FILE" ]; then
  head -c 8 /dev/urandom | od -An -tx1 | tr -d ' \n' >"$INSTANCE_FILE"
fi

INSTANCE="$(cat "$INSTANCE_FILE")"

# The controller only ships the binary for its own platform, so a mixed pool
# falls back to the matching GitHub release. Written to a temporary name and
# renamed, so an interrupted download never leaves a half-written binary behind
# — and so two generators sharing an NFS home cannot race each other.
install_k6() {
  tmp="$BIN.$$"

  if curl -fsS -o "$tmp" "$CONTROLLER/lg/$KEY/k6?os=$OS&arch=$ARCH"; then
    chmod +x "$tmp"
    mv -f "$tmp" "$BIN"
    return
  fi

  echo "  k6            downloading $K6_VERSION for $OS/$ARCH..."

  name="k6-$K6_VERSION-$OS-$ARCH"
  base="https://github.com/grafana/k6/releases/download/$K6_VERSION"

  # macOS releases ship as zip, which unzip cannot read from a pipe.
  if [ "$OS" = macos ]; then
    curl -fsSL -o "$tmp.zip" "$base/$name.zip"
    unzip -p "$tmp.zip" "$name/k6" >"$tmp"
    rm -f "$tmp.zip"
  else
    curl -fsSL "$base/$name.tar.gz" | tar -xzO "$name/k6" >"$tmp"
  fi

  chmod +x "$tmp"
  mv -f "$tmp" "$BIN"
}

[ -x "$BIN" ] || install_k6

# The soft limit is what actually caps concurrent sockets, and raising it to the
# hard limit needs no privileges — so there is nothing for the user to tune.
NOFILE="$(ulimit -Hn 2>/dev/null || echo unknown)"

if [ "$OS" = linux ]; then
  PORTS="$(tr '\t' '-' </proc/sys/net/ipv4/ip_local_port_range 2>/dev/null || echo unknown)"
else
  PORTS="$(sysctl -n net.inet.ip.portrange.first 2>/dev/null || echo '?')-$(sysctl -n net.inet.ip.portrange.last 2>/dev/null || echo '?')"
fi

# `k6 version` echoes the binary's own filename first, which is the
# version-pinned name we gave it — so only the version itself is useful.
K6_BUILD="k6 $("$BIN" version | cut -d' ' -f2)"

# CPU busy percentage and memory in use, sent with every heartbeat so the app can
# tell a saturated generator from a slow target. Both platforms need a window to
# measure CPU across; the second of wall clock costs the run nothing, because
# neither `iostat` nor a second read of /proc/stat spends CPU waiting.
cpu_ticks() {
  awk '/^cpu /{ total = 0; for (i = 2; i <= NF; i++) total += $i; print total, $5 }' /proc/stat
}

sample_resources() {
  if [ "$OS" = linux ]; then
    cores="$(getconf _NPROCESSORS_ONLN 2>/dev/null || echo 0)"
    before="$(cpu_ticks)"
    sleep 1
    cpu="$(printf '%s %s' "$before" "$(cpu_ticks)" | awk '{
      total = $3 - $1
      idle = $4 - $2
      printf "%d", (total > 0 ? (1 - idle / total) * 100 + 0.5 : 0)
    }')"
    # `MemAvailable` is the kernel's own estimate of what a new workload could
    # claim, so reclaimable cache does not read as used.
    mem="$(awk '/^MemTotal:/{ total = $2 } /^MemAvailable:/{ available = $2 }
      END { printf "%d %d", (total - available) * 1024, total * 1024 }' /proc/meminfo)"
  else
    cores="$(sysctl -n hw.ncpu 2>/dev/null || echo 0)"
    cpu="$(iostat -c 2 -w 1 -n 0 2>/dev/null | tail -1 | awk '{ printf "%d", 100 - $3 }')"
    total="$(sysctl -n hw.memsize 2>/dev/null || echo 0)"
    # Inactive and speculative pages are cache the kernel hands back on demand,
    # which is what Linux calls available.
    mem="$(vm_stat 2>/dev/null | awk -v total="$total" '
      /page size of/ { size = $8 }
      /Pages free/ { free = $3 }
      /Pages inactive/ { inactive = $3 }
      /Pages speculative/ { speculative = $3 }
      END { printf "%d %d", total - (free + inactive + speculative) * size, total }')"
  fi

  # A machine whose tools are missing still beats — it just reports zeroes,
  # which the app shows as no reading rather than as an idle machine.
  printf '{"cpuPercent":%s,"cpuCount":%s,"memUsedBytes":%s,"memTotalBytes":%s}' \
    "${cpu:-0}" "${cores:-0}" "$(printf '%s' "${mem:-0 0}" | cut -d' ' -f1)" \
    "$(printf '%s' "${mem:-0 0}" | cut -d' ' -f2)"
}

# Sets ID and IP. Called again if the controller forgets us — it restarts far
# more often than a generator does, and re-running the one-liner by hand for that
# would be a poor trade.
join_pool() {
  body="$(printf '{"instance":"%s","hostname":"%s","user":"%s","os":"%s","arch":"%s","k6Version":"%s","nofile":"%s","ports":"%s","clock":%s}' \
    "$INSTANCE" "$(hostname)" "$(id -un)" "$OS" "$ARCH" "$K6_BUILD" "$NOFILE" "$PORTS" "$(date +%s)")"

  response="$(curl -fsS -X POST -H 'content-type: application/json' -d "$body" \
    "$CONTROLLER/lg/$KEY/join" 2>/dev/null || true)"

  ID="$(printf '%s' "$response" | sed -n 's/.*"id":"\([^"]*\)".*/\1/p')"

  # The controller reports the address it actually sees, which beats guessing
  # among a VM's several interfaces — and it is the address shown in the app.
  IP="$(printf '%s' "$response" | sed -n 's/.*"ip":"\([^"]*\)".*/\1/p')"

  [ -n "$ID" ]
}

if ! join_pool; then
  echo "k6 Studio: the controller rejected this join — the code may have expired." >&2
  exit 1
fi

cat <<EOF

k6 Studio · load generator

  IP            $IP
  Host          $(hostname)
  OS            $OS/$ARCH
  k6            $K6_BUILD
  Open files    $NOFILE
  Ports         $PORTS
  Controller    $CONTROLLER

  Status        READY — waiting for the controller

  Press Ctrl-C to leave the pool.

EOF

ARCHIVE="$DIR/run/archive.tar"
FIFO="$DIR/run/output"

leave() {
  curl -fsS -X POST "$CONTROLLER/gen/$ID/leave" -o /dev/null 2>/dev/null || true
  rm -f "$FIFO"
  echo "left the pool"
  exit 0
}

trap leave INT TERM

# Runs this generator's share of one test. The controller decides the share; the
# flags it sends already carry the execution segment.
run_test() {
  flags="$1"

  echo "running: $flags"

  if ! curl -fsS -o "$ARCHIVE" "$CONTROLLER/gen/$ID/archive"; then
    echo "could not download the test archive"
    return
  fi

  rm -f "$FIFO"
  mkfifo "$FIFO"

  # `-T` on a pipe streams as k6 writes, so metrics reach the controller live and
  # this script never has to batch them. `--data-binary @-` would buffer the whole
  # run in memory instead.
  curl -fsS -X POST -H 'content-type: text/csv' -T "$FIFO" \
    "$CONTROLLER/gen/$ID/stats" >/dev/null 2>&1 &
  upload=$!

  # Both stdout (CSV metrics) and stderr (JSON logs) go to the controller, which
  # tells them apart and tags the logs with this host's name.
  # shellcheck disable=SC2086 # deliberate word split: the controller sends flags
  "$BIN" run $flags "$ARCHIVE" >"$FIFO" 2>&1 &
  k6=$!

  while kill -0 "$k6" 2>/dev/null; do
    reply="$(curl -fsS -X POST -H 'content-type: application/json' \
      -d "$(sample_resources)" "$CONTROLLER/gen/$ID/beat" 2>/dev/null || true)"

    case "$reply" in
    *'"abort":true'*)
      echo "stopped by the controller"
      kill "$k6" 2>/dev/null || true
      break
      ;;
    esac

    sleep 2
  done

  wait "$k6" 2>/dev/null || true
  wait "$upload" 2>/dev/null || true
  rm -f "$FIFO"

  echo "finished — waiting for the next test"
}

BEAT="$DIR/run/beat.json"

while true; do
  # The status is read rather than relying on `-f`, because a 404 means something
  # specific: the controller no longer knows this generator.
  status="$(curl -sS -o "$BEAT" -w '%{http_code}' -X POST \
    -H 'content-type: application/json' -d "$(sample_resources)" \
    "$CONTROLLER/gen/$ID/beat" 2>/dev/null || echo 000)"
  reply="$(cat "$BEAT" 2>/dev/null || true)"

  case "$status" in
  200)
    case "$reply" in
    *'"stop":true'*)
      echo "disconnected by the controller"
      exit 0
      ;;
    esac

    work="$(curl -fsS -X POST "$CONTROLLER/gen/$ID/work" 2>/dev/null || true)"
    flags="$(printf '%s' "$work" | sed -n 's/.*"flags":"\([^"]*\)".*/\1/p')"

    if [ -n "$flags" ]; then
      run_test "$flags"

      continue
    fi
    ;;
  404)
    # The controller was restarted. Re-joining keeps this machine in the pool
    # without the user walking back over to it.
    if join_pool; then
      echo "controller restarted — rejoined as $IP"
    else
      echo "controller restarted and the code has expired — get a new one"
      exit 1
    fi
    ;;
  *)
    echo "controller unreachable — retrying"
    ;;
  esac

  sleep 2
done
