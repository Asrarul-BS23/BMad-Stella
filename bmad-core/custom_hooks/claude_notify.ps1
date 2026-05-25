$json = [Console]::In.ReadToEnd() | ConvertFrom-Json
$log  = "$env:USERPROFILE\.claude\custom_hooks\claude_hook_debug.log"

"$(Get-Date) [Notification] $($json | ConvertTo-Json -Compress)" | Out-File $log -Append

$script = "$env:USERPROFILE\.claude\custom_hooks\claude_toast.ps1"
$cwd    = ($json.cwd -replace '"', "'")

switch ($json.notification_type) {
    'permission_prompt' {
        [System.Media.SystemSounds]::Beep.Play()
        Start-Process powershell -WindowStyle Hidden -ArgumentList "-NoProfile -NonInteractive -File `"$script`" -Title `"Claude Code`" -Message `"Waiting for Your Input`" -Cwd `"$cwd`" -Tag `"claude-status`""
    }
    'idle_prompt' {
        [System.Media.SystemSounds]::Beep.Play()
        Start-Process powershell -WindowStyle Hidden -ArgumentList "-NoProfile -NonInteractive -File `"$script`" -Title `"Claude Code`" -Message `"Waiting for Answer`" -Cwd `"$cwd`" -Tag `"claude-status`""
    }
    'push_notification' {
        $msg = ($json.message -replace '"', "'")
        Start-Process powershell -WindowStyle Hidden -ArgumentList "-NoProfile -NonInteractive -File `"$script`" -Title `"Claude Code`" -Message `"$msg`" -Cwd `"$cwd`" -Tag `"claude-push`""
    }
    default {
        $msg = if ($json.message) { ($json.message -replace '"', "'") } else { "Notification" }
        Start-Process powershell -WindowStyle Hidden -ArgumentList "-NoProfile -NonInteractive -File `"$script`" -Title `"Claude Code`" -Message `"$msg`" -Cwd `"$cwd`" -Tag `"claude-push`""
    }
}
