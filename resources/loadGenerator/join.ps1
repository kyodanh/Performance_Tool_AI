# k6 Studio load generator.
#
# Fetched from the controller, which fills in the placeholders below before
# serving it. The script therefore always matches the controller that served it
# - there is no agent version to keep in sync.
#
# Joins the controller's pool, then waits for work. Ctrl-C to leave.
#
# Needs no administrator rights: nothing listens, nothing is installed as a
# service, and no inbound port is opened.

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$Controller = '__CONTROLLER__'
$Key = '__KEY__'
$K6Version = '__K6_VERSION__'

$Arch = if ($env:PROCESSOR_ARCHITECTURE -eq 'AMD64') { 'amd64' } else { $env:PROCESSOR_ARCHITECTURE.ToLower() }

if ($Arch -ne 'amd64') {
  Write-Host "k6 Studio: k6 has no windows/$Arch build - this machine cannot be a load generator."
  return
}

$Dir = Join-Path $env:USERPROFILE '.k6-studio'
$Bin = Join-Path $Dir "bin\k6-$K6Version.exe"

New-Item -ItemType Directory -Force -Path (Join-Path $Dir 'bin'), (Join-Path $Dir 'run') | Out-Null

# Stable id for this joiner, kept on disk so a rejoin lands on the same row in
# the app rather than creating a new one.
$InstanceFile = Join-Path $Dir 'instance'

if (-not (Test-Path $InstanceFile)) {
  [guid]::NewGuid().ToString('N') | Set-Content -NoNewline $InstanceFile
}

$Instance = (Get-Content -Raw $InstanceFile).Trim()

# The controller only ships the binary for its own platform, so a mixed pool
# falls back to the matching GitHub release. Downloaded under a temporary name
# and renamed, so an interrupted download never leaves a broken binary behind.
if (-not (Test-Path $Bin)) {
  $tmp = "$Bin.tmp"

  try {
    Invoke-WebRequest -UseBasicParsing -Uri "$Controller/lg/$Key/k6?os=windows&arch=$Arch" -OutFile $tmp
  }
  catch {
    Write-Host "  k6            downloading $K6Version for windows/$Arch..."

    $name = "k6-$K6Version-windows-$Arch"
    $zip = Join-Path $env:TEMP "$name.zip"

    Invoke-WebRequest -UseBasicParsing -OutFile $zip `
      -Uri "https://github.com/grafana/k6/releases/download/$K6Version/$name.zip"
    Expand-Archive -Path $zip -DestinationPath $env:TEMP -Force
    Move-Item -Force (Join-Path $env:TEMP "$name\k6.exe") $tmp
    Remove-Item -Recurse -Force $zip, (Join-Path $env:TEMP $name)
  }

  Move-Item -Force $tmp $Bin
}

# Windows caps concurrent sockets through the ephemeral port range rather than a
# file-descriptor limit. Reported so the app can warn only when the planned VU
# count actually exceeds it. netsh output is localised, so a miss is not fatal.
$Ports = 'unknown'

try {
  # Only the start port and the count are numeric in this output, in that order,
  # so reading the numbers positionally survives translation.
  $numbers = [regex]::Matches((netsh int ipv4 show dynamicport tcp) -join "`n", '\d+')

  if ($numbers.Count -ge 2) {
    $start = [int]$numbers[0].Value
    $count = [int]$numbers[1].Value
    $Ports = "$start-$($start + $count - 1)"
  }
}
catch {
  # Leave it unknown — the app treats that as "cannot advise", not as a failure.
}

# `k6 version` echoes the binary's own filename first, which is the
# version-pinned name we gave it - so only the version itself is useful.
# Running it also proves the download is intact: a blocked or quarantined
# k6.exe fails here with something the user can act on, rather than at run time.
$K6Version_Reported = try { (& $Bin version) -split ' ' | Select-Object -Skip 1 -First 1 } catch { $null }

if (-not $K6Version_Reported) {
  Write-Host "k6 Studio: $Bin will not run."
  Write-Host '  Windows Defender may have quarantined it. Allow the folder and try again:'
  Write-Host "  Add-MpPreference -ExclusionPath `"$Dir`""
  return
}

$K6Build = "k6 $K6Version_Reported"

# CPU busy percentage and memory in use, sent with every heartbeat so the app can
# tell a saturated generator from a slow target.
function Get-Resources {
  try {
    $load = (Get-CimInstance Win32_Processor |
      Measure-Object -Property LoadPercentage -Average).Average
    $osInfo = Get-CimInstance Win32_OperatingSystem
    $total = [int64]$osInfo.TotalVisibleMemorySize * 1024

    return @{
      cpuPercent    = [int]$load
      cpuCount      = [Environment]::ProcessorCount
      memUsedBytes  = $total - [int64]$osInfo.FreePhysicalMemory * 1024
      memTotalBytes = $total
    } | ConvertTo-Json -Compress
  }
  catch {
    # A machine whose counters will not answer still beats - it just reports
    # nothing, which the app shows as no reading rather than as an idle machine.
    return '{}'
  }
}

# Called again if the controller forgets us - it restarts far more often than a
# generator does, and re-running the one-liner by hand for that would be a poor
# trade.
function Join-Pool {
  $body = @{
    instance  = $Instance
    hostname  = $env:COMPUTERNAME
    user      = $env:USERNAME
    os        = 'windows'
    arch      = $Arch
    k6Version = $K6Build
    nofile    = 'n/a'
    ports     = $Ports
    clock     = [int][DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
  } | ConvertTo-Json -Compress

  try {
    return Invoke-RestMethod -Method Post -ContentType 'application/json' -Body $body `
      -Uri "$Controller/lg/$Key/join"
  }
  catch {
    return $null
  }
}

