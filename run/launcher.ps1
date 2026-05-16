Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$defaultStreamerHandle = 'matt'
$defaultWorldId = '00000000-0000-0000-0000-000000000101'

function Escape-PowerShellSingleQuote {
  param([string]$Value)

  if ($null -eq $Value) {
    return ''
  }

  return $Value.Replace("'", "''")
}

function Test-PortAvailable {
  param([int]$Port)

  $listener = $null
  try {
    $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $Port)
    $listener.Start()
    return $true
  } catch {
    return $false
  } finally {
    if ($null -ne $listener) {
      try {
        $listener.Stop()
      } catch {
        # Ignore close-time race conditions.
      }
    }
  }
}

function Get-FreeBackendPort {
  param([int]$PreferredPort = 3000)

  for ($port = $PreferredPort; $port -lt ($PreferredPort + 20); $port++) {
    if (Test-PortAvailable -Port $port) {
      return $port
    }
  }

  throw "No free backend port found starting from $PreferredPort"
}

function Show-Message {
  param(
    [string]$Text,
    [string]$Title,
    [System.Windows.Forms.MessageBoxIcon]$Icon = [System.Windows.Forms.MessageBoxIcon]::Information
  )

  [System.Windows.Forms.MessageBox]::Show(
    $Text,
    $Title,
    [System.Windows.Forms.MessageBoxButtons]::OK,
    $Icon
  ) | Out-Null
}

function Open-Path {
  param([string]$Path)

  if (-not (Test-Path -LiteralPath $Path)) {
    throw "File not found: $Path"
  }

  Invoke-Item -LiteralPath $Path
}

function Open-Url {
  param([string]$Url)

  if ([string]::IsNullOrWhiteSpace($Url)) {
    return
  }

  Start-Process -FilePath $Url | Out-Null
}

function New-ServiceDefinition {
  param(
    [string]$Key,
    [string]$Label,
    [string]$Description,
    [string]$Command,
    [string]$WindowTitle,
    [string]$WorkspacePath,
    [string]$TargetUrl,
    [string]$Role,
    [int]$Port
  )

  [pscustomobject]@{
    Key = $Key
    Label = $Label
    Description = $Description
    Command = $Command
    WindowTitle = $WindowTitle
    WorkspacePath = $WorkspacePath
    TargetUrl = $TargetUrl
    Role = $Role
    Port = $Port
  }
}

function Build-ServiceCommand {
  param(
    [pscustomobject]$Service,
    [string]$BackendTarget,
    [int]$BackendPort
  )

  $parts = New-Object System.Collections.Generic.List[string]
  $parts.Add("`$Host.UI.RawUI.WindowTitle = '$(Escape-PowerShellSingleQuote $Service.WindowTitle)'")

  if ($Service.Role -eq 'backend') {
    $parts.Add("`$env:PORT = '$BackendPort'")
  } else {
    $parts.Add("`$env:VITE_BACKEND_TARGET = '$BackendTarget'")
  }

  $parts.Add("Set-Location -LiteralPath '$(Escape-PowerShellSingleQuote $Service.WorkspacePath)'")
  $parts.Add($Service.Command)

  return ($parts -join '; ')
}

function New-StatusChip {
  param([string]$Text)

  $label = New-Object System.Windows.Forms.Label
  $label.AutoSize = $false
  $label.Width = 104
  $label.Height = 30
  $label.TextAlign = [System.Drawing.ContentAlignment]::MiddleCenter
  $label.Font = New-Object System.Drawing.Font('Segoe UI', 9, [System.Drawing.FontStyle]::Bold)
  $label.Padding = New-Object System.Windows.Forms.Padding(6, 4, 6, 4)
  $label.Text = $Text
  return $label
}

function Set-ChipState {
  param(
    [System.Windows.Forms.Label]$Label,
    [string]$Text,
    [System.Drawing.Color]$BackColor,
    [System.Drawing.Color]$ForeColor
  )

  $Label.Text = $Text
  $Label.BackColor = $BackColor
  $Label.ForeColor = $ForeColor
}

