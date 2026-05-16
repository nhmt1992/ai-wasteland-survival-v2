Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path

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
        # Ignore cleanup failures.
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

  throw "无法找到可用的后端端口（从 $PreferredPort 开始）"
}

$backendPort = Get-FreeBackendPort
$backendTarget = "http://127.0.0.1:$backendPort"

$serviceDefinitions = @(
  [pscustomobject]@{
    Key = 'backend'
    Label = '后端'
    Command = 'npm run dev:backend'
    WindowTitle = 'AI Wasteland Survival v2 - 后端'
    Description = '服务端、世界状态、Tick、礼物事件'
    Role = 'backend'
  },
  [pscustomobject]@{
    Key = 'game'
    Label = 'game-client'
    Command = 'npm run dev:game'
    WindowTitle = 'AI Wasteland Survival v2 - game-client'
    Description = '主播窗口 2.5D 游戏画面'
    Role = 'frontend'
  },
  [pscustomobject]@{
    Key = 'streamer'
    Label = '主播端'
    Command = 'npm run dev:streamer'
    WindowTitle = 'AI Wasteland Survival v2 - 主播端'
    Description = '主播控制台'
    Role = 'frontend'
  },
  [pscustomobject]@{
    Key = 'overlay'
    Label = 'Overlay'
    Command = 'npm run dev:overlay'
    WindowTitle = 'AI Wasteland Survival v2 - Overlay'
    Description = 'OBS 叠层界面'
    Role = 'frontend'
  },
  [pscustomobject]@{
    Key = 'viewer'
    Label = '用户端'
    Command = 'npm run dev:viewer'
    WindowTitle = 'AI Wasteland Survival v2 - 用户端'
    Description = '观众创建与查看页面'
    Role = 'frontend'
  },
  [pscustomobject]@{
    Key = 'admin'
    Label = '管理端'
    Command = 'npm run dev:admin'
    WindowTitle = 'AI Wasteland Survival v2 - 管理端'
    Description = '平台管理控制台'
    Role = 'frontend'
  }
)

$serviceState = @{}
foreach ($service in $serviceDefinitions) {
  $serviceState[$service.Key] = [pscustomobject]@{
    Definition = $service
    Process = $null
    Status = '已停止'
  }
}

$ui = @{}

function Test-ServiceRunning {
  param([string]$Key)
  $state = $serviceState[$Key]
  return $null -ne $state.Process -and -not $state.Process.HasExited
}

function Update-ServiceUi {
  param([string]$Key)

  $state = $serviceState[$Key]
  $widgets = $ui[$Key]
  $running = Test-ServiceRunning -Key $Key

  if ($running) {
    $state.Status = '运行中'
    $widgets.Status.Text = '运行中'
    $widgets.Status.BackColor = [System.Drawing.Color]::FromArgb(54, 93, 60)
    $widgets.Status.ForeColor = [System.Drawing.Color]::White
    $widgets.Start.Enabled = $false
    $widgets.Stop.Enabled = $true
    return
  }

  if ($null -ne $state.Process -and $state.Process.HasExited) {
    $state.Process = $null
    $state.Status = '已停止'
  }

  $widgets.Status.Text = $state.Status
  $widgets.Status.BackColor = [System.Drawing.Color]::FromArgb(70, 70, 70)
  $widgets.Status.ForeColor = [System.Drawing.Color]::White
  $widgets.Start.Enabled = $true
  $widgets.Stop.Enabled = $false
}

function Refresh-AllServiceUi {
  foreach ($service in $serviceDefinitions) {
    Update-ServiceUi -Key $service.Key
  }
}

