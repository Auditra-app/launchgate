' ==============================================================================
' LaunchGate Silent Background Launcher
' Zero-Friction 1-Click Desktop Launcher for LaunchGate Command Center
' ==============================================================================

Option Explicit

Dim WshShell, fso, scriptDir, serverScript, isRunning, i

Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

' Get project root directory where this script lives
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
serverScript = scriptDir & "\server.js"

' Ensure working directory is the project directory
WshShell.CurrentDirectory = scriptDir

' Function to check if LaunchGate server is already active on port 4545
Function CheckServerHealth()
    On Error Resume Next
    Dim xmlHttp
    CheckServerHealth = False
    Set xmlHttp = CreateObject("MSXML2.ServerXMLHTTP.6.0")
    If Err.Number <> 0 Then
        Err.Clear
        Set xmlHttp = CreateObject("MSXML2.ServerXMLHTTP")
    End If
    
    xmlHttp.setTimeouts 400, 400, 400, 400
    xmlHttp.open "GET", "http://localhost:4545/api/system/health", False
    xmlHttp.send
    
    If Err.Number = 0 Then
        If xmlHttp.status = 200 Then
            CheckServerHealth = True
        End If
    End If
    Set xmlHttp = Nothing
    On Error GoTo 0
End Function

' Subroutine to launch node server in background completely hidden (0 black window)
Sub StartBackgroundServer()
    On Error Resume Next
    Dim objWMIService, objProcessStartup, intProcessID, cmd
    Set objWMIService = GetObject("winmgmts:\\.\root\cimv2")
    Set objProcessStartup = objWMIService.Get("Win32_ProcessStartup").SpawnInstance_
    objProcessStartup.ShowWindow = 0 ' 0 = SW_HIDE (No console window)
    
    cmd = "cmd.exe /c node """ & serverScript & """"
    objWMIService.Get("Win32_Process").Create cmd, scriptDir, objProcessStartup, intProcessID
    
    If Err.Number <> 0 Then
        Err.Clear
        ' Fallback using WshShell hidden mode
        WshShell.Run "cmd.exe /c node """ & serverScript & """", 0, False
    End If
    On Error GoTo 0
End Sub

' 1. Check if server is already running
isRunning = CheckServerHealth()

If Not isRunning Then
    ' 2. Server is not running: launch completely hidden in background
    StartBackgroundServer()

    ' 3. Wait until server responds (poll every 250ms, up to 10 seconds)
    For i = 1 To 40
        WScript.Sleep 250
        If CheckServerHealth() Then
            Exit For
        End If
    Next
End If

' 4. Open dashboard in default browser
WshShell.Run "http://localhost:4545", 1, False

Set WshShell = Nothing
Set fso = Nothing