function New-ActionButton {
  param([string]$Text)

  $button = New-Object System.Windows.Forms.Button
  $button.Text = $Text
  $button.Width = 118
  $button.Height = 36
  $button.FlatStyle = 'Flat'
  $button.FlatAppearance.BorderSize = 0
  $button.Font = New-Object System.Drawing.Font('Segoe UI', 9, [System.Drawing.FontStyle]::Bold)
  $button.BackColor = [System.Drawing.Color]::FromArgb(58, 64, 72)
  $button.ForeColor = [System.Drawing.Color]::White
  return $button
}

function New-InfoCard {
  param(
    [string]$Title,
    [string]$Value,
    [string]$Note
  )

  $panel = New-Object System.Windows.Forms.Panel
  $panel.BackColor = [System.Drawing.Color]::FromArgb(34, 38, 44)
  $panel.BorderStyle = 'FixedSingle'
  $panel.Size = New-Object System.Drawing.Size(320, 104)
  $panel.Margin = New-Object System.Windows.Forms.Padding(0, 0, 12, 0)

  $titleLabel = New-Object System.Windows.Forms.Label
  $titleLabel.Location = New-Object System.Drawing.Point(14, 10)
  $titleLabel.Size = New-Object System.Drawing.Size(280, 18)
  $titleLabel.ForeColor = [System.Drawing.Color]::FromArgb(190, 199, 209)
  $titleLabel.Font = New-Object System.Drawing.Font('Segoe UI', 8.5)
  $titleLabel.Text = $Title

  $valueLabel = New-Object System.Windows.Forms.Label
  $valueLabel.Location = New-Object System.Drawing.Point(14, 34)
  $valueLabel.Size = New-Object System.Drawing.Size(290, 24)
  $valueLabel.ForeColor = [System.Drawing.Color]::White
  $valueLabel.Font = New-Object System.Drawing.Font('Segoe UI Semibold', 11)
  $valueLabel.Text = $Value

  $noteLabel = New-Object System.Windows.Forms.Label
  $noteLabel.Location = New-Object System.Drawing.Point(14, 63)
  $noteLabel.Size = New-Object System.Drawing.Size(290, 24)
  $noteLabel.ForeColor = [System.Drawing.Color]::FromArgb(166, 176, 186)
  $noteLabel.Font = New-Object System.Drawing.Font('Segoe UI', 8.5)
  $noteLabel.Text = $Note

  $panel.Controls.AddRange(@($titleLabel, $valueLabel, $noteLabel))

  return [pscustomobject]@{
    Panel = $panel
    Value = $valueLabel
    Note = $noteLabel
  }
}

function Test-ServiceRunning {
  param([pscustomobject]$State)

  if ($null -eq $State.Process) {
    return $false
  }

  try {
    if ($State.Process.HasExited) {
      $State.LastExitCode = $State.Process.ExitCode
      $State.Process = $null
      if ($State.LastExitCode -eq 0) {
        $State.Status = 'Exited'
      } else {
        $State.Status = "Exited ($($State.LastExitCode))"
      }
      return $false
    }
  } catch {
    $State.Process = $null
    $State.Status = 'Stopped'
    return $false
  }

  return $true
}

function Get-ServiceUiState {
  param([pscustomobject]$State)

  if (Test-ServiceRunning -State $State) {
    return 'running'
  }

  if ($State.Status -like 'Launch failed*') {
    return 'failed'
  }

  if ($State.Status -like 'Exited*') {
    return 'stopped'
  }

  return 'idle'
}

