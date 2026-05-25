$json = [Console]::In.ReadToEnd() | ConvertFrom-Json
$log  = "$env:USERPROFILE\.claude\custom_hooks\claude_hook_debug.log"

"$(Get-Date) [Stop] $($json | ConvertTo-Json -Compress)" | Out-File $log -Append

$script = "$env:USERPROFILE\.claude\custom_hooks\claude_toast.ps1"
$cwd    = ($json.cwd -replace '"', "'")

Start-Process powershell -WindowStyle Hidden -ArgumentList "-NoProfile -NonInteractive -File `"$script`" -Title `"Claude Code`" -Message `"Done`" -Cwd `"$cwd`" -Tag `"claude-status`""