function Start-ServiceWindow {
  param([string]$Key)

  if (Test-ServiceRunning -Key $Key) {
    return
  }

  $state = $serviceState[$Key]
  $definition = $state.Definition
  $rootLiteral = $repoRoot.Replace("'", "''")
  $titleLiteral = $definition.WindowTitle.Replace("'", "''")
  $sharedEnv = "`$env:VITE_BACKEND_TARGET = '$backendTarget'; "
  $backendEnv = if ($definition.Role -eq 'backend') { "`$env:PORT = '$backendPort'; " } else { '' }
  $command = "`$Host.UI.RawUI.WindowTitle = '$titleLiteral'; $backendEnv$sharedEnv Set-Location -LiteralPath '$rootLiteral'; $($definition.Command)"

  try {
    $state.Process = Start-Process -FilePath 'powershell.exe' -WindowStyle Normal -WorkingDirectory $repoRoot -ArgumentList @(
      '-NoLogo',
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-Command',
      $command
    ) -PassThru
    $state.Status = '运行中'
  } catch {
    $state.Process = $null
    $state.Status = '启动失败'
    [System.Windows.Forms.MessageBox]::Show(
      "无法启动 $($definition.Label)：$($_.Exception.Message)",
      '启动失败',
      [System.Windows.Forms.MessageBoxButtons]::OK,
      [System.Windows.Forms.MessageBoxIcon]::Error
    ) | Out-Null
  }

  Update-ServiceUi -Key $Key
}

function Stop-ServiceWindow {
  param([string]$Key)

  $state = $serviceState[$Key]
  if ($null -eq $state.Process) {
    Update-ServiceUi -Key $Key
    return
  }

  try {
    if (-not $state.Process.HasExited) {
      & taskkill.exe /PID $state.Process.Id /T /F | Out-Null
    }
  } catch {
    # 终止窗口时忽略常见的竞态错误。
  }

  $state.Process = $null
  $state.Status = '已停止'
  Update-ServiceUi -Key $Key
}

function Stop-AllServiceWindow {
  foreach ($service in $serviceDefinitions) {
    Stop-ServiceWindow -Key $service.Key
  }
}

function New-StatusBadge {
  param(
    [string]$Text,
    [int]$Width
  )

  $label = New-Object System.Windows.Forms.Label
  $label.Text = $Text
  $label.AutoSize = $false
  $label.Width = $Width
  $label.Height = 30
  $label.TextAlign = [System.Drawing.ContentAlignment]::MiddleCenter
  $label.Font = New-Object System.Drawing.Font('Microsoft YaHei UI', 9, [System.Drawing.FontStyle]::Bold)
  $label.Padding = New-Object System.Windows.Forms.Padding(6, 4, 6, 4)
  return $label
}

$form = New-Object System.Windows.Forms.Form
$form.Text = 'AI Wasteland Run 启动器'
$form.StartPosition = 'CenterScreen'
$form.Size = New-Object System.Drawing.Size(1100, 560)
$form.MinimumSize = New-Object System.Drawing.Size(980, 520)
$form.BackColor = [System.Drawing.Color]::FromArgb(24, 22, 20)
$form.ForeColor = [System.Drawing.Color]::Gainsboro
$form.Font = New-Object System.Drawing.Font('Microsoft YaHei UI', 9.5)

$header = New-Object System.Windows.Forms.Panel
$header.Dock = 'Top'
$header.Height = 92
$header.Padding = New-Object System.Windows.Forms.Padding(16, 14, 16, 10)
$header.BackColor = [System.Drawing.Color]::FromArgb(36, 32, 28)
$form.Controls.Add($header)

$title = New-Object System.Windows.Forms.Label
$title.AutoSize = $true
$title.Text = 'AI Wasteland Survival v2 - 窗口启动器'
$title.Font = New-Object System.Drawing.Font('Microsoft YaHei UI', 16, [System.Drawing.FontStyle]::Bold)
$title.Location = New-Object System.Drawing.Point(16, 12)
$header.Controls.Add($title)

$subtitle = New-Object System.Windows.Forms.Label
$subtitle.AutoSize = $true
$subtitle.Text = '每个服务都会在独立窗口启动。你可以单独启动、单独关闭，或一键全部启动/关闭。'
$subtitle.Location = New-Object System.Drawing.Point(18, 48)
$subtitle.ForeColor = [System.Drawing.Color]::FromArgb(205, 195, 182)
$header.Controls.Add($subtitle)