function Update-ServiceCard {
  param(
    [string]$Key,
    [hashtable]$Ui,
    [pscustomobject]$State,
    [System.Drawing.Color]$ThemeAccent,
    [System.Drawing.Color]$ThemeSuccess,
    [System.Drawing.Color]$ThemeDanger,
    [System.Drawing.Color]$ThemeSurfaceStrong,
    [System.Drawing.Color]$ThemeText
  )

  $chip = $Ui.Status
  $running = Test-ServiceRunning -State $State
  $stateKind = Get-ServiceUiState -State $State

  switch ($stateKind) {
    'running' {
      Set-ChipState -Label $chip -Text 'Running' -BackColor $ThemeSuccess -ForeColor $ThemeText
      $Ui.Start.Enabled = $false
      $Ui.Stop.Enabled = $true
    }
    'failed' {
      Set-ChipState -Label $chip -Text 'Launch failed' -BackColor $ThemeDanger -ForeColor $ThemeText
      $Ui.Start.Enabled = $true
      $Ui.Stop.Enabled = $false
    }
    'stopped' {
      Set-ChipState -Label $chip -Text $State.Status -BackColor $ThemeSurfaceStrong -ForeColor $ThemeText
      $Ui.Start.Enabled = $true
      $Ui.Stop.Enabled = $false
    }
    default {
      Set-ChipState -Label $chip -Text $State.Status -BackColor $ThemeSurfaceStrong -ForeColor $ThemeText
      $Ui.Start.Enabled = $true
      $Ui.Stop.Enabled = $false
    }
  }

  if ($running) {
    $Ui.Start.Enabled = $false
    $Ui.Stop.Enabled = $true
  }

  $Ui.Endpoint.Text = "Open: $($State.Definition.TargetUrl)"
  if ($State.Status -like 'Launch failed*' -and -not [string]::IsNullOrWhiteSpace($State.LastError)) {
    $Ui.Detail.Text = "Error: $($State.LastError)"
  } elseif ($State.LastStartedAt) {
    $Ui.Detail.Text = "Started at: $($State.LastStartedAt.ToString('yyyy-MM-dd HH:mm:ss'))"
  } else {
    $Ui.Detail.Text = $State.Definition.Description
  }
}

function Refresh-Overview {
  param(
    [hashtable]$Overview,
    [hashtable]$ServiceState,
    [int]$BackendPort,
    [string]$BackendTarget
  )

  $runningCount = 0
  foreach ($entry in $ServiceState.GetEnumerator()) {
    if (Test-ServiceRunning -State $entry.Value) {
      $runningCount += 1
    }
  }

  $Overview.Backend.Value.Text = $BackendTarget
  $Overview.Backend.Note.Text = "Backend port: $BackendPort"
  $Overview.Running.Value.Text = "$runningCount / $($ServiceState.Count)"
  $Overview.Running.Note.Text = 'Running dev services'
  $Overview.Default.Value.Text = "$defaultStreamerHandle / $defaultWorldId"
  $Overview.Default.Note.Text = 'Default streamer and default world seed'
}

$backendPort = Get-FreeBackendPort
$backendTarget = "http://127.0.0.1:$backendPort"

$theme = @{
  Background = [System.Drawing.Color]::FromArgb(20, 22, 26)
  Surface = [System.Drawing.Color]::FromArgb(30, 34, 40)
  SurfaceAlt = [System.Drawing.Color]::FromArgb(36, 41, 48)
  SurfaceStrong = [System.Drawing.Color]::FromArgb(46, 52, 60)
  Border = [System.Drawing.Color]::FromArgb(67, 74, 84)
  Accent = [System.Drawing.Color]::FromArgb(82, 126, 224)
  Success = [System.Drawing.Color]::FromArgb(54, 146, 87)
  Danger = [System.Drawing.Color]::FromArgb(172, 68, 60)
  Text = [System.Drawing.Color]::White
  Muted = [System.Drawing.Color]::FromArgb(182, 190, 199)
}