$joined = Join-Pool

if (-not $joined) {
  Write-Host 'k6 Studio: the controller rejected this join - the code may have expired.'
  return
}

Write-Host @"

k6 Studio - load generator

  IP            $($joined.ip)
  Host          $env:COMPUTERNAME
  OS            windows/$Arch
  k6            $K6Build
  Open files    n/a
  Ports         $Ports
  Controller    $Controller

  Status        READY - waiting for the controller

  Press Ctrl-C to leave the pool.

"@

$Archive = Join-Path $Dir 'run\archive.tar'

# Runs this generator's share of one test. The controller decides the share; the
# flags it sends already carry the execution segment.
#
# Windows has no FIFO, so instead of piping into curl the output is written
# straight onto a chunked request stream as k6 produces it - same effect: metrics
# reach the controller live and nothing is buffered for the length of the run.
function Invoke-Test {
  param([string]$Flags)

  Write-Host "running: $Flags"

  try {
    Invoke-WebRequest -UseBasicParsing -OutFile $Archive `
      -Uri "$Controller/gen/$($joined.id)/archive"
  }
  catch {
    Write-Host 'could not download the test archive'
    return
  }

  $upload = [Net.HttpWebRequest]::Create("$Controller/gen/$($joined.id)/stats")
  $upload.Method = 'POST'
  $upload.ContentType = 'text/csv'
  $upload.SendChunked = $true
  $stream = $upload.GetRequestStream()
  $writer = New-Object IO.StreamWriter($stream)

  $info = New-Object Diagnostics.ProcessStartInfo
  $info.FileName = $Bin
  # Both stdout (CSV metrics) and stderr (JSON logs) go to the controller, which
  # tells them apart and tags the logs with this host's name.
  $info.Arguments = "run $Flags `"$Archive`""
  $info.RedirectStandardOutput = $true
  $info.RedirectStandardError = $true
  $info.UseShellExecute = $false

  $k6 = [Diagnostics.Process]::Start($info)
  $lastBeat = [DateTime]::UtcNow

  try {
    while (-not $k6.StandardOutput.EndOfStream) {
      $writer.WriteLine($k6.StandardOutput.ReadLine())

      if (([DateTime]::UtcNow - $lastBeat).TotalSeconds -ge 2) {
        $writer.Flush()
        $lastBeat = [DateTime]::UtcNow

        try {
          $beat = Invoke-RestMethod -Method Post -ContentType 'application/json' `
            -Body (Get-Resources) -Uri "$Controller/gen/$($joined.id)/beat"

          if ($beat.abort) {
            Write-Host 'stopped by the controller'
            $k6.Kill()
            break
          }
        }
        catch {
          # A missed heartbeat mid-run is not a reason to abandon the test.
        }
      }
    }

    $writer.WriteLine($k6.StandardError.ReadToEnd())
  }
  finally {
    $writer.Flush()
    $writer.Dispose()

    try {
      $upload.GetResponse().Dispose()
    }
    catch {
      # The controller closes the request once it has the output.
    }

    if (-not $k6.HasExited) {
      $k6.Kill()
    }
  }

  Write-Host 'finished - waiting for the next test'
}

try {
  while ($true) {
    try {
      $beat = Invoke-RestMethod -Method Post -ContentType 'application/json' `
        -Body (Get-Resources) -Uri "$Controller/gen/$($joined.id)/beat"

      if ($beat.stop) {
        Write-Host 'disconnected by the controller'
        return
      }

      $work = Invoke-RestMethod -Method Post -Uri "$Controller/gen/$($joined.id)/work"

      if ($work.flags) {
        try {
          Invoke-Test -Flags $work.flags
        }
        catch {
          # Reported here rather than falling through to the handler below, which
          # would blame the network for a failure that is local.
          Write-Host "test failed on this machine: $($_.Exception.Message)"
        }

        continue
      }
    }
    catch {
      # A 404 means something specific: the controller no longer knows this
      # generator, so re-joining keeps this machine in the pool without the user
      # walking back over to it.
      if ($_.Exception.Response.StatusCode.value__ -eq 404) {
        $joined = Join-Pool

        if ($joined) {
          Write-Host "controller restarted - rejoined as $($joined.ip)"
        }
        else {
          Write-Host 'controller restarted and the code has expired - get a new one'
          return
        }
      }
      else {
        Write-Host 'controller unreachable - retrying'
      }
    }

    Start-Sleep -Seconds 2
  }
}
finally {
  try {
    Invoke-RestMethod -Method Post -Uri "$Controller/gen/$($joined.id)/leave" | Out-Null
  }
  catch {
    # The controller drops generators that stop sending heartbeats anyway.
  }
}
