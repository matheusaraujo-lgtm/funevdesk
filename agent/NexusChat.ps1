param(
  [string]$ConfigPath = "$PSScriptRoot\config.json"
)

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$config = Get-Content -LiteralPath $ConfigPath -Raw | ConvertFrom-Json
$headers = @{ "x-agent-token" = $config.agentToken }
$script:selectedTicket = $null

function Invoke-NexusApi {
  param([string]$Method, [string]$Path, $Body)
  $arguments = @{
    Method = $Method
    Uri = "$($config.serverUrl)$Path"
    Headers = $headers
    ContentType = "application/json"
  }
  if ($null -ne $Body) { $arguments.Body = ($Body | ConvertTo-Json) }
  return Invoke-RestMethod @arguments
}

$form = New-Object System.Windows.Forms.Form
$form.Text = "FunevDesk - Suporte"
$form.Size = New-Object System.Drawing.Size(760, 540)
$form.StartPosition = "CenterScreen"
$form.Font = New-Object System.Drawing.Font("Segoe UI", 9)

$tickets = New-Object System.Windows.Forms.ListBox
$tickets.Location = New-Object System.Drawing.Point(12, 12)
$tickets.Size = New-Object System.Drawing.Size(240, 430)
$form.Controls.Add($tickets)

$conversation = New-Object System.Windows.Forms.TextBox
$conversation.Location = New-Object System.Drawing.Point(264, 12)
$conversation.Size = New-Object System.Drawing.Size(468, 375)
$conversation.Multiline = $true
$conversation.ReadOnly = $true
$conversation.ScrollBars = "Vertical"
$form.Controls.Add($conversation)

$message = New-Object System.Windows.Forms.TextBox
$message.Location = New-Object System.Drawing.Point(264, 399)
$message.Size = New-Object System.Drawing.Size(370, 42)
$message.Multiline = $true
$form.Controls.Add($message)

$send = New-Object System.Windows.Forms.Button
$send.Text = "Enviar"
$send.Location = New-Object System.Drawing.Point(642, 399)
$send.Size = New-Object System.Drawing.Size(90, 42)
$form.Controls.Add($send)

$newTicket = New-Object System.Windows.Forms.Button
$newTicket.Text = "Abrir chamado"
$newTicket.Location = New-Object System.Drawing.Point(12, 452)
$newTicket.Size = New-Object System.Drawing.Size(120, 34)
$form.Controls.Add($newTicket)

$refresh = New-Object System.Windows.Forms.Button
$refresh.Text = "Atualizar"
$refresh.Location = New-Object System.Drawing.Point(142, 452)
$refresh.Size = New-Object System.Drawing.Size(110, 34)
$form.Controls.Add($refresh)

function Update-Tickets {
  try {
    $result = Invoke-NexusApi -Method Get -Path "/api/agent/tickets" -Body $null
    $tickets.Items.Clear()
    foreach ($ticket in $result.tickets) {
      $item = [PSCustomObject]@{ Id = $ticket.id; Label = "#$($ticket.number) - $($ticket.title)" }
      $item.PSObject.TypeNames.Insert(0, "NexusTicket")
      $tickets.Items.Add($item) | Out-Null
    }
    $tickets.DisplayMember = "Label"
  } catch {
    $conversation.Text = "Não foi possível conectar ao servidor.`r`n$($_.Exception.Message)"
  }
}

function Update-Messages {
  if (-not $script:selectedTicket) { return }
  try {
    $result = Invoke-NexusApi -Method Get -Path "/api/agent/tickets/$($script:selectedTicket.Id)/messages" -Body $null
    $lines = foreach ($item in $result.messages) {
      "[$([datetime]$item.created_at).ToLocalTime().ToString('dd/MM HH:mm')] $($item.sender_name):`r`n$($item.body)`r`n"
    }
    $conversation.Text = $lines -join "`r`n"
    $conversation.SelectionStart = $conversation.Text.Length
    $conversation.ScrollToCaret()
  } catch {}
}

$tickets.Add_SelectedIndexChanged({
  $script:selectedTicket = $tickets.SelectedItem
  Update-Messages
})

$send.Add_Click({
  if ($script:selectedTicket -and -not [string]::IsNullOrWhiteSpace($message.Text)) {
    Invoke-NexusApi -Method Post -Path "/api/agent/tickets/$($script:selectedTicket.Id)/messages" -Body @{ body = $message.Text } | Out-Null
    $message.Clear()
    Update-Messages
  }
})

$newTicket.Add_Click({
  $dialog = New-Object System.Windows.Forms.Form
  $dialog.Text = "Abrir chamado"
  $dialog.Size = New-Object System.Drawing.Size(470, 360)
  $dialog.StartPosition = "CenterParent"
  $title = New-Object System.Windows.Forms.TextBox
  $title.Location = New-Object System.Drawing.Point(15, 35)
  $title.Size = New-Object System.Drawing.Size(420, 25)
  $details = New-Object System.Windows.Forms.TextBox
  $details.Location = New-Object System.Drawing.Point(15, 90)
  $details.Size = New-Object System.Drawing.Size(420, 150)
  $details.Multiline = $true
  $save = New-Object System.Windows.Forms.Button
  $save.Text = "Enviar chamado"
  $save.Location = New-Object System.Drawing.Point(300, 260)
  $save.Size = New-Object System.Drawing.Size(135, 35)
  $dialog.Controls.AddRange(@($title, $details, $save))
  $save.Add_Click({
    if ($title.Text.Length -ge 5 -and $details.Text.Length -ge 5) {
      Invoke-NexusApi -Method Post -Path "/api/agent/tickets" -Body @{
        title = $title.Text; description = $details.Text; category = "Suporte";
        kind = "INCIDENTE"; priority = "MEDIA"
      } | Out-Null
      $dialog.Close()
      Update-Tickets
    }
  })
  $dialog.ShowDialog($form) | Out-Null
})

$refresh.Add_Click({ Update-Tickets; Update-Messages })
$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = [int]$config.chatPollSeconds * 1000
$timer.Add_Tick({ Update-Tickets; Update-Messages })
$timer.Start()
Update-Tickets
[void]$form.ShowDialog()