$serviceDefinitions = @(
  New-ServiceDefinition `
    -Key 'backend' `
    -Label 'Backend' `
    -Description 'Server, world state, ticks, gift events' `
    -Command 'npm run dev:backend' `
    -WindowTitle 'AI Wasteland Survival v2 - Backend' `
    -WorkspacePath $repoRoot `
    -TargetUrl "http://127.0.0.1:${backendPort}/health" `
    -Role 'backend' `
    -Port $backendPort
  New-ServiceDefinition `
    -Key 'game' `
    -Label 'game-client' `
    -Description '2.5D game window for the streamer' `
    -Command 'npm run dev:game' `
    -WindowTitle 'AI Wasteland Survival v2 - game-client' `
    -WorkspacePath $repoRoot `
    -TargetUrl "http://127.0.0.1:5177/game/${defaultStreamerHandle}/${defaultWorldId}?mode=live" `
    -Role 'frontend' `
    -Port 5177
  New-ServiceDefinition `
    -Key 'streamer' `
    -Label 'Streamer' `
    -Description 'Streamer control console' `
    -Command 'npm run dev:streamer' `
    -WindowTitle 'AI Wasteland Survival v2 - Streamer' `
    -WorkspacePath $repoRoot `
    -TargetUrl "http://127.0.0.1:5173/" `
    -Role 'frontend' `
    -Port 5173
  New-ServiceDefinition `
    -Key 'overlay' `
    -Label 'Overlay' `
    -Description 'OBS overlay surface' `
    -Command 'npm run dev:overlay' `
    -WindowTitle 'AI Wasteland Survival v2 - Overlay' `
    -WorkspacePath $repoRoot `
    -TargetUrl "http://127.0.0.1:5174/" `
    -Role 'frontend' `
    -Port 5174
  New-ServiceDefinition `
    -Key 'viewer' `
    -Label 'Viewer' `
    -Description 'Viewer create and watch pages' `
    -Command 'npm run dev:viewer' `
    -WindowTitle 'AI Wasteland Survival v2 - Viewer' `
    -WorkspacePath $repoRoot `
    -TargetUrl "http://127.0.0.1:5175/s/${defaultStreamerHandle}/create" `
    -Role 'frontend' `
    -Port 5175
  New-ServiceDefinition `
    -Key 'admin' `
    -Label 'Admin' `
    -Description 'Platform admin console' `
    -Command 'npm run dev:admin' `
    -WindowTitle 'AI Wasteland Survival v2 - Admin' `
    -WorkspacePath $repoRoot `
    -TargetUrl "http://127.0.0.1:5176/" `
    -Role 'frontend' `
    -Port 5176
)

$serviceState = @{}
foreach ($definition in $serviceDefinitions) {
  $serviceState[$definition.Key] = [pscustomobject]@{
    Definition = $definition
    Process = $null
    Status = 'Stopped'
    LastStartedAt = $null
    LastExitCode = $null
    LastError = $null
  }
}

$ui = @{
  Overview = @{}
  Services = @{}
}

