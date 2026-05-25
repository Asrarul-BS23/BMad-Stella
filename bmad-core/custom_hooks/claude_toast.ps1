param(
    [string]$Title = "Claude Code",
    [string]$Message = "",
    [string]$Cwd = "",
    [string]$Tag = "claude-notification"
)

$log = "$env:USERPROFILE\.claude\custom_hooks\claude_hook_debug.log"

# Register ClaudeCode AUMID once so toast header shows "Claude Code" not "Windows PowerShell"
$regPath = "HKCU:\SOFTWARE\Classes\AppUserModelId\ClaudeCode"
if (-not (Test-Path $regPath)) {
    try {
        New-Item -Path $regPath -Force | Out-Null
        New-ItemProperty -Path $regPath -Name "DisplayName" -Value "Claude Code" -PropertyType String -Force | Out-Null
        New-ItemProperty -Path $regPath -Name "IconUri"     -Value ""           -PropertyType String -Force | Out-Null
    } catch {
        "$(Get-Date) [aumid-error] $_" | Out-File $log -Append
    }
}

$titleLine = if ($Cwd) { Split-Path $Cwd -Leaf } else { $Title }

try {
    [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
    [Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] | Out-Null

    $template = @"
<toast duration="short">
    <visual>
        <binding template="ToastGeneric">
            <text>$titleLine</text>
            <text>$Message</text>
        </binding>
    </visual>
    <audio silent="true"/>
</toast>
"@

    $xml = New-Object Windows.Data.Xml.Dom.XmlDocument
    $xml.LoadXml($template)
    $toast       = New-Object Windows.UI.Notifications.ToastNotification $xml
    $toast.Tag   = $Tag
    $toast.Group = "claude"

    [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier("ClaudeCode").Show($toast)
} catch {
    "$(Get-Date) [toast-error] $_" | Out-File $log -Append
}