$actions = New-Object System.Windows.Forms.FlowLayoutPanel
$actions.Dock = 'Right'
$actions.Width = 370
$actions.FlowDirection = 'LeftToRight'
$actions.WrapContents = $false
$actions.Padding = New-Object System.Windows.Forms.Padding(0, 6, 0, 0)
$header.Controls.Add($actions)

function New-TopButton {
  param([string]$Text)
  $button = New-Object System.Windows.Forms.Button
  $button.Text = $Text
  $button.Width = 110
  $button.Height = 34
  $button.FlatStyle = 'Flat'
  $button.BackColor = [System.Drawing.Color]::FromArgb(63, 58, 54)
  $button.ForeColor = [System.Drawing.Color]::White
  return $button
}

$startAllButton = New-TopButton -Text '全部启动'
$stopAllButton = New-TopButton -Text '全部关闭'
$refreshButton = New-TopButton -Text '刷新状态'
$openReadmeButton = New-TopButton -Text '打开说明'

$actions.Controls.AddRange(@($startAllButton, $stopAllButton, $refreshButton, $openReadmeButton))

$body = New-Object System.Windows.Forms.TableLayoutPanel
$body.Dock = 'Fill'
$body.Padding = New-Object System.Windows.Forms.Padding(16, 12, 16, 16)
$body.ColumnCount = 5
$body.RowCount = $serviceDefinitions.Count + 1
$body.BackColor = [System.Drawing.Color]::FromArgb(24, 22, 20)
[void]$body.ColumnStyles.Add((New-Object System.Windows.Forms.ColumnStyle([System.Windows.Forms.SizeType]::Absolute, 160)))
[void]$body.ColumnStyles.Add((New-Object System.Windows.Forms.ColumnStyle([System.Windows.Forms.SizeType]::Percent, 100)))
[void]$body.ColumnStyles.Add((New-Object System.Windows.Forms.ColumnStyle([System.Windows.Forms.SizeType]::Absolute, 120)))
[void]$body.ColumnStyles.Add((New-Object System.Windows.Forms.ColumnStyle([System.Windows.Forms.SizeType]::Absolute, 110)))
[void]$body.ColumnStyles.Add((New-Object System.Windows.Forms.ColumnStyle([System.Windows.Forms.SizeType]::Absolute, 110)))
$form.Controls.Add($body)

function Add-HeaderCell {
  param([string]$Text)
  $label = New-Object System.Windows.Forms.Label
  $label.Text = $Text
  $label.Dock = 'Fill'
  $label.TextAlign = [System.Drawing.ContentAlignment]::MiddleLeft
  $label.Font = New-Object System.Drawing.Font('Microsoft YaHei UI', 10, [System.Drawing.FontStyle]::Bold)
  $label.ForeColor = [System.Drawing.Color]::FromArgb(236, 220, 196)
  $label.Padding = New-Object System.Windows.Forms.Padding(4, 6, 4, 6)
  return $label
}

$body.Controls.Add((Add-HeaderCell -Text '服务'), 0, 0)
$body.Controls.Add((Add-HeaderCell -Text '命令'), 1, 0)
$body.Controls.Add((Add-HeaderCell -Text '状态'), 2, 0)
$body.Controls.Add((Add-HeaderCell -Text '启动'), 3, 0)
$body.Controls.Add((Add-HeaderCell -Text '关闭'), 4, 0)