function Start-ServiceWindow {
  param([string]$Key)

  $state = $serviceState[$Key]
  if (Test-ServiceRunning -State $state) {
    return
  }

  try {
    $state.Status = 'Launching'
    $state.LastError = $null
    $state.LastExitCode = $null

    $command = Build-ServiceCommand -Service $state.Definition -BackendTarget $backendTarget -BackendPort $backendPort
    $child = Start-Process `
      -FilePath 'powershell.exe' `
      -WorkingDirectory $repoRoot `
      -WindowStyle Normal `
      -PassThru `
      -ArgumentList @(
        '-NoLogo',
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-NoExit',
        '-Command',
        $command
      )

    $state.Process = $child
    $state.LastStartedAt = Get-Date
    $state.Status = 'Running'
  } catch {
    $state.Process = $null
    $state.Status = 'Launch failed'
    $state.LastError = $_.Exception.Message
    Show-Message -Text "Failed to launch $($state.Definition.Label): $($state.LastError)" -Title 'Launch failed' -Icon Error
  }

  Update-ServiceCard `
    -Key $Key `
    -Ui $ui.Services[$Key] `
    -State $state `
    -ThemeAccent $theme.Accent `
    -ThemeSuccess $theme.Success `
    -ThemeDanger $theme.Danger `
    -ThemeSurfaceStrong $theme.SurfaceStrong `
    -ThemeText $theme.Text

  Refresh-Overview -Overview $ui.Overview -ServiceState $serviceState -BackendPort $backendPort -BackendTarget $backendTarget
}

function Stop-ServiceWindow {
  param([string]$Key)

  $state = $serviceState[$Key]
  if ($null -eq $state.Process) {
    $state.Status = 'Stopped'
    Update-ServiceCard `
      -Key $Key `
      -Ui $ui.Services[$Key] `
      -State $state `
      -ThemeAccent $theme.Accent `
      -ThemeSuccess $theme.Success `
      -ThemeDanger $theme.Danger `
      -ThemeSurfaceStrong $theme.SurfaceStrong `
      -ThemeText $theme.Text
    Refresh-Overview -Overview $ui.Overview -ServiceState $serviceState -BackendPort $backendPort -BackendTarget $backendTarget
    return
  }

  try {
    if (-not $state.Process.HasExited) {
      & taskkill.exe /PID $state.Process.Id /T /F | Out-Null
    }
  } catch {
    # Ignore common process races while closing.
  }

  $state.Process = $null
  $state.Status = 'Stopped'
  $state.LastExitCode = $null

  Update-ServiceCard `
    -Key $Key `
    -Ui $ui.Services[$Key] `
    -State $state `
    -ThemeAccent $theme.Accent `
    -ThemeSuccess $theme.Success `
    -ThemeDanger $theme.Danger `
    -ThemeSurfaceStrong $theme.SurfaceStrong `
    -ThemeText $theme.Text

  Refresh-Overview -Overview $ui.Overview -ServiceState $serviceState -BackendPort $backendPort -BackendTarget $backendTarget
}

function Stop-AllServiceWindow {
  foreach ($definition in $serviceDefinitions) {
    Stop-ServiceWindow -Key $definition.Key
  }
}

function Create-ServiceCard {
  param([pscustomobject]$Definition)

  $panel = New-Object System.Windows.Forms.Panel
  $panel.BackColor = $theme.Surface
  $panel.BorderStyle = 'FixedSingle'
  $panel.Margin = New-Object System.Windows.Forms.Padding(0, 0, 0, 12)
  $panel.Padding = New-Object System.Windows.Forms.Padding(14, 12, 14, 12)
  $panel.Height = 164

  $header = New-Object System.Windows.Forms.Panel
  $header.Dock = 'Top'
  $header.Height = 32

  $title = New-Object System.Windows.Forms.Label
  $title.AutoSize = $false
  $title.Dock = 'Fill'
  $title.TextAlign = [System.Drawing.ContentAlignment]::MiddleLeft
  $title.Padding = New-Object System.Windows.Forms.Padding(0, 0, 8, 0)
  $title.ForeColor = $theme.Text
  $title.Font = New-Object System.Drawing.Font('Segoe UI Semibold', 12)
  $title.Text = $Definition.Label

  $status = New-StatusChip -Text 'Stopped'
  $status.Dock = 'Right'
  $status.BackColor = $theme.SurfaceStrong
  $status.ForeColor = $theme.Text

  $header.Controls.Add($status)
  $header.Controls.Add($title)

  $detail = New-Object System.Windows.Forms.Label
  $detail.Dock = 'Top'
  $detail.Height = 24
  $detail.Margin = New-Object System.Windows.Forms.Padding(0, 8, 0, 0)
  $detail.ForeColor = $theme.Muted
  $detail.Font = New-Object System.Drawing.Font('Segoe UI', 8.75)
  $detail.Text = $Definition.Description

  $command = New-Object System.Windows.Forms.Label
  $command.Dock = 'Top'
  $command.Height = 22
  $command.Margin = New-Object System.Windows.Forms.Padding(0, 8, 0, 0)
  $command.ForeColor = [System.Drawing.Color]::FromArgb(216, 220, 226)
  $command.Font = New-Object System.Drawing.Font('Consolas', 8.5)
  $command.Text = $Definition.Command

  $endpoint = New-Object System.Windows.Forms.Label
  $endpoint.Dock = 'Top'
  $endpoint.Height = 22
  $endpoint.Margin = New-Object System.Windows.Forms.Padding(0, 8, 0, 0)
  $endpoint.ForeColor = [System.Drawing.Color]::FromArgb(144, 198, 255)
  $endpoint.Font = New-Object System.Drawing.Font('Segoe UI', 8.5)
  $endpoint.Text = "Open: $($Definition.TargetUrl)"

  $actions = New-Object System.Windows.Forms.FlowLayoutPanel
  $actions.Dock = 'Bottom'
  $actions.Height = 40
  $actions.FlowDirection = 'LeftToRight'
  $actions.WrapContents = $false
  $actions.Padding = New-Object System.Windows.Forms.Padding(0, 2, 0, 0)

  $startButton = New-ActionButton -Text 'Start'
  $stopButton = New-ActionButton -Text 'Stop'
  $openButton = New-ActionButton -Text 'Open'

  $startButton.BackColor = $theme.Accent
  $stopButton.BackColor = $theme.Danger
  $openButton.BackColor = [System.Drawing.Color]::FromArgb(70, 76, 84)

  $serviceKey = $Definition.Key
  $startButton.Add_Click({ Start-ServiceWindow -Key $serviceKey }.GetNewClosure())
  $stopButton.Add_Click({ Stop-ServiceWindow -Key $serviceKey }.GetNewClosure())
  $openButton.Add_Click({ Open-Url -Url $Definition.TargetUrl }.GetNewClosure())

  $actions.Controls.AddRange(@($startButton, $stopButton, $openButton))

  $panel.Controls.Add($actions)
  $panel.Controls.Add($endpoint)
  $panel.Controls.Add($command)
  $panel.Controls.Add($detail)
  $panel.Controls.Add($header)

  return [pscustomobject]@{
    Card = $panel
    Status = $status
    Start = $startButton
    Stop = $stopButton
    Open = $openButton
    Detail = $detail
    Command = $command
    Endpoint = $endpoint
  }
}

[System.Windows.Forms.Application]::EnableVisualStyles()

$form = New-Object System.Windows.Forms.Form
$form.Text = 'AI Wasteland Survival v2 - Dev Launcher'
$form.StartPosition = 'CenterScreen'
$form.Size = New-Object System.Drawing.Size(1280, 900)
$form.MinimumSize = New-Object System.Drawing.Size(1120, 760)
$form.BackColor = $theme.Background
$form.ForeColor = $theme.Text
$form.Font = New-Object System.Drawing.Font('Segoe UI', 9.5)
$form.AutoScaleMode = [System.Windows.Forms.AutoScaleMode]::Dpi

$header = New-Object System.Windows.Forms.Panel
$header.Dock = 'Top'
$header.Height = 108
$header.Padding = New-Object System.Windows.Forms.Padding(18, 14, 18, 10)
$header.BackColor = $theme.SurfaceAlt
$form.Controls.Add($header)

$title = New-Object System.Windows.Forms.Label
$title.AutoSize = $true
$title.Location = New-Object System.Drawing.Point(18, 12)
$title.Font = New-Object System.Drawing.Font('Segoe UI Semibold', 16)
$title.ForeColor = $theme.Text
$title.Text = 'AI Wasteland Survival v2'
$header.Controls.Add($title)

$subtitle = New-Object System.Windows.Forms.Label
$subtitle.AutoSize = $true
$subtitle.Location = New-Object System.Drawing.Point(20, 48)
$subtitle.Font = New-Object System.Drawing.Font('Segoe UI', 9.5)
$subtitle.ForeColor = $theme.Muted
$subtitle.Text = 'Single-streamer launch panel: unified backend port, unified frontend proxy, unified start/stop.'
$header.Controls.Add($subtitle)

$headerActions = New-Object System.Windows.Forms.FlowLayoutPanel
$headerActions.Dock = 'Right'
$headerActions.Width = 560
$headerActions.FlowDirection = 'LeftToRight'
$headerActions.WrapContents = $false
$headerActions.Padding = New-Object System.Windows.Forms.Padding(0, 2, 0, 0)
$header.Controls.Add($headerActions)

$openReadmeButton = New-ActionButton -Text 'Open README'
$openRunbookButton = New-ActionButton -Text 'Open Runbook'
$openReadmeButton.BackColor = [System.Drawing.Color]::FromArgb(70, 76, 84)
$openRunbookButton.BackColor = [System.Drawing.Color]::FromArgb(70, 76, 84)
$openReadmeButton.Add_Click({ Open-Path -Path (Join-Path $repoRoot 'README.md') })
$openRunbookButton.Add_Click({ Open-Path -Path (Join-Path $repoRoot 'docs/BETA_RUNBOOK.md') })
$headerActions.Controls.AddRange(@($openReadmeButton, $openRunbookButton))

$overviewPanel = New-Object System.Windows.Forms.FlowLayoutPanel
$overviewPanel.Dock = 'Top'
$overviewPanel.Height = 120
$overviewPanel.Padding = New-Object System.Windows.Forms.Padding(18, 14, 18, 6)
$overviewPanel.FlowDirection = 'LeftToRight'
$overviewPanel.WrapContents = $false
$overviewPanel.BackColor = $theme.Background
$form.Controls.Add($overviewPanel)

$overviewCards = @{
  Backend = New-InfoCard -Title 'Backend target' -Value $backendTarget -Note 'Launcher picks a free port automatically'
  Running = New-InfoCard -Title 'Running services' -Value '0 / 0' -Note 'Status refreshes automatically'
  Default = New-InfoCard -Title 'Default streamer / world' -Value "$defaultStreamerHandle / $defaultWorldId" -Note 'Used by game-client and viewer shortcuts'
}

foreach ($card in @($overviewCards.Backend, $overviewCards.Running, $overviewCards.Default)) {
  $overviewPanel.Controls.Add($card.Panel)
}

$actionsPanel = New-Object System.Windows.Forms.FlowLayoutPanel
$actionsPanel.Dock = 'Top'
$actionsPanel.Height = 52
$actionsPanel.Padding = New-Object System.Windows.Forms.Padding(18, 0, 18, 8)
$actionsPanel.FlowDirection = 'LeftToRight'
$actionsPanel.WrapContents = $false
$actionsPanel.BackColor = $theme.Background
$form.Controls.Add($actionsPanel)

$startAllButton = New-ActionButton -Text 'Start all'
$stopAllButton = New-ActionButton -Text 'Stop all'
$refreshButton = New-ActionButton -Text 'Refresh'
$openBackendButton = New-ActionButton -Text 'Open backend'
$openGameButton = New-ActionButton -Text 'Open game-client'
$openViewerButton = New-ActionButton -Text 'Open viewer'

$startAllButton.BackColor = $theme.Accent
$stopAllButton.BackColor = $theme.Danger
$refreshButton.BackColor = [System.Drawing.Color]::FromArgb(70, 76, 84)
$openBackendButton.BackColor = [System.Drawing.Color]::FromArgb(70, 76, 84)
$openGameButton.BackColor = [System.Drawing.Color]::FromArgb(70, 76, 84)
$openViewerButton.BackColor = [System.Drawing.Color]::FromArgb(70, 76, 84)

$actionsPanel.Controls.AddRange(@(
  $startAllButton,
  $stopAllButton,
  $refreshButton,
  $openBackendButton,
  $openGameButton,
  $openViewerButton
))

$serviceHost = New-Object System.Windows.Forms.FlowLayoutPanel
$serviceHost.Dock = 'Fill'
$serviceHost.Padding = New-Object System.Windows.Forms.Padding(18, 0, 18, 12)
$serviceHost.FlowDirection = 'TopDown'
$serviceHost.WrapContents = $false
$serviceHost.AutoScroll = $true
$serviceHost.BackColor = $theme.Background
$form.Controls.Add($serviceHost)

foreach ($definition in $serviceDefinitions) {
  $cardUi = Create-ServiceCard -Definition $definition
  $ui.Services[$definition.Key] = $cardUi
  $serviceHost.Controls.Add($cardUi.Card)
}

$footer = New-Object System.Windows.Forms.StatusStrip
$footer.SizingGrip = $false
$footer.BackColor = $theme.SurfaceAlt
$footer.ForeColor = $theme.Muted

$footerLabel = New-Object System.Windows.Forms.ToolStripStatusLabel
$footerLabel.Spring = $true
$footerLabel.TextAlign = [System.Drawing.ContentAlignment]::MiddleLeft
$footerLabel.Text = "Repo root: $repoRoot"

$footerHint = New-Object System.Windows.Forms.ToolStripStatusLabel
$footerHint.AutoSize = $true
$footerHint.Text = "Backend Port: $backendPort"

$footer.Items.AddRange(@($footerLabel, $footerHint))
$form.Controls.Add($footer)

function Refresh-AllUi {
  foreach ($definition in $serviceDefinitions) {
    $state = $serviceState[$definition.Key]
    Update-ServiceCard `
      -Key $definition.Key `
      -Ui $ui.Services[$definition.Key] `
      -State $state `
      -ThemeAccent $theme.Accent `
      -ThemeSuccess $theme.Success `
      -ThemeDanger $theme.Danger `
      -ThemeSurfaceStrong $theme.SurfaceStrong `
      -ThemeText $theme.Text
  }

  Refresh-Overview -Overview $ui.Overview -ServiceState $serviceState -BackendPort $backendPort -BackendTarget $backendTarget

  $runningCount = 0
  foreach ($stateEntry in $serviceState.GetEnumerator()) {
    if (Test-ServiceRunning -State $stateEntry.Value) {
      $runningCount += 1
    }
  }

  $footerLabel.Text = "Repo root: $repoRoot  |  Running: $runningCount / $($serviceDefinitions.Count)"
  $footerHint.Text = "Backend Target: $backendTarget"
}

$openBackendButton.Add_Click({ Open-Url -Url "http://127.0.0.1:$backendPort/health" })
$openGameButton.Add_Click({ Open-Url -Url "http://127.0.0.1:5177/game/${defaultStreamerHandle}/${defaultWorldId}?mode=live" })
$openViewerButton.Add_Click({ Open-Url -Url "http://127.0.0.1:5175/s/${defaultStreamerHandle}/create" })

$startAllButton.Add_Click({
  foreach ($definition in $serviceDefinitions) {
    Start-ServiceWindow -Key $definition.Key
  }
})

$stopAllButton.Add_Click({
  Stop-AllServiceWindow
})

$refreshButton.Add_Click({
  Refresh-AllUi
})

$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 700
$timer.Add_Tick({
  Refresh-AllUi
})
$timer.Start()

$form.Add_Shown({
  Refresh-AllUi
})

$form.Add_FormClosing({
  $running = $serviceDefinitions | Where-Object { Test-ServiceRunning -State $serviceState[$_.Key] }
  if ($running.Count -eq 0) {
    return
  }

  $result = [System.Windows.Forms.MessageBox]::Show(
    'Some services are still running. Close all launched windows when exiting the launcher?',
    'Confirm exit',
    [System.Windows.Forms.MessageBoxButtons]::YesNoCancel,
    [System.Windows.Forms.MessageBoxIcon]::Question
  )

  if ($result -eq [System.Windows.Forms.DialogResult]::Cancel) {
    $_.Cancel = $true
    return
  }

  if ($result -eq [System.Windows.Forms.DialogResult]::Yes) {
    Stop-AllServiceWindow
    return
  }

  $_.Cancel = $true
})

[System.Windows.Forms.Application]::Run($form)