for ($index = 0; $index -lt $serviceDefinitions.Count; $index++) {
  $definition = $serviceDefinitions[$index]
  $row = $index + 1

  $nameLabel = New-Object System.Windows.Forms.Label
  $nameLabel.Text = $definition.Label
  $nameLabel.Dock = 'Fill'
  $nameLabel.TextAlign = [System.Drawing.ContentAlignment]::MiddleLeft
  $nameLabel.Padding = New-Object System.Windows.Forms.Padding(4, 8, 4, 8)

  $commandLabel = New-Object System.Windows.Forms.Label
  $commandLabel.Text = $definition.Command
  $commandLabel.Dock = 'Fill'
  $commandLabel.TextAlign = [System.Drawing.ContentAlignment]::MiddleLeft
  $commandLabel.Padding = New-Object System.Windows.Forms.Padding(4, 8, 4, 8)
  $commandLabel.ForeColor = [System.Drawing.Color]::FromArgb(214, 200, 184)

  $statusLabel = New-StatusBadge -Text '已停止' -Width 100
  $statusLabel.Anchor = 'Left'

  $startButton = New-Object System.Windows.Forms.Button
  $startButton.Text = '启动'
  $startButton.Dock = 'Fill'
  $startButton.FlatStyle = 'Flat'
  $startButton.BackColor = [System.Drawing.Color]::FromArgb(87, 112, 77)
  $startButton.ForeColor = [System.Drawing.Color]::White

  $stopButton = New-Object System.Windows.Forms.Button
  $stopButton.Text = '关闭'
  $stopButton.Dock = 'Fill'
  $stopButton.FlatStyle = 'Flat'
  $stopButton.BackColor = [System.Drawing.Color]::FromArgb(122, 66, 55)
  $stopButton.ForeColor = [System.Drawing.Color]::White

  $key = $definition.Key
  $startButton.Add_Click({ Start-ServiceWindow -Key $key }.GetNewClosure())
  $stopButton.Add_Click({ Stop-ServiceWindow -Key $key }.GetNewClosure())

  $body.Controls.Add($nameLabel, 0, $row)
  $body.Controls.Add($commandLabel, 1, $row)
  $body.Controls.Add($statusLabel, 2, $row)
  $body.Controls.Add($startButton, 3, $row)
  $body.Controls.Add($stopButton, 4, $row)

  $ui[$definition.Key] = [pscustomobject]@{
    Status = $statusLabel
    Start = $startButton
    Stop = $stopButton
  }
}

$footer = New-Object System.Windows.Forms.Panel
$footer.Dock = 'Bottom'
$footer.Height = 34
$footer.BackColor = [System.Drawing.Color]::FromArgb(30, 28, 25)
$footer.Padding = New-Object System.Windows.Forms.Padding(16, 6, 16, 6)
$form.Controls.Add($footer)

$footerLabel = New-Object System.Windows.Forms.Label
$footerLabel.Dock = 'Fill'
$footerLabel.Text = "项目根目录：$repoRoot  |  后端端口：$backendPort"
$footerLabel.ForeColor = [System.Drawing.Color]::FromArgb(190, 180, 170)
$footer.Controls.Add($footerLabel)

$startAllButton.Add_Click({
  foreach ($service in $serviceDefinitions) {
    Start-ServiceWindow -Key $service.Key
  }
})

$stopAllButton.Add_Click({
  Stop-AllServiceWindow
})

$refreshButton.Add_Click({
  Refresh-AllServiceUi
})

$openReadmeButton.Add_Click({
  $readmePath = Join-Path $PSScriptRoot 'README.md'
  Invoke-Item $readmePath
})

$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 700
$timer.Add_Tick({ Refresh-AllServiceUi })
$timer.Start()

$form.Add_Shown({ Refresh-AllServiceUi })
$form.Add_FormClosing({
  $running = $serviceDefinitions | Where-Object { Test-ServiceRunning -Key $_.Key }
  if ($running.Count -eq 0) {
    return
  }

  $result = [System.Windows.Forms.MessageBox]::Show(
    '还有服务正在运行，关闭启动器时是否同时关闭所有已启动窗口？',
    '确认退出',
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

[System.Windows.Forms.Application]::EnableVisualStyles()
[System.Windows.Forms.Application]::Run($form)
